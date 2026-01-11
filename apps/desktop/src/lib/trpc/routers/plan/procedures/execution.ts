import { plans, planTasks, projects } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	type TaskExecutionOutput,
	type TaskExecutionProgress,
	taskExecutionManager,
} from "main/lib/task-execution";
import { taskTerminalBridge } from "main/lib/task-execution/terminal-bridge";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

export const createExecutionProcedures = () => {
	return router({
		/**
		 * Start executing a task
		 */
		start: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				const task = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.taskId))
					.get();

				if (!task) {
					throw new Error(`Task ${input.taskId} not found`);
				}

				// Get the plan to find the project ID
				const planRecord = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, task.planId))
					.get();

				if (!planRecord) {
					throw new Error(`Plan ${task.planId} not found`);
				}

				// Get the project for the main repo path
				const projectRecord = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, planRecord.projectId))
					.get();

				if (!projectRecord?.mainRepoPath) {
					throw new Error("Project main repo path not found");
				}

				// Update task status to queued
				localDb
					.update(planTasks)
					.set({
						status: "queued",
						executionStatus: "pending",
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.taskId))
					.run();

				// Enqueue the task for execution
				taskExecutionManager.enqueue(
					task,
					planRecord.projectId,
					projectRecord.mainRepoPath,
				);

				return { success: true };
			}),

		/**
		 * Stop a running task
		 */
		stop: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.cancel(input.taskId);

				// Update task status
				localDb
					.update(planTasks)
					.set({
						status: "backlog",
						executionStatus: null,
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.taskId))
					.run();

				return { success: true };
			}),

		/**
		 * Retry a failed task - clears error and re-queues for execution
		 */
		retry: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				const task = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.taskId))
					.get();

				if (!task) {
					throw new Error(`Task ${input.taskId} not found`);
				}

				if (task.status !== "failed") {
					throw new Error(`Task is not failed, cannot retry`);
				}

				// Get the plan to find the project ID
				const planRecord = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, task.planId))
					.get();

				if (!planRecord) {
					throw new Error(`Plan ${task.planId} not found`);
				}

				// Get the project for the main repo path
				const projectRecord = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, planRecord.projectId))
					.get();

				if (!projectRecord?.mainRepoPath) {
					throw new Error("Project main repo path not found");
				}

				// Clear error and reset status
				localDb
					.update(planTasks)
					.set({
						status: "queued",
						executionStatus: "pending",
						executionError: null,
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.taskId))
					.run();

				// Re-enqueue the task
				taskExecutionManager.enqueue(
					task,
					planRecord.projectId,
					projectRecord.mainRepoPath,
				);

				return { success: true };
			}),

		/**
		 * Pause a running task
		 */
		pause: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.pause(input.taskId);
				return { success: true };
			}),

		/**
		 * Resume a paused task
		 */
		resume: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.resume(input.taskId);
				return { success: true };
			}),

		/**
		 * Get current status of a task execution
		 */
		getStatus: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.query(({ input }) => {
				return taskExecutionManager.getProgress(input.taskId) ?? null;
			}),

		/**
		 * Get all running tasks
		 */
		getAllRunning: publicProcedure.query(() => {
			return taskExecutionManager.getAllProgress();
		}),

		/**
		 * Get execution statistics
		 */
		getStats: publicProcedure.query(() => {
			return taskExecutionManager.getStats();
		}),

		/**
		 * Set max concurrent executions
		 */
		setMaxConcurrent: publicProcedure
			.input(z.object({ count: z.number().min(1).max(100) }))
			.mutation(({ input }) => {
				taskExecutionManager.setMaxConcurrent(input.count);
				return { success: true, maxConcurrent: input.count };
			}),

		/**
		 * Subscribe to task execution progress
		 */
		subscribeProgress: publicProcedure.subscription(() => {
			return observable<TaskExecutionProgress>((emit) => {
				const handler = (progress: TaskExecutionProgress) => {
					emit.next(progress);
				};

				taskExecutionManager.on("progress", handler);

				return () => {
					taskExecutionManager.off("progress", handler);
				};
			});
		}),

		/**
		 * Subscribe to task output for a specific task
		 */
		subscribeOutput: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.subscription(({ input }) => {
				return observable<TaskExecutionOutput>((emit) => {
					const handler = (output: TaskExecutionOutput) => {
						emit.next(output);
					};

					taskExecutionManager.on(`output:${input.taskId}`, handler);

					return () => {
						taskExecutionManager.off(`output:${input.taskId}`, handler);
					};
				});
			}),

		/**
		 * Subscribe to all task output
		 */
		subscribeAllOutput: publicProcedure.subscription(() => {
			return observable<TaskExecutionOutput>((emit) => {
				const handler = (output: TaskExecutionOutput) => {
					emit.next(output);
				};

				taskExecutionManager.on("output", handler);

				return () => {
					taskExecutionManager.off("output", handler);
				};
			});
		}),

		// ================== Terminal Procedures ==================

		/**
		 * Attach to a task's terminal session
		 * Returns scrollback buffer and whether the terminal is still alive
		 */
		attachTerminal: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.query(({ input }) => {
				const result = taskTerminalBridge.attach(input.taskId);
				if (!result) {
					return {
						exists: false,
						scrollback: "",
						isAlive: false,
					};
				}
				return {
					exists: true,
					scrollback: result.scrollback,
					isAlive: result.isAlive,
				};
			}),

		/**
		 * Write data to a task's terminal (user input)
		 */
		writeToTerminal: publicProcedure
			.input(z.object({ taskId: z.string(), data: z.string() }))
			.mutation(({ input }) => {
				const success = taskTerminalBridge.write(input.taskId, input.data);
				return { success };
			}),

		/**
		 * Resize a task's terminal
		 */
		resizeTerminal: publicProcedure
			.input(
				z.object({
					taskId: z.string(),
					cols: z.number().min(1),
					rows: z.number().min(1),
				}),
			)
			.mutation(({ input }) => {
				const success = taskTerminalBridge.resize(
					input.taskId,
					input.cols,
					input.rows,
				);
				return { success };
			}),

		/**
		 * Check if a terminal session is alive
		 */
		isTerminalAlive: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.query(({ input }) => {
				return { alive: taskTerminalBridge.isAlive(input.taskId) };
			}),

		/**
		 * Get all active terminal sessions
		 */
		getActiveTerminals: publicProcedure.query(() => {
			return { taskIds: taskTerminalBridge.getActiveSessions() };
		}),

		/**
		 * Subscribe to raw terminal output for xterm rendering
		 * This provides ANSI escape sequences for proper terminal display
		 */
		subscribeTerminal: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ data: string }>((emit) => {
					const handleData = (taskId: string, data: string) => {
						if (taskId === input.taskId) {
							emit.next({ data });
						}
					};

					const handleExit = (
						taskId: string,
						exitCode: number,
						signal?: number,
					) => {
						if (taskId === input.taskId) {
							// Emit exit message to terminal
							const exitMsg = signal
								? `\r\n[Process terminated by signal ${signal}]\r\n`
								: `\r\n[Process exited with code ${exitCode}]\r\n`;
							emit.next({ data: exitMsg });
							emit.complete();
						}
					};

					taskTerminalBridge.on("data", handleData);
					taskTerminalBridge.on("exit", handleExit);

					return () => {
						taskTerminalBridge.off("data", handleData);
						taskTerminalBridge.off("exit", handleExit);
					};
				});
			}),

		/**
		 * Kill a terminal session
		 */
		killTerminal: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskTerminalBridge.killSession(input.taskId);
				return { success: true };
			}),

		/**
		 * Find a running task by workspace ID
		 * Used when opening a workspace to check if there's an active task terminal
		 */
		findByWorkspaceId: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				// First check in-memory for running tasks
				const runningTasks = taskExecutionManager.getAllProgress();
				for (const progress of runningTasks) {
					if (progress.workspaceId === input.workspaceId) {
						return {
							taskId: progress.taskId,
							status: progress.status,
							isTerminalAlive: taskTerminalBridge.isAlive(progress.taskId),
						};
					}
				}

				// Check database for completed tasks with this workspace
				const task = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.workspaceId, input.workspaceId))
					.get();

				if (task) {
					return {
						taskId: task.id,
						status: task.status,
						isTerminalAlive: taskTerminalBridge.isAlive(task.id),
					};
				}

				return null;
			}),
	});
};
