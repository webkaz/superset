import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { DOM_INSPECTOR_SCRIPT } from "../../dom-inspector/index.js";

export function domHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const selector = req.query.selector
			? String(req.query.selector)
			: undefined;
		const interactiveOnly = req.query.interactiveOnly === "true";

		const elements = await win.webContents.executeJavaScript(
			`(${DOM_INSPECTOR_SCRIPT})(${JSON.stringify({ selector, interactiveOnly })})`,
		);

		res.json({ elements });
	};
}
