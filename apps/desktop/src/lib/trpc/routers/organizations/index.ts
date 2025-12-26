import {
	organizationMembers,
	organizations,
	type SelectOrganization,
} from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { apiClient } from "main/lib/api-client";
import { SYNC_EVENTS, syncEmitter } from "main/lib/electric";
import { localDb } from "main/lib/local-db";
import { publicProcedure, router } from "../..";

export const createOrganizationsRouter = () => {
	return router({
		list: publicProcedure.query(async () => {
			const user = await apiClient.user.me.query();
			if (!user) {
				return [];
			}

			const memberships = localDb
				.select({
					organization: organizations,
				})
				.from(organizationMembers)
				.innerJoin(
					organizations,
					eq(organizationMembers.organization_id, organizations.id)
				)
				.where(eq(organizationMembers.user_id, user.id))
				.all();

			return memberships.map((m) => m.organization);
		}),

		onUpdate: publicProcedure.subscription(() => {
			return observable<{ organizations: SelectOrganization[] }>((emit) => {
				const handler = async () => {
					try {
						const user = await apiClient.user.me.query();
						if (!user) {
							emit.next({ organizations: [] });
							return;
						}

						const memberships = localDb
							.select({
								organization: organizations,
							})
							.from(organizationMembers)
							.innerJoin(
								organizations,
								eq(organizationMembers.organization_id, organizations.id)
							)
							.where(eq(organizationMembers.user_id, user.id))
							.all();

						emit.next({
							organizations: memberships.map((m) => m.organization),
						});
					} catch (err) {
						console.error("[organizations] Failed to fetch orgs:", err);
					}
				};

				handler();
				syncEmitter.on(SYNC_EVENTS.ORGANIZATIONS_UPDATED, handler);
				syncEmitter.on(SYNC_EVENTS.ORGANIZATION_MEMBERS_UPDATED, handler);

				return () => {
					syncEmitter.off(SYNC_EVENTS.ORGANIZATIONS_UPDATED, handler);
					syncEmitter.off(SYNC_EVENTS.ORGANIZATION_MEMBERS_UPDATED, handler);
				};
			});
		}),
	});
};
