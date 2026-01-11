import { EventEmitter } from "node:events";
import {
	agentMemory,
	executionLogs,
	orchestrationMessages,
	planTasks,
	projects,
} from "@superset/local-db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { taskExecutionManager } from "../task-execution";

// Types
export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	toolCalls?: Array<{
		id: string;
		name: string;
		input: Record<string, unknown>;
		result?: unknown;
	}>;
	createdAt: number;
}

export interface ChatStreamEvent {
	type: "start" | "token" | "tool_call" | "tool_result" | "complete" | "error";
	data: unknown;
}

// Event emitter for streaming events
export const orchestrationEvents = new EventEmitter();

/**
 * Send a message to the orchestration chat and stream the response
 */
export async function sendOrchestrationMessage({
	projectId,
	planId,
	content,
}: {
	projectId: string;
	planId: string;
	content: string;
}): Promise<void> {
	const eventKey = `chat:${projectId}`;

	try {
		orchestrationEvents.emit(eventKey, { type: "start", data: null });

		// Save user message
		await saveMessage(projectId, "user", content);

		// Get API key from environment
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error(
				"ANTHROPIC_API_KEY not found. Please set it in your environment variables.",
			);
		}

		// Dynamic import to handle missing dependencies gracefully
		let createAnthropic: typeof import("@ai-sdk/anthropic").createAnthropic;
		let streamText: typeof import("ai").streamText;

		try {
			const anthropicModule = await import("@ai-sdk/anthropic");
			const aiModule = await import("ai");
			createAnthropic = anthropicModule.createAnthropic;
			streamText = aiModule.streamText;
		} catch {
			throw new Error(
				"AI SDK not installed. Run: bun add ai @ai-sdk/anthropic",
			);
		}

		const anthropic = createAnthropic({ apiKey });

		// Get conversation history
		const history = await getConversationHistory(projectId);

		// Get current plan context
		const planContext = await getPlanContext(planId);

		// Get project info for file operations
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();

		// Build system prompt
		const systemPrompt = buildSystemPrompt({ planContext });

		// Define tools inline without the tool() helper to avoid type issues
		const tools = {
			createTask: {
				description: "Create a new task in the plan backlog",
				inputSchema: z.object({
					title: z.string().describe("The task title"),
					description: z
						.string()
						.optional()
						.describe("Detailed description and instructions for Claude"),
					priority: z
						.enum(["urgent", "high", "medium", "low", "none"])
						.optional()
						.describe("Task priority"),
				}),
				execute: async (params: {
					title: string;
					description?: string;
					priority?: "urgent" | "high" | "medium" | "low" | "none";
				}) => {
					const task = localDb
						.insert(planTasks)
						.values({
							planId,
							title: params.title,
							description: params.description,
							priority: params.priority ?? "medium",
							status: "backlog",
							columnOrder: 0,
						})
						.returning()
						.get();
					return {
						success: true,
						taskId: task.id,
						title: params.title,
						message: `Created task "${params.title}"`,
					};
				},
			},

			modifyTask: {
				description: "Update an existing task's details",
				inputSchema: z.object({
					taskId: z.string().describe("The task ID to modify"),
					title: z.string().optional().describe("New title"),
					description: z.string().optional().describe("New description"),
					priority: z
						.enum(["urgent", "high", "medium", "low", "none"])
						.optional()
						.describe("New priority"),
				}),
				execute: async (params: {
					taskId: string;
					title?: string;
					description?: string;
					priority?: "urgent" | "high" | "medium" | "low" | "none";
				}) => {
					const updates: Record<string, unknown> = {};
					if (params.title !== undefined) updates.title = params.title;
					if (params.description !== undefined)
						updates.description = params.description;
					if (params.priority !== undefined) updates.priority = params.priority;

					if (Object.keys(updates).length === 0) {
						return { success: false, error: "No updates provided" };
					}

					localDb
						.update(planTasks)
						.set({ ...updates, updatedAt: Date.now() })
						.where(eq(planTasks.id, params.taskId))
						.run();
					return {
						success: true,
						taskId: params.taskId,
						updated: Object.keys(updates),
					};
				},
			},

			startTask: {
				description:
					"Start executing a task. Creates a worktree and runs Claude.",
				inputSchema: z.object({
					taskId: z.string().describe("The task ID to start"),
				}),
				execute: async (params: { taskId: string }) => {
					const task = localDb
						.select()
						.from(planTasks)
						.where(eq(planTasks.id, params.taskId))
						.get();

					if (!task) {
						return { success: false, error: "Task not found" };
					}

					if (task.status === "running" || task.status === "queued") {
						return {
							success: false,
							error: `Task is already ${task.status}`,
						};
					}

					if (!project?.mainRepoPath) {
						return { success: false, error: "Project has no main repo path" };
					}

					// Update task status to queued
					localDb
						.update(planTasks)
						.set({
							status: "queued",
							executionStatus: "pending",
							updatedAt: Date.now(),
						})
						.where(eq(planTasks.id, params.taskId))
						.run();

					// Enqueue for execution
					taskExecutionManager.enqueue(task, projectId, project.mainRepoPath);

					return {
						success: true,
						taskId: params.taskId,
						message: "Task queued for execution",
					};
				},
			},

			stopTask: {
				description: "Stop a running or queued task",
				inputSchema: z.object({
					taskId: z.string().describe("The task ID to stop"),
				}),
				execute: async (params: { taskId: string }) => {
					taskExecutionManager.cancel(params.taskId);

					localDb
						.update(planTasks)
						.set({
							status: "backlog",
							executionStatus: null,
							updatedAt: Date.now(),
						})
						.where(eq(planTasks.id, params.taskId))
						.run();

					return {
						success: true,
						taskId: params.taskId,
						message: "Task stopped",
					};
				},
			},

			listTasks: {
				description: "List all tasks in the current plan with their status",
				inputSchema: z.object({
					status: z
						.enum(["backlog", "queued", "running", "completed", "failed"])
						.optional()
						.describe("Filter by status"),
				}),
				execute: async (params: {
					status?: "backlog" | "queued" | "running" | "completed" | "failed";
				}) => {
					let tasks = localDb
						.select()
						.from(planTasks)
						.where(eq(planTasks.planId, planId))
						.all();

					if (params.status) {
						tasks = tasks.filter((t) => t.status === params.status);
					}

					return {
						tasks: tasks.map((t) => ({
							id: t.id,
							title: t.title,
							status: t.status,
							priority: t.priority,
							executionStatus: t.executionStatus,
						})),
						total: tasks.length,
					};
				},
			},

			getTaskOutput: {
				description: "Get the execution output/logs for a task",
				inputSchema: z.object({
					taskId: z.string().describe("The task ID"),
					limit: z
						.number()
						.optional()
						.default(50)
						.describe("Max number of log entries"),
				}),
				execute: async (params: { taskId: string; limit?: number }) => {
					const limit = params.limit ?? 50;
					const logs = localDb
						.select()
						.from(executionLogs)
						.where(eq(executionLogs.taskId, params.taskId))
						.orderBy(desc(executionLogs.timestamp))
						.limit(limit)
						.all();

					return {
						logs: logs.reverse().map((l) => ({
							type: l.type,
							content: l.content,
							timestamp: l.timestamp,
						})),
						total: logs.length,
					};
				},
			},

			setMemory: {
				description:
					"Store information in shared memory for future reference across tasks",
				inputSchema: z.object({
					key: z
						.string()
						.describe("Memory key (e.g., 'architecture_decisions')"),
					value: z.string().describe("Value to store"),
				}),
				execute: async (params: { key: string; value: string }) => {
					// Try to update existing, or insert new
					const existing = localDb
						.select()
						.from(agentMemory)
						.where(
							and(
								eq(agentMemory.projectId, projectId),
								eq(agentMemory.key, params.key),
							),
						)
						.get();

					if (existing) {
						localDb
							.update(agentMemory)
							.set({
								value: params.value,
								updatedAt: Date.now(),
							})
							.where(eq(agentMemory.id, existing.id))
							.run();
					} else {
						localDb
							.insert(agentMemory)
							.values({
								projectId,
								key: params.key,
								value: params.value,
							})
							.run();
					}

					return {
						success: true,
						key: params.key,
						message: `Stored memory: ${params.key}`,
					};
				},
			},

			getMemory: {
				description: "Retrieve information from shared memory",
				inputSchema: z.object({
					key: z.string().optional().describe("Specific key to retrieve"),
					keys: z
						.array(z.string())
						.optional()
						.describe("Multiple keys to retrieve"),
				}),
				execute: async (params: { key?: string; keys?: string[] }) => {
					if (params.key) {
						const memory = localDb
							.select()
							.from(agentMemory)
							.where(
								and(
									eq(agentMemory.projectId, projectId),
									eq(agentMemory.key, params.key),
								),
							)
							.get();
						return {
							memory: memory ? { [params.key]: memory.value } : {},
							found: !!memory,
						};
					}

					if (params.keys && params.keys.length > 0) {
						const memories = localDb
							.select()
							.from(agentMemory)
							.where(
								and(
									eq(agentMemory.projectId, projectId),
									inArray(agentMemory.key, params.keys),
								),
							)
							.all();
						return {
							memory: Object.fromEntries(memories.map((m) => [m.key, m.value])),
							found: memories.length,
						};
					}

					// Return all memories for project
					const allMemories = localDb
						.select()
						.from(agentMemory)
						.where(eq(agentMemory.projectId, projectId))
						.all();
					return {
						memory: Object.fromEntries(
							allMemories.map((m) => [m.key, m.value]),
						),
						total: allMemories.length,
					};
				},
			},

			getExecutionStats: {
				description: "Get current execution statistics",
				inputSchema: z.object({}),
				execute: async () => {
					const stats = taskExecutionManager.getStats();
					const tasks = localDb
						.select()
						.from(planTasks)
						.where(eq(planTasks.planId, planId))
						.all();

					const statusCounts = tasks.reduce(
						(acc, t) => {
							acc[t.status] = (acc[t.status] || 0) + 1;
							return acc;
						},
						{} as Record<string, number>,
					);

					return {
						execution: stats,
						taskCounts: statusCounts,
						total: tasks.length,
					};
				},
			},
		};

		// Stream the response - cast model to any to handle v1/v2 type mismatch
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await streamText({
			model: anthropic("claude-sonnet-4-20250514") as any,
			system: systemPrompt,
			messages: [
				...history.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
				{ role: "user" as const, content },
			],
			tools,
			maxOutputTokens: 4096,
		});

		let fullContent = "";
		const collectedToolCalls: ChatMessage["toolCalls"] = [];

		// Stream text
		for await (const chunk of result.textStream) {
			fullContent += chunk;
			orchestrationEvents.emit(eventKey, { type: "token", data: chunk });
		}

		// Process tool calls from the full stream
		for await (const part of result.fullStream) {
			if (part.type === "tool-call") {
				const toolCall = {
					id: part.toolCallId,
					name: part.toolName,
					input:
						(part as { input?: Record<string, unknown> }).input ??
						({} as Record<string, unknown>),
				};
				collectedToolCalls.push(toolCall);
				orchestrationEvents.emit(eventKey, {
					type: "tool_call",
					data: toolCall,
				});
			} else if (part.type === "tool-result") {
				// Update the tool call with its result
				const existingCall = collectedToolCalls.find(
					(tc) => tc.id === part.toolCallId,
				);
				if (existingCall) {
					existingCall.result = (part as { output?: unknown }).output;
				}
				orchestrationEvents.emit(eventKey, {
					type: "tool_result",
					data: {
						callId: part.toolCallId,
						result: (part as { output?: unknown }).output,
					},
				});
			}
		}

		// Save assistant message
		const assistantMessage = await saveMessage(
			projectId,
			"assistant",
			fullContent,
			collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
		);

		orchestrationEvents.emit(eventKey, {
			type: "complete",
			data: assistantMessage,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("[orchestration] Error:", errorMessage);
		orchestrationEvents.emit(eventKey, { type: "error", data: errorMessage });
	}
}

/**
 * Build the system prompt for the orchestration chat
 */
function buildSystemPrompt({
	planContext,
}: {
	planContext: { tasks: Array<{ id: string; title: string; status: string }> };
}): string {
	const taskList =
		planContext.tasks.length === 0
			? "No tasks yet."
			: planContext.tasks
					.map((t) => `- [${t.status}] ${t.title} (id: ${t.id})`)
					.join("\n");

	return `You are an orchestration assistant for a software development project. Your role is to help manage and coordinate tasks in a plan.

## Current Plan Status
${taskList}

## Available Tools
- **createTask**: Create new tasks in the backlog
- **modifyTask**: Update existing task details
- **startTask**: Start executing a task (creates worktree, runs Claude)
- **stopTask**: Stop a running/queued task
- **listTasks**: List all tasks with optional status filter
- **getTaskOutput**: View execution logs for a task
- **setMemory**: Store information for future reference
- **getMemory**: Retrieve stored information
- **getExecutionStats**: Get execution statistics

## Guidelines
1. Be concise and helpful
2. When creating tasks, provide clear titles and descriptions
3. Include specific instructions in the description when starting complex tasks
4. Use memory to track important decisions and context
5. Monitor running tasks and report on progress
6. Always confirm actions and provide clear feedback

When the user asks to work on something, first check if relevant tasks exist, then either create new ones or start existing ones as appropriate.`;
}

/**
 * Get conversation history for a project
 */
async function getConversationHistory(
	projectId: string,
	limit = 50,
): Promise<ChatMessage[]> {
	const messages = localDb
		.select()
		.from(orchestrationMessages)
		.where(eq(orchestrationMessages.projectId, projectId))
		.orderBy(desc(orchestrationMessages.createdAt))
		.limit(limit)
		.all();

	return messages.reverse().map((m) => ({
		id: m.id,
		role: m.role as ChatMessage["role"],
		content: m.content,
		toolCalls: m.toolCalls as ChatMessage["toolCalls"],
		createdAt: m.createdAt,
	}));
}

/**
 * Get plan context for the system prompt
 */
async function getPlanContext(planId: string) {
	const tasks = localDb
		.select()
		.from(planTasks)
		.where(eq(planTasks.planId, planId))
		.all();

	return {
		tasks: tasks.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
		})),
	};
}

