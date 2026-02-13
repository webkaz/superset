import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";

export function windowInfoHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return (_req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		res.json({
			bounds: win.getBounds(),
			title: win.getTitle(),
			url: win.webContents.getURL(),
			focused: win.isFocused(),
			maximized: win.isMaximized(),
			fullscreen: win.isFullScreen(),
			visible: win.isVisible(),
		});
	};
}
