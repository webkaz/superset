import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NavigateResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"navigate",
		{
			description:
				"Navigate the Electron app to a URL or route path. Use 'path' for in-app navigation (hash routing), or 'url' for full URL navigation.",
			inputSchema: {
				url: z.string().optional().describe("Full URL to navigate to"),
				path: z
					.string()
					.optional()
					.describe("Route path for in-app navigation (e.g. '/settings')"),
			},
		},
		async (args) => {
			const data = await automationFetch<NavigateResponse>("/navigate", {
				method: "POST",
				body: JSON.stringify(args),
			});
			return {
				content: [
					{
						type: "text",
						text: data.success
							? `Navigated to ${data.url}`
							: "Navigation failed",
					},
				],
			};
		},
	);
}
