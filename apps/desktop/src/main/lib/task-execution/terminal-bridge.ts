import { EventEmitter } from "node:events";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import * as pty from "node-pty";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;
const DEFAULT_SCROLLBACK = 10000;

interface TaskTerminalSession {
	taskId: string;
	pty: pty.IPty;
	headless: HeadlessTerminal;
	serializer: SerializeAddon;
	isAlive: boolean;
	startTime: number;
}

/**
 * Manages PTY sessions for task execution.
 * Provides interactive terminal access to running Claude processes.
 */
class TaskTerminalBridge extends EventEmitter {
	private sessions = new Map<string, TaskTerminalSession>();

	/**
	 * Create a new terminal session for a task
	 * @param shellCommand - Optional shell command to run (spawns shell with -l -c "command")
	 */
	createSession({
		taskId,
		workingDir,
		cols = DEFAULT_COLS,
		rows = DEFAULT_ROWS,
		shellCommand,
	}: {
		taskId: string;
		workingDir: string;
		cols?: number;
		rows?: number;
		/** Command to run via shell -l -c "command". If not provided, spawns interactive shell. */
		shellCommand?: string;
	}): string {
		// Clean up existing session if any
		if (this.sessions.has(taskId)) {
			this.killSession(taskId);
		}

		// Create headless terminal for scrollback
		const headless = new HeadlessTerminal({
			cols,
			rows,
			scrollback: DEFAULT_SCROLLBACK,
			allowProposedApi: true,
		});

		const serializer = new SerializeAddon();
		headless.loadAddon(
			serializer as unknown as Parameters<typeof headless.loadAddon>[0],
		);

		// Build environment - inherit from process and add terminal vars
		const env: Record<string, string> = {
			...process.env,
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			LANG: process.env.LANG || "en_US.UTF-8",
		} as Record<string, string>;

		// Get user's shell
		const shell = process.env.SHELL || "/bin/zsh";

		// Spawn PTY
		let ptyProcess: pty.IPty;
		if (shellCommand) {
			// Run command via login shell with -c
			// -l: login shell (loads .zshrc/.bashrc for PATH, etc.)
			// -c: run command and exit
			// Note: Don't use -i (interactive) as it can cause hangs
			console.log(
				`[task-terminal] Spawning: ${shell} -l -c "${shellCommand}"`,
			);
			ptyProcess = pty.spawn(shell, ["-l", "-c", shellCommand], {
				name: "xterm-256color",
				cols,
				rows,
				cwd: workingDir,
				env,
			});
		} else {
			// Spawn interactive shell
			ptyProcess = pty.spawn(shell, ["-l"], {
				name: "xterm-256color",
				cols,
				rows,
				cwd: workingDir,
				env,
			});
		}

		// Create session
		const session: TaskTerminalSession = {
			taskId,
			pty: ptyProcess,
			headless,
			serializer,
			isAlive: true,
			startTime: Date.now(),
		};

		// Handle PTY data
		ptyProcess.onData((data: string) => {
			console.log(`[task-terminal] Data from ${taskId}:`, data.substring(0, 100));
			// Write to headless for scrollback
			headless.write(data);

			// Emit for live streaming
			this.emit("data", taskId, data);
		});

		// Handle PTY exit
		ptyProcess.onExit(({ exitCode, signal }) => {
			console.log(`[task-terminal] Exit for ${taskId}: code=${exitCode}, signal=${signal}`);
			session.isAlive = false;
			this.emit("exit", taskId, exitCode, signal);
		});

		this.sessions.set(taskId, session);

		return taskId;
	}

	/**
	 * Get session info for attachment
	 */
	attach(taskId: string): { scrollback: string; isAlive: boolean } | null {
		const session = this.sessions.get(taskId);
		if (!session) {
			return null;
		}

		return {
			scrollback: session.serializer.serialize(),
			isAlive: session.isAlive,
		};
	}

	/**
	 * Write data to the PTY (user input)
	 */
	write(taskId: string, data: string): boolean {
		const session = this.sessions.get(taskId);
		if (!session || !session.isAlive) {
			return false;
		}

		session.pty.write(data);
		return true;
	}

	/**
	 * Resize the PTY
	 */
	resize(taskId: string, cols: number, rows: number): boolean {
		const session = this.sessions.get(taskId);
		if (!session || !session.isAlive) {
			return false;
		}

		session.pty.resize(cols, rows);
		session.headless.resize(cols, rows);
		return true;
	}

	/**
	 * Kill a terminal session
	 */
	killSession(taskId: string): void {
		const session = this.sessions.get(taskId);
		if (!session) {
			return;
		}

		session.isAlive = false;

		// Kill PTY process
		try {
			session.pty.kill();
		} catch (error) {
			console.error(`[task-terminal] Failed to kill PTY for ${taskId}:`, error);
		}

		// Dispose headless terminal
		try {
			session.headless.dispose();
		} catch (error) {
			console.error(
				`[task-terminal] Failed to dispose headless for ${taskId}:`,
				error,
			);
		}

		this.sessions.delete(taskId);
	}

	/**
	 * Check if a session exists and is alive
	 */
	isAlive(taskId: string): boolean {
		const session = this.sessions.get(taskId);
		return session?.isAlive ?? false;
	}

	/**
	 * Get all active session IDs
	 */
	getActiveSessions(): string[] {
		return Array.from(this.sessions.entries())
			.filter(([_, session]) => session.isAlive)
			.map(([taskId]) => taskId);
	}

	/**
	 * Kill all sessions (for cleanup)
	 */
	killAll(): void {
		for (const taskId of this.sessions.keys()) {
			this.killSession(taskId);
		}
	}
}

/** Singleton instance */
export const taskTerminalBridge = new TaskTerminalBridge();
