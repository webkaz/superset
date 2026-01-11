import { db } from "@superset/db/client";
import { integrationConnections, type LinearConfig } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { getLinearClient, verifyOrgAdmin, verifyOrgMembership } from "./utils";

export const linearRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "linear"),
				),
				columns: { id: true, config: true },
			});
			if (!connection) return null;
			return { config: connection.config as LinearConfig | null };
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await db
				.delete(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "linear"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	getTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const client = await getLinearClient(input.organizationId);
			if (!client) return [];
			const teams = await client.teams();
			return teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }));
		}),

	updateConfig: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				newTasksTeamId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const config: LinearConfig = {
				provider: "linear",
				newTasksTeamId: input.newTasksTeamId,
			};

			await db
				.update(integrationConnections)
				.set({ config })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "linear"),
					),
				);

			return { success: true };
		}),

	/**
	 * Get projects from Linear for filtering
	 */
	getProjects: protectedProcedure
		.input(
			z.object({ organizationId: z.uuid(), teamId: z.string().optional() }),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const client = await getLinearClient(input.organizationId);
			if (!client) return [];

			const projects = await client.projects({
				filter: input.teamId
					? { accessibleTeams: { id: { eq: input.teamId } } }
					: undefined,
			});

			return projects.nodes.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? null,
				state: p.state,
			}));
		}),

	/**
	 * Get issues from Linear with optional filters
	 */
	getIssues: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				teamId: z.string().optional(),
				projectId: z.string().optional(),
				first: z.number().min(1).max(100).default(50),
				includeCompleted: z.boolean().default(false),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const client = await getLinearClient(input.organizationId);
			if (!client) return { issues: [], hasMore: false };

			// Build filter based on inputs
			const filter: Record<string, unknown> = {};
			if (input.teamId) {
				filter.team = { id: { eq: input.teamId } };
			}
			if (input.projectId) {
				filter.project = { id: { eq: input.projectId } };
			}
			if (!input.includeCompleted) {
				filter.completedAt = { null: true };
			}

			const issues = await client.issues({
				first: input.first,
				filter: Object.keys(filter).length > 0 ? filter : undefined,
				orderBy: { updatedAt: "desc" } as unknown as Parameters<
					typeof client.issues
				>[0] extends { orderBy?: infer O }
					? O
					: never,
			});

			// Resolve state for each issue (LinearFetch needs to be called)
			const issuesWithState = await Promise.all(
				issues.nodes.map(async (issue) => {
					let stateData: { id: string; name: string; color: string } | null =
						null;
					try {
						const state = await issue.state;
						if (state) {
							stateData = {
								id: state.id,
								name: state.name,
								color: state.color,
							};
						}
					} catch {
						// State might not be available
					}
					return {
						id: issue.id,
						identifier: issue.identifier,
						title: issue.title,
						description: issue.description ?? null,
						priority: issue.priority,
						state: stateData,
						url: issue.url,
						createdAt: issue.createdAt.toISOString(),
						updatedAt: issue.updatedAt.toISOString(),
					};
				}),
			);

			return {
				issues: issuesWithState,
				hasMore: issues.pageInfo.hasNextPage,
			};
		}),

	/**
	 * Search issues by query string
	 */
	searchIssues: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				query: z.string().min(1),
				first: z.number().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const client = await getLinearClient(input.organizationId);
			if (!client) return { issues: [] };

			const result = await client.searchIssues(input.query, {
				first: input.first,
			});

			// Resolve state for each issue (LinearFetch needs to be called)
			const issuesWithState = await Promise.all(
				result.nodes.map(async (issue) => {
					let stateData: { id: string; name: string; color: string } | null =
						null;
					try {
						const state = await issue.state;
						if (state) {
							stateData = {
								id: state.id,
								name: state.name,
								color: state.color,
							};
						}
					} catch {
						// State might not be available
					}
					return {
						id: issue.id,
						identifier: issue.identifier,
						title: issue.title,
						description: issue.description ?? null,
						priority: issue.priority,
						state: stateData,
						url: issue.url,
						createdAt: issue.createdAt.toISOString(),
						updatedAt: issue.updatedAt.toISOString(),
					};
				}),
			);

			return {
				issues: issuesWithState,
			};
		}),
} satisfies TRPCRouterRecord;
