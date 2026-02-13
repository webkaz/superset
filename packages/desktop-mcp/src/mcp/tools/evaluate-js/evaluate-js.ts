import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EvaluateResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"evaluate_js",
		{
			description:
				"Execute JavaScript code in the Electron app's renderer process and return the result. Use this as an escape hatch for anything not covered by other tools.",
			inputSchema: {
				code: z.string().describe("JavaScript code to execute in the renderer"),
			},
		},
		async (args) => {
			const data = await automationFetch<EvaluateResponse>("/evaluate", {
				method: "POST",
				body: JSON.stringify({ code: args.code }),
			});
			return {
				content: [
					{
						type: "text",
						text:
							typeof data.result === "string"
								? data.result
								: JSON.stringify(data.result, null, 2),
					},
				],
			};
		},
	);
}
