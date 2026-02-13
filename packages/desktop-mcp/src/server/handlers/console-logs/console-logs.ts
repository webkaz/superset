import type { RequestHandler } from "express";
import { ConsoleLogsRequestSchema } from "../../../zod.js";
import type { ConsoleCapture } from "../../console-capture/index.js";

const LEVEL_MAP: Record<string, number> = {
	debug: 0,
	log: 1,
	info: 1,
	warn: 2,
	error: 3,
};

export function consoleLogsHandler(
	consoleCapture: ConsoleCapture,
): RequestHandler {
	return (req, res) => {
		const parsed = ConsoleLogsRequestSchema.safeParse({
			level: req.query.level,
			limit: req.query.limit ? Number(req.query.limit) : undefined,
			clear: req.query.clear === "true",
		});

		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		const { level, limit, clear } = parsed.data;
		const levelNum = level ? LEVEL_MAP[level] : undefined;
		const logs = consoleCapture.getLogs({ level: levelNum, limit });

		if (clear) consoleCapture.clear();

		res.json({ logs });
	};
}
