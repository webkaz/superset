import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { NavigateRequestSchema } from "../../../zod.js";

export function navigateHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const parsed = NavigateRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		const { url, path } = parsed.data;

		if (url) {
			await win.webContents.loadURL(url);
		} else if (path) {
			await win.webContents.executeJavaScript(
				`window.location.hash = ${JSON.stringify(`#${path}`)}`,
			);
		} else {
			res.status(400).json({ error: "Must provide url or path" });
			return;
		}

		res.json({ success: true, url: win.webContents.getURL() });
	};
}
