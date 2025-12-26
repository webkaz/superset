import { db } from "@superset/db/client";
import {
	organizationMembers,
	organizations,
	tasks,
	users,
} from "@superset/db/schema";
import { inArray, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type { PgColumn, PgTableWithColumns } from "drizzle-orm/pg-core";

export type AllowedTable =
	| "tasks"
	| "organization_members"
	| "organizations"
	| "users";

interface WhereClause {
	fragment: string;
	params: unknown[];
}

function build(
	table: PgTableWithColumns<any>,
	column: PgColumn,
	ids: string[],
): WhereClause {
	const whereExpr = inArray(sql`${sql.identifier(column.name)}`, ids);
	const qb = new QueryBuilder();
	const { sql: query, params } = qb.select().from(table).where(whereExpr).toSQL();
	const fragment = query.replace(/^select .* from .* where\s+/i, "");
	return { fragment, params };
}

export async function buildWhereClause(
	tableName: string,
	orgIds: string[],
): Promise<WhereClause | null> {
	switch (tableName) {
		case "tasks":
			return build(tasks, tasks.organizationId, orgIds);

		case "organization_members":
			return build(organizationMembers, organizationMembers.organizationId, orgIds);

		case "organizations":
			return build(organizations, organizations.id, orgIds);

		case "users": {
			// Get all user IDs from user's orgs
			const members = await db.query.organizationMembers.findMany({
				where: inArray(organizationMembers.organizationId, orgIds),
				columns: { userId: true },
			});
			const userIds = [...new Set(members.map((m) => m.userId))];
			return build(users, users.id, userIds);
		}

		default:
			return null;
	}
}
