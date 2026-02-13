import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WindowInfoResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"get_window_info",
		{
			description:
				"Get information about the Electron app window: bounds, title, URL, focus state, and more.",
			inputSchema: {},
		},
		async () => {
			const data = await automationFetch<WindowInfoResponse>("/window-info");

			const lines = [
				`Title: ${data.title}`,
				`URL: ${data.url}`,
				`Bounds: ${data.bounds.x},${data.bounds.y} ${data.bounds.width}x${data.bounds.height}`,
				`Focused: ${data.focused}`,
				`Maximized: ${data.maximized}`,
				`Fullscreen: ${data.fullscreen}`,
				`Visible: ${data.visible}`,
			];

			return {
				content: [{ type: "text", text: lines.join("\n") }],
			};
		},
	);
}
