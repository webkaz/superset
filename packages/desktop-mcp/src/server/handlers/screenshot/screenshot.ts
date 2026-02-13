import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";

export function screenshotHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		let rect:
			| { x: number; y: number; width: number; height: number }
			| undefined;
		if (req.query.rect) {
			const parts = String(req.query.rect).split(",").map(Number);
			if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
				rect = {
					x: parts[0] as number,
					y: parts[1] as number,
					width: parts[2] as number,
					height: parts[3] as number,
				};
			}
		}

		const image = rect
			? await win.webContents.capturePage(rect)
			: await win.webContents.capturePage();
		const size = image.getSize();
		const base64 = image.toPNG().toString("base64");

		res.json({ image: base64, width: size.width, height: size.height });
	};
}
