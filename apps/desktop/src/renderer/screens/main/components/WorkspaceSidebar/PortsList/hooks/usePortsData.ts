import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { MergedPort } from "shared/types";
import { mergePorts } from "../utils";

/** Poll interval for detected ports — matches the port scanner's scan cycle */
const PORTS_REFETCH_INTERVAL_MS = 2500;

export interface MergedWorkspaceGroup {
	workspaceId: string;
	workspaceName: string;
	ports: MergedPort[];
}

export function usePortsData() {
	const { data: allWorkspaces } = electronTrpc.workspaces.getAll.useQuery();

	const utils = electronTrpc.useUtils();

	const { data: allStaticPortsData } =
		electronTrpc.ports.getAllStatic.useQuery();

	// Subscribe to all static port changes across all workspaces
	electronTrpc.ports.subscribeAllStatic.useSubscription(undefined, {
		onData: () => {
			utils.ports.getAllStatic.invalidate();
		},
	});

	// Use the query as the single source of truth for detected ports.
	// refetchInterval keeps the UI in sync with the port scanner.
	// The subscription triggers immediate refetches on port add/remove events.
	const { data: detectedPorts } = electronTrpc.ports.getAll.useQuery(
		undefined,
		{ refetchInterval: PORTS_REFETCH_INTERVAL_MS },
	);

	electronTrpc.ports.subscribe.useSubscription(undefined, {
		onData: () => {
			utils.ports.getAll.invalidate();
		},
	});

	const ports = detectedPorts ?? [];

	const workspaceNames = useMemo(() => {
		if (!allWorkspaces) return {};
		return allWorkspaces.reduce(
			(acc, ws) => {
				acc[ws.id] = ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces]);

	// Prevent showing duplicate error toasts on re-renders
	const shownErrorsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const errors = allStaticPortsData?.errors ?? [];
		for (const { workspaceId, error } of errors) {
			const errorKey = `${workspaceId}:${error}`;
			if (!shownErrorsRef.current.has(errorKey)) {
				shownErrorsRef.current.add(errorKey);
				const workspaceName =
					workspaceNames[workspaceId] || "Unknown workspace";
				toast.error(`Failed to load ports.json in ${workspaceName}`, {
					description: error,
				});
			}
		}
	}, [allStaticPortsData?.errors, workspaceNames]);

	const allWorkspaceIds = useMemo(() => {
		const ids = new Set<string>();

		for (const port of allStaticPortsData?.ports ?? []) {
			ids.add(port.workspaceId);
		}

		for (const port of ports) {
			ids.add(port.workspaceId);
		}

		return Array.from(ids);
	}, [allStaticPortsData?.ports, ports]);

	const workspacePortGroups = useMemo(() => {
		const allStaticPorts = allStaticPortsData?.ports ?? [];

		const groups: MergedWorkspaceGroup[] = allWorkspaceIds.map(
			(workspaceId) => {
				const staticPortsForWorkspace = allStaticPorts.filter(
					(p) => p.workspaceId === workspaceId,
				);

				const merged = mergePorts({
					staticPorts: staticPortsForWorkspace,
					dynamicPorts: ports,
					workspaceId,
				});

				return {
					workspaceId,
					workspaceName: workspaceNames[workspaceId] || "Unknown",
					ports: merged,
				};
			},
		);

		// Remove workspaces with no active ports and sort alphabetically
		return groups
			.filter((g) => g.ports.length > 0)
			.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
	}, [allWorkspaceIds, allStaticPortsData?.ports, ports, workspaceNames]);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	return {
		workspacePortGroups,
		totalPortCount,
	};
}
