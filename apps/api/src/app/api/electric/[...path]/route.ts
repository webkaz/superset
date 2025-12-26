import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { db } from "@superset/db/client";
import { organizationMembers, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { authenticateRequest } from "@/lib/auth";
import { buildWhereClause } from "./utils";

/**
 * Electric SQL Proxy
 *
 * Forwards shape requests to Electric with organization-based filtering.
 * @see https://electric-sql.com/docs/guides/auth#proxy-auth
 */
export async function GET(request: Request): Promise<Response> {
	const clerkUserId = await authenticateRequest(request);
	if (!clerkUserId) {
		return new Response("Unauthorized", { status: 401 });
	}

	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});
	if (!user) {
		return new Response("User not found", { status: 401 });
	}

	const memberships = await db.query.organizationMembers.findMany({
		where: eq(organizationMembers.userId, user.id),
	});
	if (memberships.length === 0) {
		return new Response("No organization memberships", { status: 403 });
	}

	const orgIds = memberships.map((m) => m.organizationId);

	// Build Electric URL (ELECTRIC_URL already includes /v1/shape)
	const originUrl = new URL(env.ELECTRIC_URL);
	originUrl.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID);
	originUrl.searchParams.set("source_secret", env.ELECTRIC_SOURCE_SECRET);

	// Only pass through Electric protocol params
	const url = new URL(request.url);
	url.searchParams.forEach((value, key) => {
		if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
			originUrl.searchParams.set(key, value);
		}
	});

	// Build WHERE clause based on table
	const tableName = url.searchParams.get("table");
	if (!tableName) {
		return new Response("Missing table parameter", { status: 400 });
	}

	const whereClause = await buildWhereClause(tableName, orgIds);
	if (!whereClause) {
		return new Response(`Unknown table: ${tableName}`, { status: 400 });
	}

	originUrl.searchParams.set("table", tableName);
	originUrl.searchParams.set("where", whereClause.fragment);
	whereClause.params.forEach((value, index) => {
		originUrl.searchParams.set(`params[${index + 1}]`, String(value));
	});

	// Forward to Electric
	const response = await fetch(originUrl.toString());

	// Must remove these headers per Electric docs
	const headers = new Headers(response.headers);
	headers.delete("content-encoding");
	headers.delete("content-length");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
