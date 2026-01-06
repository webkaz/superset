/**
 * Terminal Host Daemon Client
 *
 * Client library for the Electron main process to communicate with
 * the terminal host daemon. Handles:
 * - Daemon lifecycle (spawning if not running)
 * - Socket connection and reconnection
 * - Request/response framing
 * - Event streaming
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { connect, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import {
	type ClearScrollbackRequest,
	type CreateOrAttachRequest,
	type CreateOrAttachResponse,
	type DetachRequest,
	type EmptyResponse,
	type HelloResponse,
	type IpcEvent,
	type IpcResponse,
	type KillAllRequest,
	type KillRequest,
	type ListSessionsResponse,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type ShutdownRequest,
	type TerminalDataEvent,
	type TerminalErrorEvent,
	type TerminalExitEvent,
	type WriteRequest,
} from "./types";

// =============================================================================
// Connection State
// =============================================================================

enum ConnectionState {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
}

// =============================================================================
// Configuration
// =============================================================================

const DEBUG_CLIENT = process.env.SUPERSET_TERMINAL_DEBUG === "1";

const SUPERSET_DIR_NAME =
	process.env.NODE_ENV === "development" ? ".superset-dev" : ".superset";
const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

const SOCKET_PATH = join(SUPERSET_HOME_DIR, "terminal-host.sock");
const TOKEN_PATH = join(SUPERSET_HOME_DIR, "terminal-host.token");
const PID_PATH = join(SUPERSET_HOME_DIR, "terminal-host.pid");
const SPAWN_LOCK_PATH = join(SUPERSET_HOME_DIR, "terminal-host.spawn.lock");

// Connection timeouts
const CONNECT_TIMEOUT_MS = 5000;
const SPAWN_WAIT_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
const SPAWN_LOCK_TIMEOUT_MS = 10000; // Max time to hold spawn lock

// Queue limits
const MAX_NOTIFY_QUEUE_BYTES = 2_000_000; // 2MB cap to prevent OOM

// =============================================================================
// NDJSON Parser
// =============================================================================

class NdjsonParser {
	private remainder = "";

	parse(chunk: string): Array<IpcResponse | IpcEvent> {
		const messages: Array<IpcResponse | IpcEvent> = [];

		// Prepend any remainder from previous parse
		const data = this.remainder + chunk;
		this.remainder = "";

		let startIndex = 0;
		let newlineIndex = data.indexOf("\n");

		while (newlineIndex !== -1) {
			const line = data.slice(startIndex, newlineIndex);

			if (line.trim()) {
				try {
					messages.push(JSON.parse(line));
				} catch {
					console.warn("[TerminalHostClient] Failed to parse NDJSON line");
				}
			}

			startIndex = newlineIndex + 1;
			newlineIndex = data.indexOf("\n", startIndex);
		}

		// Save any remaining data after the last newline
		if (startIndex < data.length) {
			this.remainder = data.slice(startIndex);
		}

		return messages;
	}
}

// =============================================================================
// Pending Request Tracker
// =============================================================================

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeoutId: NodeJS.Timeout;
}

// =============================================================================
// TerminalHostClient
// =============================================================================

export interface TerminalHostClientEvents {
	data: (sessionId: string, data: string) => void;
	exit: (sessionId: string, exitCode: number, signal?: number) => void;
	/** Terminal-specific error (e.g., write queue full - paste dropped) */
	terminalError: (sessionId: string, error: string, code?: string) => void;
	connected: () => void;
	disconnected: () => void;
	error: (error: Error) => void;
}

/**
 * Client for communicating with the terminal host daemon.
 * Emits events for terminal data and exit.
 */
