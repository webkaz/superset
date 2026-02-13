import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { ClickRequestSchema } from "../../../zod.js";

export function clickHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const parsed = ClickRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		const { selector, text, testId, x, y, index, fuzzy } = parsed.data;

		// Click by coordinates
		if (x !== undefined && y !== undefined) {
			win.webContents.sendInputEvent({
				type: "mouseDown",
				x,
				y,
				button: "left",
				clickCount: 1,
			});
			win.webContents.sendInputEvent({
				type: "mouseUp",
				x,
				y,
				button: "left",
				clickCount: 1,
			});
			res.json({ success: true });
			return;
		}

		// Build JS to find and click element
		let findScript: string;
		if (selector) {
			findScript = `document.querySelectorAll(${JSON.stringify(selector)})[${index}]`;
		} else if (testId) {
			findScript = `document.querySelectorAll('[data-testid="${testId}"]')[${index}]`;
		} else if (text) {
			const matchExpr = fuzzy
				? `content.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`
				: `content === ${JSON.stringify(text)}`;
			findScript = `(() => {
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				const matches = [];
				let node;
				while (node = walker.nextNode()) {
					const content = node.textContent.trim();
					if (${matchExpr}) {
						matches.push(node.parentElement);
					}
				}
				return matches[${index}];
			})()`;
		} else {
			res.status(400).json({
				error: "Must provide selector, text, testId, or x/y coordinates",
			});
			return;
		}

		const result = await win.webContents.executeJavaScript(`(() => {
			const el = ${findScript};
			if (!el) return null;
			el.click();
			return {
				tag: el.tagName.toLowerCase(),
				text: (el.textContent || '').trim().slice(0, 100),
				selector: el.id ? '#' + el.id : el.tagName.toLowerCase(),
			};
		})()`);

		if (!result) {
			res.status(404).json({ error: "Element not found" });
			return;
		}

		res.json({ success: true, element: result });
	};
}
