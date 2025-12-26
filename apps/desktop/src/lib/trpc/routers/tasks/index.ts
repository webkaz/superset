import { type SelectTask, settings, tasks } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { and, eq, isNull } from "drizzle-orm";
import { apiClient } from "main/lib/api-client";
import { SYNC_EVENTS, syncEmitter } from "main/lib/electric";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const updateTaskSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	status: z.string().optional(),
	priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
	assigneeId: z.string().uuid().nullable().optional(),
	estimate: z.number().nullable().optional(),
	dueDate: z.coerce.date().nullable().optional(),
});

export const createTasksRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			const { activeOrganizationId } = localDb.select().from(settings).get()!;
			if (!activeOrganizationId) {
				throw new Error("No active organization set");
			}
			return localDb
				.select()
				.from(tasks)
				.where(
					and(
						eq(tasks.organization_id, activeOrganizationId),
						isNull(tasks.deleted_at),
					),
				)
				.all();
		}),

		onUpdate: publicProcedure.subscription(() => {
			return observable<{ tasks: SelectTask[] }>((emit) => {
				const handler = () => {
					const { activeOrganizationId } = localDb
						.select()
						.from(settings)
						.get()!;
					if (!activeOrganizationId) {
						throw new Error("No active organization set");
					}
					const result = localDb
						.select()
						.from(tasks)
						.where(
							and(
								eq(tasks.organization_id, activeOrganizationId),
								isNull(tasks.deleted_at),
							),
						)
						.all();
					emit.next({ tasks: result });
				};

				handler();
				syncEmitter.on(SYNC_EVENTS.TASKS_UPDATED, handler);

				return () => {
					syncEmitter.off(SYNC_EVENTS.TASKS_UPDATED, handler);
				};
			});
		}),

		update: publicProcedure
			.input(updateTaskSchema)
			.mutation(async ({ input }) => {
				const result = await apiClient.task.update.mutate(input);
				return result;
			}),
	});
};
