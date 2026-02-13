import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ScreenshotResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"take_screenshot",
		{
			description:
				"Take a screenshot of the Electron app window. Returns the screenshot as a base64-encoded PNG image. Use this to see what's currently displayed in the app. Always call this or inspect_dom before interacting with the UI.",
			inputSchema: {
				rect: z
					.object({
						x: z.number().describe("X coordinate of capture region"),
						y: z.number().describe("Y coordinate of capture region"),
						width: z.number().describe("Width of capture region"),
						height: z.number().describe("Height of capture region"),
					})
					.optional()
					.describe(
						"Optional region to capture. Omit to capture the full window.",
					),
			},
		},
		async (args) => {
			const params = args.rect
				? `?rect=${args.rect.x},${args.rect.y},${args.rect.width},${args.rect.height}`
				: "";
			const data = await automationFetch<ScreenshotResponse>(
				`/screenshot${params}`,
			);
			return {
				content: [
					{
						type: "image",
						data: data.image,
						mimeType: "image/png",
					},
				],
			};
		},
	);
}
