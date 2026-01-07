import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { HiMiniLockClosed, HiMiniLockOpen, HiMiniXMark } from "react-icons/hi2";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import type { PlanStatus } from "shared/tabs-types";
import { DecisionBar } from "./DecisionBar";

interface PlanViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	pane: Pane;
	isActive: boolean;
	tabId: string;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function PlanViewerPane({
	paneId,
	path,
	pane,
	isActive,
	tabId,
	removePane,
	setFocusedPane,
}: PlanViewerPaneProps) {
	const planViewer = pane.planViewer;
	const [isSubmitting, setIsSubmitting] = useState(false);
	const submitResponse = trpc.plans.submitResponse.useMutation();
	const terminalWrite = trpc.terminal.write.useMutation();

	// Update plan status in store
	const updatePlanStatus = (status: PlanStatus, feedback?: string) => {
		const panes = useTabsStore.getState().panes;
		const currentPane = panes[paneId];
		if (currentPane?.planViewer) {
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						needsAttention: false, // Clear attention indicator
						planViewer: {
							...currentPane.planViewer,
							status,
							feedback,
							respondedAt: Date.now(),
						},
					},
				},
			});
		}
	};

	if (!planViewer) {
		return (
			<MosaicWindow<string> path={path} title="">
				<div className="flex items-center justify-center h-full text-muted-foreground">
					No plan viewer state
				</div>
			</MosaicWindow>
		);
	}

	const timeAgo = formatDistanceToNow(planViewer.submittedAt, {
		addSuffix: true,
	});
	const isLocked = planViewer.isLocked ?? false;

	const handleFocus = () => {
		setFocusedPane(tabId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	const handleToggleLock = () => {
		const panes = useTabsStore.getState().panes;
		const currentPane = panes[paneId];
		if (currentPane?.planViewer) {
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						planViewer: {
							...currentPane.planViewer,
							isLocked: !currentPane.planViewer.isLocked,
						},
					},
				},
			});
		}
	};

	const handleApprove = async () => {
		if (!planViewer.token) {
			console.warn("[PlanViewerPane] No token available for approval");
			return;
		}

		setIsSubmitting(true);
		try {
			await submitResponse.mutateAsync({
				planId: planViewer.planId,
				planPath: planViewer.planPath,
				originPaneId: planViewer.originPaneId,
				token: planViewer.token,
				decision: "approved",
			});
			updatePlanStatus("approved");

			// Wait for Claude to process hook response and show the "Would you like to proceed?" prompt
			await new Promise((resolve) => setTimeout(resolve, 1500));

			// Send Enter to select option 1 (already highlighted by default)
			await terminalWrite.mutateAsync({
				paneId: planViewer.originPaneId,
				data: "\r",
			});
		} catch (error) {
			console.error("[PlanViewerPane] Failed to approve plan:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleReject = async (feedback: string) => {
		if (!planViewer.token) {
			console.warn("[PlanViewerPane] No token available for rejection");
			return;
		}

		setIsSubmitting(true);
		try {
			await submitResponse.mutateAsync({
				planId: planViewer.planId,
				planPath: planViewer.planPath,
				originPaneId: planViewer.originPaneId,
				token: planViewer.token,
				decision: "rejected",
				feedback,
			});
			updatePlanStatus("rejected", feedback);
			// No terminal automation needed - hook returns deny with feedback message
			// Claude receives feedback directly and stays in/returns to plan mode
		} catch (error) {
			console.error("[PlanViewerPane] Failed to reject plan:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => (
				<div className="flex h-full w-full items-center justify-between px-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-xs font-medium">{pane.name}</span>
						<Badge variant="secondary" className="text-[10px] h-4 px-1">
							{timeAgo}
						</Badge>
						{planViewer.agentType && (
							<Badge variant="outline" className="text-[10px] h-4 px-1">
								{planViewer.agentType}
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleToggleLock}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									{isLocked ? (
										<HiMiniLockClosed className="size-3" />
									) : (
										<HiMiniLockOpen className="size-3" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{isLocked
									? "Unlock (allow plan replacement)"
									: "Lock (prevent plan replacement)"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleClosePane}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									<HiMiniXMark className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Close
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			)}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler */}
			<div
				className="flex flex-col w-full h-full bg-background"
				onClick={handleFocus}
			>
				<div className="flex-1 overflow-auto p-4">
					<MarkdownRenderer content={planViewer.content} />
				</div>
				{/* Only show DecisionBar if token is available (agent is waiting) */}
				{planViewer.token && (
					<DecisionBar
						planId={planViewer.planId}
						originPaneId={planViewer.originPaneId}
						status={planViewer.status}
						onApprove={handleApprove}
						onReject={handleReject}
						isSubmitting={isSubmitting}
					/>
				)}
			</div>
		</MosaicWindow>
	);
}
