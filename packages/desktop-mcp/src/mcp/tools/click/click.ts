import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClickResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"click",
		{
			description:
				"Click on a UI element in the Electron app. Provide at least one targeting method: CSS selector, visible text, data-testid, or x/y coordinates. Use inspect_dom first to find element selectors.",
			inputSchema: {
				selector: z
					.string()
					.optional()
					.describe("CSS selector of element to click"),
				text: z
					.string()
					.optional()
					.describe("Visible text content to find and click"),
				testId: z.string().optional().describe("data-testid attribute value"),
				x: z.number().optional().describe("X coordinate for click"),
				y: z.number().optional().describe("Y coordinate for click"),
				index: z
					.number()
					.int()
					.min(0)
					.default(0)
					.describe("0-based index if multiple elements match (default 0)"),
				fuzzy: z
					.boolean()
					.default(true)
					.describe("Use fuzzy/partial text matching (default true)"),
			},
		},
		async (args) => {
			const data = await automationFetch<ClickResponse>("/click", {
				method: "POST",
				body: JSON.stringify(args),
			});

			const desc = data.element
				? `Clicked <${data.element.tag}> "${data.element.text}"`
				: "Click sent";
			return {
				content: [{ type: "text", text: desc }],
			};
		},
	);
}
