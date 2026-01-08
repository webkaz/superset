import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useRef } from "react";
import { LuChevronRight, LuExternalLink, LuRadioTower } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { type DetectedPort, usePortsStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { StaticPort } from "shared/types";
import { STROKE_WIDTH } from "../constants";

interface WorkspaceGroup {
	workspaceId: string;
	workspaceName: string;
	isCurrentWorkspace: boolean;
	ports: DetectedPort[];
}

export function PortsList() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allWorkspaces } = trpc.workspaces.getAll.useQuery();
	const ports = usePortsStore((s) => s.ports);
	const setPorts = usePortsStore((s) => s.setPorts);
	const addPort = usePortsStore((s) => s.addPort);
	const removePort = usePortsStore((s) => s.removePort);
	const isCollapsed = usePortsStore((s) => s.isListCollapsed);
	const toggleCollapsed = usePortsStore((s) => s.toggleListCollapsed);

	const utils = trpc.useUtils();

	// Check if the active workspace has static ports config
	const { data: staticConfigCheck } = trpc.ports.hasStaticConfig.useQuery(
		{ workspaceId: activeWorkspace?.id ?? "" },
		{ enabled: !!activeWorkspace?.id },
	);

	const useStaticPorts = staticConfigCheck?.hasStatic ?? false;

	// Fetch static ports if config exists
	const { data: staticPortsData } = trpc.ports.getStatic.useQuery(
		{ workspaceId: activeWorkspace?.id ?? "" },
		{ enabled: useStaticPorts && !!activeWorkspace?.id },
	);

	// Subscribe to static ports file changes (always enabled to detect file creation)
	trpc.ports.subscribeStatic.useSubscription(
		{ workspaceId: activeWorkspace?.id ?? "" },
		{
			enabled: !!activeWorkspace?.id,
			onData: () => {
				// Invalidate queries to refetch the latest data
				utils.ports.hasStaticConfig.invalidate({
					workspaceId: activeWorkspace?.id ?? "",
				});
				utils.ports.getStatic.invalidate({
					workspaceId: activeWorkspace?.id ?? "",
				});
			},
		},
	);

	// Track if we've shown the error toast for this error
	const lastErrorRef = useRef<string | null>(null);

	// Show toast error for static ports if there's an error
	useEffect(() => {
		if (
			staticPortsData?.error &&
			staticPortsData.error !== lastErrorRef.current
		) {
			lastErrorRef.current = staticPortsData.error;
			toast.error("Failed to load ports.json", {
				description: staticPortsData.error,
			});
		} else if (!staticPortsData?.error) {
			lastErrorRef.current = null;
		}
	}, [staticPortsData?.error]);

	// Fetch initial dynamic ports (only when not using static)
	const { data: initialPorts } = trpc.ports.getAll.useQuery(undefined, {
		enabled: !useStaticPorts,
	});

	// Set initial dynamic ports when they load
	useEffect(() => {
		if (initialPorts && !useStaticPorts) {
			setPorts(initialPorts);
		}
	}, [initialPorts, setPorts, useStaticPorts]);

	// Subscribe to dynamic port changes (only when not using static)
	trpc.ports.subscribe.useSubscription(undefined, {
		enabled: !useStaticPorts,
		onData: (event) => {
			if (event.type === "add") {
				addPort(event.port);
			} else if (event.type === "remove") {
				removePort(event.port.paneId, event.port.port);
			}
		},
	});

	// Create a map of workspace IDs to names
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

	// Get static ports for display
	const staticPorts = useMemo(() => {
		if (!useStaticPorts || !staticPortsData?.ports) return [];
		return staticPortsData.ports.sort((a, b) => a.port - b.port);
	}, [useStaticPorts, staticPortsData?.ports]);

	// Group dynamic ports by workspace, sorted with current workspace first
	const groupedPorts = useMemo(() => {
		if (useStaticPorts) return [];

		const groups: Record<string, DetectedPort[]> = {};

		for (const port of ports) {
			if (!groups[port.workspaceId]) {
				groups[port.workspaceId] = [];
			}
			groups[port.workspaceId].push(port);
		}

		// Sort ports within each group by port number
		for (const workspaceId of Object.keys(groups)) {
			groups[workspaceId].sort((a, b) => a.port - b.port);
		}

		// Convert to array and sort groups (current workspace first)
		const result: WorkspaceGroup[] = Object.entries(groups).map(
			([workspaceId, workspacePorts]) => ({
				workspaceId,
				workspaceName: workspaceNames[workspaceId] || "Unknown",
				isCurrentWorkspace: workspaceId === activeWorkspace?.id,
				ports: workspacePorts,
			}),
		);

		result.sort((a, b) => {
			if (a.isCurrentWorkspace && !b.isCurrentWorkspace) return -1;
			if (!a.isCurrentWorkspace && b.isCurrentWorkspace) return 1;
			return a.workspaceName.localeCompare(b.workspaceName);
		});

		return result;
	}, [ports, activeWorkspace?.id, workspaceNames, useStaticPorts]);

	// Calculate total port count for display
	const totalPortCount = useStaticPorts ? staticPorts.length : ports.length;

	// Don't render if there are no ports (static or dynamic)
	if (totalPortCount === 0) {
		return null;
	}

	return (
		<div className="mt-3 pt-3 border-t border-border/40">
			<button
				type="button"
				aria-expanded={!isCollapsed}
				onClick={toggleCollapsed}
				className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pb-2 font-medium flex items-center gap-1.5 w-full hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none transition-colors"
			>
				<LuChevronRight
					className={`size-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
					strokeWidth={STROKE_WIDTH}
				/>
				<LuRadioTower className="size-3" strokeWidth={STROKE_WIDTH} />
				Ports
				<span className="text-[10px] ml-auto font-normal">
					{totalPortCount}
				</span>
			</button>
			{!isCollapsed && (
				<div className="space-y-2">
					{useStaticPorts ? (
						// Static ports - just show a flat list for the current workspace
						<div className="flex flex-wrap gap-1 px-3">
							{staticPorts.map((port) => (
								<StaticPortBadge key={port.port} port={port} />
							))}
						</div>
					) : (
						// Dynamic ports - grouped by workspace
						groupedPorts.map((group) => (
							<WorkspacePortGroup key={group.workspaceId} group={group} />
						))
					)}
				</div>
			)}
		</div>
	);
}

interface WorkspacePortGroupProps {
	group: WorkspaceGroup;
}

function WorkspacePortGroup({ group }: WorkspacePortGroupProps) {
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const handleWorkspaceClick = async () => {
		if (group.isCurrentWorkspace) return;

		await setActiveMutation.mutateAsync({ id: group.workspaceId });
		await utils.workspaces.getActive.invalidate();
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleWorkspaceClick}
				disabled={group.isCurrentWorkspace}
				className={`text-xs px-3 py-1 truncate text-left w-full transition-colors ${
					group.isCurrentWorkspace
						? "text-sidebar-foreground/80"
						: "text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
				}`}
			>
				{group.workspaceName}
			</button>
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<PortBadge
						key={`${port.paneId}:${port.port}`}
						port={port}
						isCurrentWorkspace={group.isCurrentWorkspace}
					/>
				))}
			</div>
		</div>
	);
}

interface PortBadgeProps {
	port: DetectedPort;
	isCurrentWorkspace: boolean;
}

function PortBadge({ port, isCurrentWorkspace }: PortBadgeProps) {
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const handleClick = async () => {
		// If not in current workspace, switch to it first
		if (!isCurrentWorkspace) {
			await setActiveMutation.mutateAsync({ id: port.workspaceId });
			await utils.workspaces.getActive.invalidate();
		}

		// Look up pane after potential workspace switch
		const pane = useTabsStore.getState().panes[port.paneId];
		if (!pane) return;

		// Set the tab as active for this workspace
		setActiveTab(port.workspaceId, pane.tabId);

		// Focus the specific pane
		setFocusedPane(pane.tabId, port.paneId);
	};

	const handleOpenInBrowser = () => {
		window.open(`http://localhost:${port.port}`, "_blank");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={`group relative inline-flex items-center gap-1 rounded-md text-xs font-mono transition-colors mb-2 ${
						isCurrentWorkspace
							? "bg-primary/10 text-primary hover:bg-primary/20"
							: "bg-muted/50 text-muted-foreground hover:bg-muted"
					}`}
				>
					<button
						type="button"
						onClick={handleClick}
						className="font-medium px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
					>
						{port.port}
					</button>
					<button
						type="button"
						onClick={handleOpenInBrowser}
						aria-label={`Open port ${port.port} in browser`}
						className="opacity-0 group-hover:opacity-100 pr-1.5 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				<div className="text-xs space-y-1">
					<div className="font-medium">localhost:{port.port}</div>
					<div className="text-muted-foreground">
						{port.processName} (pid {port.pid})
					</div>
					<div className="text-muted-foreground/70 text-[10px]">
						Click to jump to terminal
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

interface StaticPortBadgeProps {
	port: StaticPort;
}

function StaticPortBadge({ port }: StaticPortBadgeProps) {
	const handleOpenInBrowser = () => {
		window.open(`http://localhost:${port.port}`, "_blank");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="group relative inline-flex items-center gap-1 rounded-md text-xs transition-colors mb-2 bg-primary/10 text-primary hover:bg-primary/20">
					<span className="font-medium px-2 py-1">{port.label}</span>
					<button
						type="button"
						onClick={handleOpenInBrowser}
						aria-label={`Open ${port.label} (localhost:${port.port}) in browser`}
						className="opacity-0 group-hover:opacity-100 pr-1.5 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				<div className="text-xs">
					<div className="font-medium font-mono">localhost:{port.port}</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
