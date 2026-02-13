import type { WebContents } from "electron";
import type { ConsoleLogEntry } from "../../zod.js";

export class ConsoleCapture {
	private logs: ConsoleLogEntry[] = [];
	private maxSize = 500;

	attach(webContents: WebContents) {
		webContents.on(
			"console-message",
			(_event, level, message, line, sourceId) => {
				this.logs.push({
					level,
					message,
					source: sourceId,
					line,
					timestamp: Date.now(),
				});
				if (this.logs.length > this.maxSize) this.logs.shift();
			},
		);
	}

	getLogs({
		level,
		limit,
	}: {
		level?: number;
		limit?: number;
	}): ConsoleLogEntry[] {
		let filtered = this.logs;
		if (level !== undefined) {
			filtered = filtered.filter((log) => log.level === level);
		}
		if (limit !== undefined) {
			filtered = filtered.slice(-limit);
		}
		return filtered;
	}

	clear() {
		this.logs = [];
	}
}
