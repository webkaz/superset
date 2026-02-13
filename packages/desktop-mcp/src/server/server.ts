import type { BrowserWindow } from "electron";
import express from "express";
import { ConsoleCapture } from "./console-capture/index.js";
import { clickHandler } from "./handlers/click/index.js";
import { consoleLogsHandler } from "./handlers/console-logs/index.js";
import { domHandler } from "./handlers/dom/index.js";
import { evaluateHandler } from "./handlers/evaluate/index.js";
import { navigateHandler } from "./handlers/navigate/index.js";
import { screenshotHandler } from "./handlers/screenshot/index.js";
import { sendKeysHandler } from "./handlers/send-keys/index.js";
import { typeHandler } from "./handlers/type/index.js";
import { windowInfoHandler } from "./handlers/window-info/index.js";

export function createAutomationServer({
	getWindow,
	port = 9223,
}: {
	getWindow: () => BrowserWindow | null;
	port?: number;
}) {
	const app = express();
	app.use(express.json());

	const consoleCapture = new ConsoleCapture();

	const attachConsole = () => {
		const win = getWindow();
		if (win) consoleCapture.attach(win.webContents);
	};
	attachConsole();

	app.get("/health", (_req, res) => {
		res.json({ status: "ok" });
	});

	app.get("/screenshot", screenshotHandler(getWindow));
	app.get("/dom", domHandler(getWindow));
	app.post("/click", clickHandler(getWindow));
	app.post("/type", typeHandler(getWindow));
	app.post("/evaluate", evaluateHandler(getWindow));
	app.get("/console-logs", consoleLogsHandler(consoleCapture));
	app.get("/window-info", windowInfoHandler(getWindow));
	app.post("/navigate", navigateHandler(getWindow));
	app.post("/send-keys", sendKeysHandler(getWindow));

	const server = app.listen(port, "127.0.0.1", () => {
		console.log(`[automation] Listening on http://127.0.0.1:${port}`);
	});

	return { server, consoleCapture, attachConsole };
}
