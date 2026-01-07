import fs from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { notificationsEmitter } from "main/lib/notifications/server";
import { PLAN_ID_PATTERN, PLANS_TMP_DIR } from "main/lib/plans";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "..";

// Security: Size limits to prevent abuse
const MAX_FEEDBACK_SIZE = 50 * 1024; // 50KB

// Type for structured .waiting file
interface WaitingFile {
	pid: number;
	token: string;
	createdAt: number;
	originPaneId: string;
	agentType: string;
}

// Response type for plan decisions
interface PlanResponse {
	decision: "approved" | "rejected";
	token: string;
	behavior: "allow" | "deny";
	feedback?: string;
}

export const createPlansRouter = () => {
	return router({
		submitResponse: publicProcedure
			.input(
				z.object({
					planId: z.string(),
					planPath: z.string(),
					originPaneId: z.string(),
					token: z.string(),
					decision: z.enum(["approved", "rejected"]),
					feedback: z.string().max(MAX_FEEDBACK_SIZE).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { planId, planPath, token, decision, feedback } = input;

				// Security: Validate planId format (prevent path traversal)
				if (!PLAN_ID_PATTERN.test(planId)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid plan ID format",
					});
				}

				// Security: Validate planId matches planPath basename
				const expectedBasename = `${planId}.md`;
				if (path.basename(planPath) !== expectedBasename) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Plan ID does not match plan path",
					});
				}

				const waitingPath = path.join(PLANS_TMP_DIR, `${planId}.waiting`);
				const responsePath = path.join(PLANS_TMP_DIR, `${planId}.response`);

				// Read and validate .waiting file
				let waitingData: WaitingFile;
				try {
					const content = await fs.readFile(waitingPath, "utf-8");
					waitingData = JSON.parse(content);
				} catch {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Agent is no longer waiting for a response",
					});
				}

				// Security: Validate token matches (prevents stale/cross-plan responses)
				if (waitingData.token !== token) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Token mismatch - request may be stale",
					});
				}

				// Build response for agent (include token for agent-side validation)
				const response: PlanResponse = {
					decision,
					token,
					behavior: decision === "approved" ? "allow" : "deny",
					...(feedback && { feedback }),
				};

				// Exclusive-create write: prevents race condition overwrites
				// 'wx' flag = O_CREAT | O_EXCL | O_WRONLY (fail if file already exists)
				try {
					const content = JSON.stringify(response);
					const handle = await fs.open(responsePath, "wx", 0o644);
					try {
						await handle.writeFile(content, "utf-8");
					} finally {
						await handle.close();
					}
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "EEXIST") {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Response already submitted for this plan",
						});
					}
					throw error;
				}

				// Emit event to update UI
				notificationsEmitter.emit(NOTIFICATION_EVENTS.PLAN_RESPONSE, {
					planId,
					decision,
					feedback,
				});

				return { success: true };
			}),

		// Check if agent is still waiting for a response
		checkWaiting: publicProcedure
			.input(
				z.object({
					planId: z.string(),
					token: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const { planId, token } = input;

				if (!PLAN_ID_PATTERN.test(planId)) {
					return { waiting: false, reason: "Invalid plan ID" };
				}

				const waitingPath = path.join(PLANS_TMP_DIR, `${planId}.waiting`);

				try {
					const content = await fs.readFile(waitingPath, "utf-8");
					const waitingData: WaitingFile = JSON.parse(content);

					if (waitingData.token !== token) {
						return { waiting: false, reason: "Token mismatch" };
					}

					return { waiting: true };
				} catch {
					return { waiting: false, reason: "Agent not waiting" };
				}
			}),
	});
};
