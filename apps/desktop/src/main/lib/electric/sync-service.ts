import { Shape, ShapeStream } from "@electric-sql/client";
import {
	organizations,
	organizationMembers,
	tasks,
	users,
} from "@superset/local-db";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { env } from "main/env.main";
import { localDb } from "main/lib/local-db";
import { authService } from "../auth/auth-service";
import { SYNC_EVENTS, syncEmitter } from "./sync-emitter";

type SyncedTable = "tasks" | "organizations" | "organization_members" | "users";

const tableConfig: Record<SyncedTable, { table: SQLiteTable; event: string }> = {
	tasks: { table: tasks, event: SYNC_EVENTS.TASKS_UPDATED },
	organizations: { table: organizations, event: SYNC_EVENTS.ORGANIZATIONS_UPDATED },
	organization_members: { table: organizationMembers, event: SYNC_EVENTS.ORGANIZATION_MEMBERS_UPDATED },
	users: { table: users, event: SYNC_EVENTS.USERS_UPDATED },
};

const shapes: Shape[] = [];

export async function startSync(): Promise<void> {
	const token = await authService.getAccessToken();
	if (!token) {
		console.log("[sync] No auth token, skipping");
		return;
	}

	console.log("[sync] Starting sync");

	for (const [tableName, config] of Object.entries(tableConfig)) {
		const stream = new ShapeStream({
			url: `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape`,
			params: { table: tableName },
			headers: { Authorization: `Bearer ${token}` },
		});

		const shape = new Shape(stream);
		shapes.push(shape);

		shape.subscribe(({ rows }) => {
			console.log(`[sync] ${tableName}: ${rows.length} rows`);
			localDb.delete(config.table).run();
			for (const row of rows) {
				localDb.insert(config.table).values(row as Record<string, unknown>).run();
			}
			syncEmitter.emit(config.event);
		});
	}
}

export function stopSync(): void {
	for (const shape of shapes) {
		shape.unsubscribeAll();
	}
	shapes.length = 0;
}
