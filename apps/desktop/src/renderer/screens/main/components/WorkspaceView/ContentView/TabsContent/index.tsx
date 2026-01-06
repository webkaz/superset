import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { ResizablePanel } from "../../../ResizablePanel";
import { Sidebar } from "../../Sidebar";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

/**
 * Check if a tab contains at least one terminal pane.
 * Used to determine which tabs need to stay mounted for persistence.
 */
function hasTerminalPane(tab: Tab, panes: Record<string, Pane>): boolean {
	const paneIds = extractPaneIdsFromLayout(tab.layout);
	return paneIds.some((paneId) => panes[paneId]?.type === "terminal");
}

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: terminalPersistence } =
		trpc.settings.getTerminalPersistence.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
	} = useSidebarStore();

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;

		// Prefer the store's active tab, but fall back to the first tab to avoid a
		// blank render when activeTabIds isn't hydrated yet.
		return (
			activeTabIds[activeWorkspaceId] ??
			allTabs.find((tab) => tab.workspaceId === activeWorkspaceId)?.id ??
			null
		);
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

	// When terminal persistence is enabled, keep terminal-containing tabs mounted
	// across workspace/tab switches. This prevents TUI white screen issues by
	// avoiding the unmount/remount cycle that requires complex reattach/rehydration.
	// Non-terminal tabs use normal unmount behavior to save memory.
	// Uses visibility:hidden (not display:none) to preserve xterm dimensions.
	if (terminalPersistence) {
		// Partition tabs: terminal tabs stay mounted, non-terminal tabs unmount when inactive
		const terminalTabs = allTabs.filter((tab) => hasTerminalPane(tab, panes));
		const activeNonTerminalTab =
			tabToRender && !hasTerminalPane(tabToRender, panes) ? tabToRender : null;

		return (
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<div className="relative flex-1 min-w-0">
					{/* Terminal tabs: keep mounted with visibility toggle */}
					{terminalTabs.map((tab) => {
						const isVisible =
							tab.workspaceId === activeWorkspaceId && tab.id === activeTabId;

						return (
							<div
								key={tab.id}
								className="absolute inset-0"
								style={{
									visibility: isVisible ? "visible" : "hidden",
									pointerEvents: isVisible ? "auto" : "none",
								}}
							>
								<TabView tab={tab} isTabVisible={isVisible} />
							</div>
						);
					})}
					{/* Active non-terminal tab: render normally (unmounts when switching) */}
					{activeNonTerminalTab && (
						<div className="absolute inset-0">
							<TabView tab={activeNonTerminalTab} panes={panes} />
						</div>
					)}
					{/* Fallback: show empty view without unmounting terminal tabs */}
					{!activeNonTerminalTab && !tabToRender && (
						<div className="absolute inset-0 overflow-hidden">
							<EmptyTabView />
						</div>
					)}
				</div>
				{isSidebarOpen && (
					<ResizablePanel
						width={sidebarWidth}
						onWidthChange={setSidebarWidth}
						isResizing={isResizing}
						onResizingChange={setIsResizing}
						minWidth={MIN_SIDEBAR_WIDTH}
						maxWidth={MAX_SIDEBAR_WIDTH}
						handleSide="left"
					>
						<Sidebar />
					</ResizablePanel>
				)}
			</div>
		);
	}

	// Original behavior when persistence disabled: only render active tab
	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden">
				{tabToRender ? (
					<TabView tab={tabToRender} isTabVisible />
				) : (
					<EmptyTabView />
				)}
			</div>
			{isSidebarOpen && (
				<ResizablePanel
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="left"
				>
					<Sidebar />
				</ResizablePanel>
			)}
		</div>
	);
}
