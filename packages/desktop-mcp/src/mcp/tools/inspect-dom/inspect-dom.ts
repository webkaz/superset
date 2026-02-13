import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DomResponse } from "../../../zod.js";
import { automationFetch } from "../../client/index.js";

export function register(server: McpServer) {
	server.registerTool(
		"inspect_dom",
		{
			description:
				"Inspect the DOM of the Electron app. Returns a structured list of visible elements with selectors, text content, bounds, and interactivity info. Use this to understand what's on screen before clicking or typing. If you don't have an up-to-date view of the UI, call this first instead of guessing.",
			inputSchema: {
				selector: z
					.string()
					.optional()
					.describe("CSS selector to scope inspection to a subtree"),
				interactiveOnly: z
					.boolean()
					.default(false)
					.describe(
						"If true, only return interactive elements (buttons, inputs, links, etc.)",
					),
			},
		},
		async (args) => {
			const params = new URLSearchParams();
			if (args.selector) params.set("selector", args.selector as string);
			if (args.interactiveOnly) params.set("interactiveOnly", "true");
			const qs = params.toString();

			const data = await automationFetch<DomResponse>(
				`/dom${qs ? `?${qs}` : ""}`,
			);

			const lines = data.elements.map((el) => {
				const attrs = [
					el.interactive ? "interactive" : "",
					el.disabled ? "disabled" : "",
					el.focused ? "focused" : "",
					el.role ? `role=${el.role}` : "",
					el.testId ? `testid=${el.testId}` : "",
				]
					.filter(Boolean)
					.join(", ");

				return `[${el.tag}] ${el.selector}${el.text ? ` — "${el.text.slice(0, 80)}"` : ""}${attrs ? ` (${attrs})` : ""} @ ${el.bounds.x},${el.bounds.y} ${el.bounds.width}x${el.bounds.height}`;
			});

			return {
				content: [
					{
						type: "text",
						text: lines.length > 0 ? lines.join("\n") : "No elements found",
					},
				],
			};
		},
	);
}
