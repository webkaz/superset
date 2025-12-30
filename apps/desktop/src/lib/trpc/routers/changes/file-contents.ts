import { lstat, readFile, writeFile } from "node:fs/promises";
import type { FileContents } from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { validateFilePath, validateWorktreePathInDb } from "./security";
import { detectLanguage } from "./utils/parse-status";

/** Maximum file size for reading (2 MiB) */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Bytes to scan for binary detection */
const BINARY_CHECK_SIZE = 8192;

/**
 * Result type for readWorkingFile procedure
 */
type ReadWorkingFileResult =
	| { ok: true; content: string; truncated: boolean; byteLength: number }
	| {
			ok: false;
			reason: "not-found" | "too-large" | "binary" | "outside-worktree";
	  };

/**
 * Detects if a buffer contains binary content by checking for NUL bytes
 */
function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

export const createFileContentsRouter = () => {
	return router({
		getFileContents: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					oldPath: z.string().optional(),
					category: z.enum(["against-base", "committed", "staged", "unstaged"]),
					commitHash: z.string().optional(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				// SECURITY: Validate worktreePath exists in localDb to prevent arbitrary FS access
				if (!validateWorktreePathInDb(input.worktreePath)) {
					throw new Error(`Unauthorized: worktree path not found in database`);
				}

				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";
				const originalPath = input.oldPath || input.filePath;

				const { original, modified } = await getFileVersions(
					git,
					input.worktreePath,
					input.filePath,
					originalPath,
					input.category,
					defaultBranch,
					input.commitHash,
				);

				return {
					original,
					modified,
					language: detectLanguage(input.filePath),
				};
			}),

		saveFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					content: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				// SECURITY: Validate worktreePath exists in localDb to prevent arbitrary FS access
				if (!validateWorktreePathInDb(input.worktreePath)) {
					throw new Error(`Unauthorized: worktree path not found in database`);
				}

				// Validate path doesn't escape worktree
				const validation = validateFilePath(input.worktreePath, input.filePath);

				if (!validation.valid) {
					throw new Error("Invalid file path");
				}

				await writeFile(validation.fullPath, input.content, "utf-8");
				return { success: true };
			}),

		/**
		 * Read a working tree file safely with size cap and binary detection.
		 * Used for File Viewer raw/rendered modes.
		 * Follows DL-005 (path validation) and DL-008 (size/binary policy).
		 */
		readWorkingFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileResult> => {
				// SECURITY: Validate worktreePath exists in localDb to prevent arbitrary FS access
				if (!validateWorktreePathInDb(input.worktreePath)) {
					return { ok: false, reason: "outside-worktree" };
				}

				// Validate path doesn't escape worktree
				const validation = validateFilePath(input.worktreePath, input.filePath);

				if (!validation.valid) {
					return { ok: false, reason: "outside-worktree" };
				}

				const resolvedPath = validation.fullPath;

				// Check file size
				try {
					const stats = await lstat(resolvedPath);
					if (stats.size > MAX_FILE_SIZE) {
						return { ok: false, reason: "too-large" };
					}
				} catch {
					return { ok: false, reason: "not-found" };
				}

				// Read file content
				let buffer: Buffer;
				try {
					buffer = await readFile(resolvedPath);
				} catch {
					return { ok: false, reason: "not-found" };
				}

				// Check for binary content
				if (isBinaryContent(buffer)) {
					return { ok: false, reason: "binary" };
				}

				// Return content as string
				return {
					ok: true,
					content: buffer.toString("utf-8"),
					truncated: false,
					byteLength: buffer.length,
				};
			}),
	});
};

type DiffCategory = "against-base" | "committed" | "staged" | "unstaged";

interface FileVersions {
	original: string;
	modified: string;
}

async function getFileVersions(
	git: ReturnType<typeof simpleGit>,
	worktreePath: string,
	filePath: string,
	originalPath: string,
	category: DiffCategory,
	defaultBranch: string,
	commitHash?: string,
): Promise<FileVersions> {
	switch (category) {
		case "against-base":
			return getAgainstBaseVersions(git, filePath, originalPath, defaultBranch);

		case "committed":
			if (!commitHash) {
				throw new Error("commitHash required for committed category");
			}
			return getCommittedVersions(git, filePath, originalPath, commitHash);

		case "staged":
			return getStagedVersions(git, filePath, originalPath);

		case "unstaged":
			return getUnstagedVersions(git, worktreePath, filePath, originalPath);
	}
}

/** Helper to safely get git show content with size limit and memory protection */
async function safeGitShow(
	git: ReturnType<typeof simpleGit>,
	spec: string,
): Promise<string> {
	try {
		// Preflight: check blob size before loading into memory
		// This prevents memory spikes from large files in git history
		try {
			const sizeOutput = await git.raw(["cat-file", "-s", spec]);
			const blobSize = Number.parseInt(sizeOutput.trim(), 10);
			if (!Number.isNaN(blobSize) && blobSize > MAX_FILE_SIZE) {
				return `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {
			// cat-file failed (blob doesn't exist) - let git.show handle the error
		}

		const content = await git.show([spec]);
		return content;
	} catch {
		return "";
	}
}

async function getAgainstBaseVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	defaultBranch: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `origin/${defaultBranch}:${originalPath}`),
		safeGitShow(git, `HEAD:${filePath}`),
	]);

	return { original, modified };
}

async function getCommittedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	commitHash: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `${commitHash}^:${originalPath}`),
		safeGitShow(git, `${commitHash}:${filePath}`),
	]);

	return { original, modified };
}

async function getStagedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `HEAD:${originalPath}`),
		safeGitShow(git, `:0:${filePath}`),
	]);

	return { original, modified };
}

async function getUnstagedVersions(
	git: ReturnType<typeof simpleGit>,
	worktreePath: string,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	// Try staged version first, fall back to HEAD
	let original = await safeGitShow(git, `:0:${originalPath}`);
	if (!original) {
		original = await safeGitShow(git, `HEAD:${originalPath}`);
	}

	let modified = "";
	// Validate path before reading from filesystem
	const validation = validateFilePath(worktreePath, filePath);
	if (validation.valid) {
		try {
			// Check file size before reading
			const stats = await lstat(validation.fullPath);
			if (stats.size <= MAX_FILE_SIZE) {
				modified = await readFile(validation.fullPath, "utf-8");
			} else {
				modified = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {
			modified = "";
		}
	}

	return { original, modified };
}
