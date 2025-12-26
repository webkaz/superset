import { createContext, useContext, type ReactNode } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

interface ActiveOrganizationContextValue {
	activeOrganizationId: string;
}

const ActiveOrganizationContext =
	createContext<ActiveOrganizationContextValue | null>(null);

export function ActiveOrganizationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { data: activeOrganizationId, isLoading, error } =
		trpc.settings.getActiveOrganizationId.useQuery();

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	if (error || !activeOrganizationId) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="flex flex-col items-center gap-3 text-center max-w-sm">
					<HiExclamationTriangle className="h-10 w-10 text-destructive" />
					<h2 className="text-lg font-semibold">No Organization Found</h2>
					<p className="text-sm text-muted-foreground">
						{error?.message || "You need to be part of an organization to use this feature."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<ActiveOrganizationContext.Provider value={{ activeOrganizationId }}>
			{children}
		</ActiveOrganizationContext.Provider>
	);
}

export function useActiveOrganizationId(): string {
	const context = useContext(ActiveOrganizationContext);
	if (!context) {
		throw new Error(
			"useActiveOrganizationId must be used within ActiveOrganizationProvider",
		);
	}
	return context.activeOrganizationId;
}
