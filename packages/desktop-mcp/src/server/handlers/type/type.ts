import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { TypeRequestSchema } from "../../../zod.js";

export function typeHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const parsed = TypeRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		const { text, selector, clearFirst } = parsed.data;

		const elExpr = selector
			? `document.querySelector(${JSON.stringify(selector)})`
			: "document.activeElement";

		const result = await win.webContents.executeJavaScript(`(() => {
			const el = ${elExpr};
			if (!el) return { success: false, error: 'Element not found' };
			el.focus();
			${
				clearFirst
					? `
			el.value = '';
			el.dispatchEvent(new Event('input', { bubbles: true }));
			`
					: ""
			}
			if (el.isContentEditable) {
				document.execCommand('insertText', false, ${JSON.stringify(text)});
			} else {
				const setter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype, 'value'
				)?.set || Object.getOwnPropertyDescriptor(
					window.HTMLTextAreaElement.prototype, 'value'
				)?.set;
				if (setter) {
					setter.call(el, ${clearFirst ? "" : "el.value + "}${JSON.stringify(text)});
				} else {
					el.value ${clearFirst ? "=" : "+="} ${JSON.stringify(text)};
				}
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}
			return { success: true };
		})()`);

		res.json(result);
	};
}
