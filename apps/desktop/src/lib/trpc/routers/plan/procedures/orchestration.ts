import { observable } from "@trpc/server/observable";
import {
	type ChatStreamEvent,
	clearOrchestrationHistory,
	getOrchestrationHistory,
	orchestrationEvents,
	sendOrchestrationMessage,
} from "main/lib/orchestration";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

export const createOrchestrationProcedures = () => {
	return router({
		/**
		 * Send a message to the orchestration chat
		 * The response will be streamed via the subscribeToStream subscription
		 */
		sendMessage: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					planId: z.string(),
					content: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const { projectId, planId, content } = input;

				// Start sending message asynchronously
				// Results will be streamed via subscribeToStream
				sendOrchestrationMessage({ projectId, planId, content }).catch(
					(error) => {
						console.error("[orchestration] Failed to send message:", error);
					},
				);

				return { success: true };
			}),

		/**
		 * Get chat history for a project
		 */
		getHistory: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					limit: z.number().optional().default(50),
				}),
			)
			.query(({ input }) => {
				const messages = getOrchestrationHistory(input.projectId, input.limit);
				return { messages };
			}),

		/**
		 * Clear all chat history for a project
		 */
		clearHistory: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(({ input }) => {
				clearOrchestrationHistory(input.projectId);
				return { success: true };
			}),

		/**
		 * Subscribe to chat stream events for a project
		 * Uses observable pattern required by trpc-electron
		 */
		subscribeToStream: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.subscription(({ input }) => {
				return observable<ChatStreamEvent>((emit) => {
					const eventKey = `chat:${input.projectId}`;

					const handler = (event: ChatStreamEvent) => {
						emit.next(event);
					};

					orchestrationEvents.on(eventKey, handler);

					return () => {
						orchestrationEvents.off(eventKey, handler);
					};
				});
			}),
	});
};