/**
 * Save a message to the database
 */
async function saveMessage(
	projectId: string,
	role: "user" | "assistant" | "system",
	content: string,
	toolCalls?: ChatMessage["toolCalls"],
): Promise<ChatMessage> {
	const message = localDb
		.insert(orchestrationMessages)
		.values({
			projectId,
			role,
			content,
			toolCalls,
		})
		.returning()
		.get();

	return {
		id: message.id,
		role: message.role as ChatMessage["role"],
		content: message.content,
		toolCalls: message.toolCalls as ChatMessage["toolCalls"],
		createdAt: message.createdAt,
	};
}

/**
 * Get all messages for a project
 */
export function getOrchestrationHistory(
	projectId: string,
	limit = 50,
): ChatMessage[] {
	const messages = localDb
		.select()
		.from(orchestrationMessages)
		.where(eq(orchestrationMessages.projectId, projectId))
		.orderBy(desc(orchestrationMessages.createdAt))
		.limit(limit)
		.all();

	return messages.reverse().map((m) => ({
		id: m.id,
		role: m.role as ChatMessage["role"],
		content: m.content,
		toolCalls: m.toolCalls as ChatMessage["toolCalls"],
		createdAt: m.createdAt,
	}));
}

/**
 * Clear all messages for a project
 */
export function clearOrchestrationHistory(projectId: string): void {
	localDb
		.delete(orchestrationMessages)
		.where(eq(orchestrationMessages.projectId, projectId))
		.run();
}
