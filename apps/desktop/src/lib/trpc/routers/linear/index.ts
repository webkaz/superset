import { apiClient } from "main/lib/api-client";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Linear router - proxies to API tRPC endpoints for Linear integration
 */
export const createLinearRouter = () => {
	return router({
		/**
		 * Check if Linear is connected for an organization
		 */
		getConnection: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				try {
					const result = await apiClient.integration.linear.getConnection.query(
						{
							organizationId: input.organizationId,
						},
					);
					return result;
				} catch (error) {
					console.error("[linear] Failed to get connection:", error);
					return null;
				}
			}),

		/**
		 * Get teams from Linear
		 */
		getTeams: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				try {
					const teams = await apiClient.integration.linear.getTeams.query({
						organizationId: input.organizationId,
					});
					return teams;
				} catch (error) {
					console.error("[linear] Failed to get teams:", error);
					return [];
				}
			}),

		/**
		 * Get projects from Linear
		 */
		getProjects: publicProcedure
			.input(
				z.object({
					organizationId: z.string(),
					teamId: z.string().optional(),
				}),
			)
			.query(async ({ input }) => {
				try {
					const projects = await apiClient.integration.linear.getProjects.query(
						{
							organizationId: input.organizationId,
							teamId: input.teamId,
						},
					);
					return projects;
				} catch (error) {
					console.error("[linear] Failed to get projects:", error);
					return [];
				}
			}),

		/**
		 * Get issues from Linear with filters
		 */
		getIssues: publicProcedure
			.input(
				z.object({
					organizationId: z.string(),
					teamId: z.string().optional(),
					projectId: z.string().optional(),
					first: z.number().optional(),
					includeCompleted: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				try {
					const result = await apiClient.integration.linear.getIssues.query({
						organizationId: input.organizationId,
						teamId: input.teamId,
						projectId: input.projectId,
						first: input.first ?? 50,
						includeCompleted: input.includeCompleted ?? false,
					});
					return result;
				} catch (error) {
					console.error("[linear] Failed to get issues:", error);
					return { issues: [], hasMore: false };
				}
			}),

		/**
		 * Search issues by query
		 */
		searchIssues: publicProcedure
			.input(
				z.object({
					organizationId: z.string(),
					query: z.string(),
					first: z.number().optional(),
				}),
			)
			.query(async ({ input }) => {
				try {
					const result = await apiClient.integration.linear.searchIssues.query({
						organizationId: input.organizationId,
						query: input.query,
						first: input.first ?? 20,
					});
					return result;
				} catch (error) {
					console.error("[linear] Failed to search issues:", error);
					return { issues: [] };
				}
			}),
	});
};

export type LinearRouter = ReturnType<typeof createLinearRouter>;
