import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";

export function createMcpServer(): McpServer {
	const server = new McpServer(
		{ name: "desktop-automation", version: "0.1.0" },
		{ capabilities: { tools: {} } },
	);
	registerTools(server);
	return server;
}
