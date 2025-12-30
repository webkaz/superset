import { isAbsolute, join, normalize } from "node:path";
import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/** Type for worktree record returned from localDb */
export type WorktreeRecord = typeof worktrees.$inferSelect;

/**
 * Validates that a worktreePath exists in localDb.worktrees.
 * This prevents arbitrary filesystem/git access by ensuring the path
 * is a known, registered worktree.
 *
 * SECURITY: This is THE critical check - prevents arbitrary filesystem access.
 * A compromised renderer cannot access files outside registered worktrees.
 *
 * @returns The worktree record from the database
 * @throws Error if worktreePath is not found in the database
 */
export function assertWorktreePathInDb(worktreePath: string): WorktreeRecord {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();

	if (!worktree) {
		throw new Error("Unauthorized: worktree path not found in database");
	}

	return worktree;
}

/**
 * Non-throwing version of assertWorktreePathInDb.
 * Returns true if the worktreePath exists in localDb.worktrees.
 */
export function validateWorktreePathInDb(worktreePath: string): boolean {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();
	return !!worktree;
}

/**
 * Simple path validation. Rejects absolute paths and paths containing "..".
 * Returns the resolved full path if valid.
 *
 * Note: We intentionally don't do symlink resolution. If a user puts symlinks
 * in their own repo, that's their business. The worktreePath validation above
 * is the security boundary.
 */
export function validateFilePath(
	worktreePath: string,
	filePath: string,
): { valid: true; fullPath: string } | { valid: false } {
	if (isAbsolute(filePath)) {
		return { valid: false };
	}

	const normalized = normalize(filePath);
	if (normalized.includes("..")) {
		return { valid: false };
	}

	return { valid: true, fullPath: join(worktreePath, normalized) };
}
