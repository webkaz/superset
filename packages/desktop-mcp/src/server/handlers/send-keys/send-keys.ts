import type { BrowserWindow } from "electron";
import type { RequestHandler } from "express";
import { SendKeysRequestSchema } from "../../../zod.js";

/**
 * Map from human-readable key names to Electron accelerator key codes.
 * @see https://www.electronjs.org/docs/latest/api/accelerator
 */
const KEY_MAP: Record<string, string> = {
	meta: "Meta",
	cmd: "Meta",
	command: "Meta",
	ctrl: "Control",
	control: "Control",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
	enter: "Return",
	return: "Return",
	escape: "Escape",
	esc: "Escape",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	space: " ",
	arrowup: "Up",
	arrowdown: "Down",
	arrowleft: "Left",
	arrowright: "Right",
	up: "Up",
	down: "Down",
	left: "Left",
	right: "Right",
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

function normalizeKey(key: string): string {
	return KEY_MAP[key.toLowerCase()] ?? key;
}

export function sendKeysHandler(
	getWindow: () => BrowserWindow | null,
): RequestHandler {
	return async (req, res) => {
		const win = getWindow();
		if (!win) {
			res.status(503).json({ error: "No window available" });
			return;
		}

		const parsed = SendKeysRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.message });
			return;
		}

		// Focus the window so key events are received
		if (!win.isFocused()) win.focus();

		type Modifier = "shift" | "control" | "alt" | "meta";

		const normalized = parsed.data.keys.map(normalizeKey);
		const modifiers: Modifier[] = [];
		let keyCode = "";

		for (const key of normalized) {
			if (MODIFIER_KEYS.has(key)) {
				modifiers.push(key.toLowerCase() as Modifier);
			} else {
				keyCode = key;
			}
		}

		// If no non-modifier key, treat last key as the keyCode
		if (!keyCode && normalized.length > 0) {
			keyCode = normalized[normalized.length - 1] as string;
			modifiers.pop();
		}

		win.webContents.sendInputEvent({
			type: "keyDown",
			keyCode,
			modifiers,
		});

		win.webContents.sendInputEvent({
			type: "keyUp",
			keyCode,
			modifiers,
		});

		res.json({ success: true });
	};
}
