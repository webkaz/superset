import { EventEmitter } from "node:events";
import { type WebContents, webContents } from "electron";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

const MAX_CONSOLE_ENTRIES = 500;

class BrowserManager extends EventEmitter {
	private paneToWebContentsId = new Map<string, number>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();

	register(paneId: string, webContentsId: number): void {
		this.paneToWebContentsId.set(paneId, webContentsId);
		this.setupConsoleCapture(paneId, webContentsId);
	}

	unregister(paneId: string): void {
		const cleanup = this.consoleListeners.get(paneId);
		if (cleanup) {
			cleanup();
			this.consoleListeners.delete(paneId);
		}
		this.paneToWebContentsId.delete(paneId);
		this.consoleLogs.delete(paneId);
	}

	getWebContents(paneId: string): WebContents | null {
		const id = this.paneToWebContentsId.get(paneId);
		if (id === undefined) return null;
		try {
			return webContents.fromId(id) ?? null;
		} catch {
			return null;
		}
	}

	async screenshot(paneId: string): Promise<string> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		const image = await wc.capturePage();
		return image.toPNG().toString("base64");
	}

	async evaluateJS(paneId: string, code: string): Promise<unknown> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		return wc.executeJavaScript(code);
	}

	getConsoleLogs(paneId: string): ConsoleEntry[] {
		return this.consoleLogs.get(paneId) ?? [];
	}

	openDevTools(paneId: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		wc.openDevTools({ mode: "detach" });
	}

	private setupConsoleCapture(paneId: string, webContentsId: number): void {
		const wc = webContents.fromId(webContentsId);
		if (!wc) return;

		const LEVEL_MAP: Record<number, ConsoleEntry["level"]> = {
			0: "log",
			1: "warn",
			2: "error",
			3: "info",
		};

		const handler = (
			_event: Electron.Event,
			level: number,
			message: string,
		) => {
			const entries = this.consoleLogs.get(paneId) ?? [];
			entries.push({
				level: LEVEL_MAP[level] ?? "log",
				message,
				timestamp: Date.now(),
			});
			if (entries.length > MAX_CONSOLE_ENTRIES) {
				entries.splice(0, entries.length - MAX_CONSOLE_ENTRIES);
			}
			this.consoleLogs.set(paneId, entries);
			this.emit(`console:${paneId}`, entries[entries.length - 1]);
		};

		wc.on("console-message", handler);
		this.consoleListeners.set(paneId, () => {
			try {
				wc.off("console-message", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}
}

export const browserManager = new BrowserManager();