export class TerminalHostClient extends EventEmitter {
	private socket: Socket | null = null;
	private parser = new NdjsonParser();
	private pendingRequests = new Map<string, PendingRequest>();
	private requestCounter = 0;
	private authenticated = false;
	private connectionState = ConnectionState.DISCONNECTED;
	private disposed = false;
	private notifyQueue: string[] = [];
	private notifyQueueBytes = 0;
	private notifyDrainArmed = false;

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Ensure we have a connected, authenticated socket.
	 * Spawns daemon if needed.
	 */
	async ensureConnected(): Promise<void> {
		// Already connected - fast path (no logging to avoid noise on every API call)
		if (
			this.connectionState === ConnectionState.CONNECTED &&
			this.socket &&
			this.authenticated
		) {
			return;
		}

		// Another connection in progress - wait with timeout
		if (this.connectionState === ConnectionState.CONNECTING) {
			if (DEBUG_CLIENT) {
				console.log(
					"[TerminalHostClient] Connection already in progress, waiting...",
				);
			}
			return new Promise((resolve, reject) => {
				const startTime = Date.now();
				const WAIT_TIMEOUT_MS = 10000; // 10 seconds max wait

				const checkConnection = () => {
					if (
						this.connectionState === ConnectionState.CONNECTED &&
						this.socket &&
						this.authenticated
					) {
						resolve();
					} else if (this.connectionState === ConnectionState.DISCONNECTED) {
						reject(new Error("Connection failed while waiting"));
					} else if (Date.now() - startTime > WAIT_TIMEOUT_MS) {
						reject(
							new Error(
								"Timeout waiting for connection - daemon may be unresponsive",
							),
						);
					} else {
						setTimeout(checkConnection, 100);
					}
				};
				checkConnection();
			});
		}

		this.connectionState = ConnectionState.CONNECTING;
		if (DEBUG_CLIENT) {
			console.log("[TerminalHostClient] Connecting to daemon...");
		}

		try {
			// Try to connect to existing daemon
			let connected = await this.tryConnect();
			if (DEBUG_CLIENT) {
				console.log(
					`[TerminalHostClient] Initial connection attempt: ${connected ? "SUCCESS" : "FAILED"}`,
				);
			}

			if (!connected) {
				// Spawn daemon and retry
				if (DEBUG_CLIENT) {
					console.log("[TerminalHostClient] Spawning daemon...");
				}
				await this.spawnDaemon();
				connected = await this.tryConnect();
				if (DEBUG_CLIENT) {
					console.log(
						`[TerminalHostClient] Post-spawn connection attempt: ${connected ? "SUCCESS" : "FAILED"}`,
					);
				}

				if (!connected) {
					throw new Error("Failed to connect to daemon after spawn");
				}
			}

			// Authenticate
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Authenticating...");
			}
			await this.authenticate();
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Authentication successful!");
			}

