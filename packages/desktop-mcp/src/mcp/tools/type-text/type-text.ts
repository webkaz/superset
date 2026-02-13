import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TypeResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"type_text",
		{
			description:
				"Type text into a focused or selected element in the Electron app. Optionally provide a CSS selector to focus an element first. Use clearFirst to clear existing content before typing.",
			inputSchema: {
				text: z.string().describe("Text to type"),
				selector: z
					.string()
					.optional()
					.describe("CSS selector of element to focus before typing"),
				clearFirst: z
					.boolean()
					.default(false)
					.describe("Clear existing content before typing"),
			},
		},
		async (args) => {
			const data = await automationFetch<TypeResponse>("/type", {
				method: "POST",
				body: JSON.stringify(args),
			});
			return {
				content: [
					{
						type: "text",
						text: data.success ? `Typed "${args.text}"` : "Failed to type",
					},
				],
			};
		},
	);
}
