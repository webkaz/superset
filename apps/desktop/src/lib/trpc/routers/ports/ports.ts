import { workspaces } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	hasStaticPortsConfig,
	loadStaticPorts,
	staticPortsWatcher,
} from "main/lib/static-ports";
import { portManager } from "main/lib/terminal/port-manager";
import type { DetectedPort, StaticPort } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspacePath } from "../workspaces/utils/worktree";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

export const createPortsRouter = () => {
	return router({
		// Get all currently detected ports
		getAll: publicProcedure.query(() => {
			return portManager.getAllPorts();
		}),

		// Subscribe to port changes (add/remove events)
		subscribe: publicProcedure.subscription(() => {
			return observable<PortEvent>((emit) => {
				const onAdd = (port: DetectedPort) => {
					emit.next({ type: "add", port });
				};

				const onRemove = (port: DetectedPort) => {
					emit.next({ type: "remove", port });
				};

				portManager.on("port:add", onAdd);
				portManager.on("port:remove", onRemove);

				return () => {
					portManager.off("port:add", onAdd);
					portManager.off("port:remove", onRemove);
				};
			});
		}),

		// Check if a workspace has a static ports configuration file
		hasStaticConfig: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }): { hasStatic: boolean } => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();

				if (!workspace) {
					return { hasStatic: false };
				}

				const workspacePath = getWorkspacePath(workspace);
				if (!workspacePath) {
					return { hasStatic: false };
				}

				return { hasStatic: hasStaticPortsConfig(workspacePath) };
			}),

		// Get static ports from the workspace's ports.json file
		getStatic: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(
				({ input }): { ports: StaticPort[] | null; error: string | null } => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, input.workspaceId))
						.get();

					if (!workspace) {
						return { ports: null, error: "Workspace not found" };
					}

					const workspacePath = getWorkspacePath(workspace);
					if (!workspacePath) {
						return { ports: null, error: "Workspace path not found" };
					}

					const result = loadStaticPorts(workspacePath);

					if (!result.exists) {
						return { ports: null, error: null };
					}

					if (result.error) {
						return { ports: null, error: result.error };
					}

					// Add workspaceId to each port
					const portsWithWorkspace: StaticPort[] =
						result.ports?.map((p) => ({
							...p,
							workspaceId: input.workspaceId,
						})) ?? [];

					return { ports: portsWithWorkspace, error: null };
				},
			),

		// Subscribe to static ports file changes for a workspace
		subscribeStatic: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ type: "change" }>((emit) => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, input.workspaceId))
						.get();

					if (!workspace) {
						return () => {};
					}

					const workspacePath = getWorkspacePath(workspace);
					if (!workspacePath) {
						return () => {};
					}

					// Start watching the file
					staticPortsWatcher.watch(input.workspaceId, workspacePath);

					const onChange = (changedWorkspaceId: string) => {
						if (changedWorkspaceId === input.workspaceId) {
							emit.next({ type: "change" });
						}
					};

					staticPortsWatcher.on("change", onChange);

					return () => {
						staticPortsWatcher.off("change", onChange);
						staticPortsWatcher.unwatch(input.workspaceId);
					};
				});
			}),
	});
};