			this.connectionState = ConnectionState.CONNECTED;
		} catch (error) {
			this.connectionState = ConnectionState.DISCONNECTED;
			throw error;
		}
	}

	/**
	 * Try to connect and authenticate to an existing daemon without spawning.
	 * Returns true if successfully connected and authenticated, false if no daemon running.
	 * This is useful for cleanup operations that should only act on existing daemons.
	 */
	async tryConnectAndAuthenticate(): Promise<boolean> {
		// Already connected and authenticated
		if (
			this.connectionState === ConnectionState.CONNECTED &&
			this.socket &&
			this.authenticated
		) {
			return true;
		}

		// Don't interfere with an in-progress connection
		if (this.connectionState === ConnectionState.CONNECTING) {
			return false;
		}

		this.connectionState = ConnectionState.CONNECTING;

		try {
			const connected = await this.tryConnect();
			if (!connected) {
				this.connectionState = ConnectionState.DISCONNECTED;
				return false;
			}

			await this.authenticate();
			this.connectionState = ConnectionState.CONNECTED;
			return true;
		} catch {
			this.connectionState = ConnectionState.DISCONNECTED;
			return false;
		}
	}

	/**
	 * Try to connect to the daemon socket.
	 * Returns true if connected, false if daemon not running.
	 */
	private async tryConnect(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!existsSync(SOCKET_PATH)) {
				resolve(false);
				return;
			}

			const socket = connect(SOCKET_PATH);
			let resolved = false;

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					socket.destroy();
					resolve(false);
				}
			}, CONNECT_TIMEOUT_MS);

			socket.on("connect", () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					this.socket = socket;
					this.setupSocketHandlers();
					resolve(true);
				}
			});

			socket.on("error", () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					resolve(false);
				}
			});
		});
	}

	/**
	 * Set up socket event handlers
	 */
	private setupSocketHandlers(): void {
		if (!this.socket) return;

		this.socket.setEncoding("utf-8");

		this.socket.on("data", (data: string) => {
			const messages = this.parser.parse(data);
			for (const message of messages) {
				this.handleMessage(message);
			}
		});

		this.socket.on("drain", () => {
			this.flushNotifyQueue();
		});

		this.socket.on("close", () => {
			this.handleDisconnect();
		});

		this.socket.on("error", (error) => {
			this.emit("error", error);
			this.handleDisconnect();
		});
	}

	/**
	 * Handle incoming message (response or event)
	 */
	private handleMessage(message: IpcResponse | IpcEvent): void {
		// Type guard: responses have 'id' field, events have 'type: event'
		if ("id" in message) {
			// Response to a request
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				clearTimeout(pending.timeoutId);

				if (message.ok) {
					pending.resolve(message.payload);
				} else {
					pending.reject(
						new Error(`${message.error.code}: ${message.error.message}`),
					);
				}
			}
		} else if (message.type === "event") {
			// Event from daemon - narrow payload based on type field
			const { sessionId, payload } = message;
			const eventPayload = payload as
				| TerminalDataEvent
				| TerminalExitEvent
				| TerminalErrorEvent;

			switch (eventPayload.type) {
				case "data":
					this.emit("data", sessionId, eventPayload.data);
					break;
				case "exit":
					this.emit(
						"exit",
						sessionId,
						eventPayload.exitCode,
						eventPayload.signal,
					);
					break;
				case "error":
					// Emit terminal-specific error so callers can handle it
					// This is critical for "Write queue full" - paste was silently dropped before!
					this.emit(
						"terminalError",
						sessionId,
						eventPayload.error,
						eventPayload.code,
					);
					break;
			}
		}
	}

	/**
	 * Handle socket disconnect
	 */
	private handleDisconnect(): void {
		this.socket = null;
		this.authenticated = false;
		this.connectionState = ConnectionState.DISCONNECTED;
		this.notifyQueue = [];
		this.notifyQueueBytes = 0;
		this.notifyDrainArmed = false;

		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error("Connection lost"));
			this.pendingRequests.delete(id);
		}

		this.emit("disconnected");
	}

	/**
	 * Authenticate with the daemon
	 */
	private async authenticate(): Promise<void> {
		if (!existsSync(TOKEN_PATH)) {
			throw new Error("Auth token not found - daemon may not be running");
		}

		const token = readFileSync(TOKEN_PATH, "utf-8").trim();

		const response = await this.sendRequest<HelloResponse>("hello", {
			token,
			protocolVersion: PROTOCOL_VERSION,
		});

		if (response.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error(
				`Protocol version mismatch: client=${PROTOCOL_VERSION}, daemon=${response.protocolVersion}`,
			);
		}

		this.authenticated = true;
		this.emit("connected");
	}

	// ===========================================================================
	// Daemon Spawning
	// ===========================================================================

	/**
	 * Check if there's an active daemon listening on the socket.
	 * Returns true if socket is live and responding.
	 */
	private isSocketLive(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!existsSync(SOCKET_PATH)) {
				resolve(false);
				return;
			}

			const testSocket = connect(SOCKET_PATH);
			const timeout = setTimeout(() => {
				testSocket.destroy();
				resolve(false);
			}, 1000);

			testSocket.on("connect", () => {
				clearTimeout(timeout);
				testSocket.destroy();
				resolve(true);
			});

			testSocket.on("error", () => {
				clearTimeout(timeout);
				resolve(false);
			});
		});
	}

	/**
	 * Acquire spawn lock to prevent concurrent daemon spawns.
	 * Returns true if lock acquired, false if another spawn is in progress.
	 */
	private acquireSpawnLock(): boolean {
		try {
			// Ensure superset home directory exists before any file operations
			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			// Check if lock exists and is recent (within timeout)
			if (existsSync(SPAWN_LOCK_PATH)) {
				const lockContent = readFileSync(SPAWN_LOCK_PATH, "utf-8").trim();
				const lockTime = Number.parseInt(lockContent, 10);
				if (
					!Number.isNaN(lockTime) &&
					Date.now() - lockTime < SPAWN_LOCK_TIMEOUT_MS
				) {
					// Lock is held by another process
					return false;
				}
				// Stale lock, remove it
				unlinkSync(SPAWN_LOCK_PATH);
			}

			// Create lock file with current timestamp
			writeFileSync(SPAWN_LOCK_PATH, String(Date.now()), { mode: 0o600 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Release spawn lock
	 */
	private releaseSpawnLock(): void {
		try {
			if (existsSync(SPAWN_LOCK_PATH)) {
				unlinkSync(SPAWN_LOCK_PATH);
			}
		} catch {
			// Best effort cleanup
		}
	}

	/**
	 * Spawn the daemon process if not running
	 */
	private async spawnDaemon(): Promise<void> {
		// Check if socket is live first - this is the authoritative check
		// PID file can be stale if daemon crashed and PID was reused by another process
		if (existsSync(SOCKET_PATH)) {
			const isLive = await this.isSocketLive();
			if (isLive) {
				if (DEBUG_CLIENT) {
					console.log("[TerminalHostClient] Socket is live, daemon is running");
				}
				return;
			}

			// Socket exists but not responsive - safe to remove
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Removing stale socket file");
			}
			try {
				unlinkSync(SOCKET_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Also clean up stale PID file if socket was not live
		// This handles the case where daemon crashed and PID was reused
		if (existsSync(PID_PATH)) {
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Removing stale PID file");
			}
			try {
				unlinkSync(PID_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Acquire spawn lock to prevent concurrent spawns
		if (!this.acquireSpawnLock()) {
			if (DEBUG_CLIENT) {
				console.log(
					"[TerminalHostClient] Another spawn in progress, waiting...",
				);
			}
			// Wait for the other spawn to complete
			await this.waitForDaemon();
			return;
		}

		try {
			// Get path to daemon script
			const daemonScript = this.getDaemonScriptPath();
			if (DEBUG_CLIENT) {
				console.log(`[TerminalHostClient] Daemon script path: ${daemonScript}`);
				console.log(
					`[TerminalHostClient] Script exists: ${existsSync(daemonScript)}`,
				);
			}

			if (!existsSync(daemonScript)) {
				throw new Error(`Daemon script not found: ${daemonScript}`);
			}

			if (DEBUG_CLIENT) {
				console.log(
					`[TerminalHostClient] Spawning daemon with execPath: ${process.execPath}`,
				);
			}

			// Open log file for daemon output (helps debug daemon-side issues)
			const logPath = join(SUPERSET_HOME_DIR, "daemon.log");
			let logFd: number;
			try {
				logFd = openSync(logPath, "a");
			} catch (error) {
				console.warn(
					`[TerminalHostClient] Failed to open daemon log file: ${error}`,
				);
				// Fall back to ignoring output if we can't open log file
				logFd = -1;
			}

			// Spawn daemon as detached process
			const child = spawn(process.execPath, [daemonScript], {
				detached: true,
				stdio: logFd >= 0 ? ["ignore", logFd, logFd] : "ignore",
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					NODE_ENV: process.env.NODE_ENV,
				},
			});

			if (DEBUG_CLIENT) {
				console.log(
					`[TerminalHostClient] Daemon spawned with PID: ${child.pid}`,
				);
			}

			// Unref to allow parent to exit independently
			child.unref();

			// Wait for daemon to start
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Waiting for daemon to start...");
			}
			await this.waitForDaemon();
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Daemon started successfully");
			}
		} finally {
			this.releaseSpawnLock();
		}
	}

	/**
	 * Get path to daemon script
	 */
	private getDaemonScriptPath(): string {
		if (app.isPackaged) {
			// Production: script is in app resources
			return join(app.getAppPath(), "dist", "main", "terminal-host.js");
		}

		// Development: electron-vite outputs to dist/main/
		const appPath = app.getAppPath();
		return join(appPath, "dist", "main", "terminal-host.js");
	}

	/**
	 * Wait for daemon to be ready
	 */
	private async waitForDaemon(): Promise<void> {
		const startTime = Date.now();

		while (Date.now() - startTime < SPAWN_WAIT_MS) {
			if (existsSync(SOCKET_PATH)) {
				// Give it a moment to start listening
				await this.sleep(200);
				return;
			}
			await this.sleep(100);
		}

		throw new Error("Daemon failed to start in time");
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// ===========================================================================
	// Request/Response
	// ===========================================================================

	/**
	 * Send a request to the daemon and wait for response
	 */
	private sendRequest<T>(type: string, payload: unknown): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (!this.socket) {
				reject(new Error("Not connected"));
				return;
			}

			const id = `req_${++this.requestCounter}`;

			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${type}`));
			}, REQUEST_TIMEOUT_MS);

			// Cast resolve to unknown handler - safe because response type matches T
			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeoutId,
			});

			const message = `${JSON.stringify({ id, type, payload })}\n`;
			this.socket.write(message);
		});
	}

	/**
	 * Send a notification (no pending request / no timeout).
	 *
	 * Used for high-frequency messages like terminal input, where request/response
	 * overhead can cause timeouts under load and drop data. The daemon may still
	 * send a response for compatibility, but this client will ignore it.
	 *
	 * Returns false if queue is full (caller should handle).
	 */
	private sendNotification(type: string, payload: unknown): boolean {
		if (!this.socket) return false;

		const id = `notify_${++this.requestCounter}`;
		const message = `${JSON.stringify({ id, type, payload })}\n`;
		const messageBytes = Buffer.byteLength(message, "utf8");

		// Check queue limit to prevent OOM under backpressure
		if (this.notifyQueueBytes + messageBytes > MAX_NOTIFY_QUEUE_BYTES) {
			return false;
		}

		// If we're already backpressured, just queue.
		if (this.notifyDrainArmed || this.notifyQueue.length > 0) {
			this.notifyQueue.push(message);
			this.notifyQueueBytes += messageBytes;
			return true;
		}

		const canWrite = this.socket.write(message);
		if (!canWrite) {
			// Message is queued internally by the socket; arm drain to flush any
			// subsequent notifications we enqueue.
			this.notifyDrainArmed = true;
		}
		return true;
	}

	private flushNotifyQueue(): void {
		if (!this.socket) return;
		if (!this.notifyDrainArmed && this.notifyQueue.length === 0) return;

		this.notifyDrainArmed = false;

		while (this.notifyQueue.length > 0) {
			const message = this.notifyQueue.shift();
			if (!message) break;
			this.notifyQueueBytes -= Buffer.byteLength(message, "utf8");

			const canWrite = this.socket.write(message);
			if (!canWrite) {
				this.notifyDrainArmed = true;
				return;
			}
		}
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Create or attach to a terminal session
	 */
	async createOrAttach(
		request: CreateOrAttachRequest,
	): Promise<CreateOrAttachResponse> {
		await this.ensureConnected();
		const response = await this.sendRequest<CreateOrAttachResponse>(
			"createOrAttach",
			request,
		);
		// Version skew: older daemons may not return pid - normalize undefined → null
		return { ...response, pid: response.pid ?? null };
	}

	/**
	 * Write data to a terminal session
	 */
	async write(request: WriteRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("write", request);
	}

	/**
	 * Write data without waiting for a response (best-effort, backpressured).
	 * Prevents large pastes from timing out and dropping chunks when the daemon
	 * is busy processing output.
	 */
	writeNoAck(request: WriteRequest): void {
		void this.ensureConnected()
			.then(() => {
				const sent = this.sendNotification("write", request);
				if (!sent) {
					// Queue full - notify the session so it can surface the error to the user
					this.emit(
						"terminalError",
						request.sessionId,
						"Write queue full - input dropped",
						"WRITE_QUEUE_FULL",
					);
				}
			})
			.catch((error) => {
				this.emit(
					"error",
					error instanceof Error ? error : new Error(String(error)),
				);
			});
	}

	/**
	 * Resize a terminal session
	 */
	async resize(request: ResizeRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("resize", request);
	}

	/**
	 * Detach from a terminal session
	 */
	async detach(request: DetachRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("detach", request);
	}

	/**
	 * Kill a terminal session
	 */
	async kill(request: KillRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("kill", request);
	}

	/**
	 * Kill all terminal sessions
	 */
	async killAll(request: KillAllRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("killAll", request);
	}

	/**
	 * List all sessions
	 */
	async listSessions(): Promise<ListSessionsResponse> {
		await this.ensureConnected();
		const response = await this.sendRequest<ListSessionsResponse>(
			"listSessions",
			undefined,
		);
		// Version skew: older daemons may not return pid - normalize undefined → null
		return {
			sessions: response.sessions.map((s) => ({ ...s, pid: s.pid ?? null })),
		};
	}

	/**
	 * Clear scrollback for a session
	 */
	async clearScrollback(
		request: ClearScrollbackRequest,
	): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("clearScrollback", request);
	}

	/**
	 * Shutdown the daemon gracefully.
	 * After calling this, the client should be disposed and a new daemon
	 * will be spawned on the next getTerminalHostClient() call.
	 */
	async shutdown(request: ShutdownRequest = {}): Promise<EmptyResponse> {
		await this.ensureConnected();
		const response = await this.sendRequest<EmptyResponse>("shutdown", request);
		// Disconnect after shutdown request is sent
		this.disconnect();
		return response;
	}

	/**
	 * Shutdown the daemon if it's currently running, without spawning a new one.
	 * Returns true if daemon was running and shutdown was sent, false if no daemon was running.
	 * This is useful for cleanup operations that should only affect existing daemons.
	 */
	async shutdownIfRunning(
		request: ShutdownRequest = {},
	): Promise<{ wasRunning: boolean }> {
		const connected = await this.tryConnectAndAuthenticate();
		if (!connected) {
			return { wasRunning: false };
		}

		try {
			await this.sendRequest<EmptyResponse>("shutdown", request);
		} finally {
			this.disconnect();
		}
		return { wasRunning: true };
	}

	/**
	 * Disconnect from daemon (but don't stop it)
	 */
	disconnect(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.authenticated = false;
		this.connectionState = ConnectionState.DISCONNECTED;
	}

	/**
	 * Dispose of the client
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.disconnect();
		this.removeAllListeners();
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: TerminalHostClient | null = null;

/**
 * Get the singleton terminal host client instance
 */
export function getTerminalHostClient(): TerminalHostClient {
	if (!clientInstance) {
		clientInstance = new TerminalHostClient();
	}
	return clientInstance;
}

/**
 * Dispose of the singleton client
 */
export function disposeTerminalHostClient(): void {
	if (clientInstance) {
		clientInstance.dispose();
		clientInstance = null;
	}
}
