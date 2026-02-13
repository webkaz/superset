import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SendKeysResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"send_keys",
		{
			description:
				'Send keyboard shortcuts or key presses to the Electron app. Provide an array of keys to press simultaneously. Use modifier names like "Meta" (Cmd), "Control", "Alt", "Shift" combined with a key. Examples: ["Meta", "t"] for Cmd+T, ["Meta", "Shift", "p"] for Cmd+Shift+P, ["Escape"] for Esc, ["Enter"] for Enter.',
			inputSchema: {
				keys: z
					.array(z.string())
					.describe(
						'Keys to press simultaneously, e.g. ["Meta", "t"] for Cmd+T',
					),
			},
		},
		async (args) => {
			const data = await automationFetch<SendKeysResponse>("/send-keys", {
				method: "POST",
				body: JSON.stringify(args),
			});

			const desc = data.success
				? `Sent keys: ${(args.keys as string[]).join("+")}`
				: "Failed to send keys";
			return {
				content: [{ type: "text", text: desc }],
			};
		},
	);
}
