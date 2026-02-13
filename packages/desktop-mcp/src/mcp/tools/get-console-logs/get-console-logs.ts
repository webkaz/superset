import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConsoleLogsResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

const LEVEL_NAMES: Record<number, string> = {
	0: "DEBUG",
	1: "LOG",
	2: "WARN",
	3: "ERROR",
};

export function register(server: McpServer) {
	server.registerTool(
		"get_console_logs",
		{
			description:
				"Get buffered console output from the Electron app renderer process. Shows console.log, console.warn, console.error output. Critical for debugging runtime issues.",
			inputSchema: {
				level: z
					.enum(["log", "warn", "error", "debug"])
					.optional()
					.describe("Filter by log level"),
				limit: z
					.number()
					.int()
					.min(1)
					.default(50)
					.describe("Max entries to return (default 50)"),
				clear: z
					.boolean()
					.default(false)
					.describe("Clear buffer after reading"),
			},
		},
		async (args) => {
			const params = new URLSearchParams();
			if (args.level) params.set("level", args.level as string);
			if (args.limit) params.set("limit", String(args.limit));
			if (args.clear) params.set("clear", "true");
			const qs = params.toString();

			const data = await automationFetch<ConsoleLogsResponse>(
				`/console-logs${qs ? `?${qs}` : ""}`,
			);

			const lines = data.logs.map((log) => {
				const level = LEVEL_NAMES[log.level] || String(log.level);
				const time = new Date(log.timestamp).toISOString().slice(11, 23);
				return `[${time}] ${level}: ${log.message}`;
			});

			return {
				content: [
					{
						type: "text",
						text: lines.length > 0 ? lines.join("\n") : "No console logs",
					},
				],
			};
		},
	);
}
