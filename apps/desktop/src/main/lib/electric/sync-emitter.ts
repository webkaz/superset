import { EventEmitter } from "node:events";

/**
 * Event emitter for Electric SQL sync updates
 *
 * Used to notify tRPC subscriptions when data changes in SQLite
 */
class SyncEmitter extends EventEmitter {}

export const syncEmitter = new SyncEmitter();

export const SYNC_EVENTS = {
	TASKS_UPDATED: "tasks-updated",
	ORGANIZATIONS_UPDATED: "organizations-updated",
	ORGANIZATION_MEMBERS_UPDATED: "organization-members-updated",
	USERS_UPDATED: "users-updated",
} as const;
