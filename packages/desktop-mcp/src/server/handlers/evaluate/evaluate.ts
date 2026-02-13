import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { EvaluateRequestSchema } from "../../../zod.js";

export function evaluateHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const parsed = EvaluateRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		try {
			const result = await win.webContents.executeJavaScript(parsed.data.code);
			res.json({ result });
		} catch (error) {
			res.status(500).json({ error: String(error) });
		}
	};
}
