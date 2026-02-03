"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@superset/ui/sidebar";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	LuArchive,
	LuArchiveRestore,
	LuChevronDown,
	LuChevronRight,
	LuLoader,
	LuPlus,
	LuSearch,
	LuTrash2,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

function SupersetLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 392 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Superset"
			className={className}
		>
			<path
				d="M25.2727 -0.00017944H37.9091V12.6362H25.2727V-0.00017944ZM12.6364 -0.00017944H25.2727V12.6362H12.6364V-0.00017944ZM0 12.6362H12.6364V25.2725H0V12.6362ZM0 25.2725H12.6364V37.9089H0V25.2725ZM12.6364 25.2725H25.2727V37.9089H12.6364V25.2725ZM25.2727 25.2725H37.9091V37.9089H25.2727V25.2725ZM25.2727 37.9089H37.9091V50.5453H25.2727V37.9089ZM25.2727 50.5453H37.9091V63.1816H25.2727V50.5453ZM12.6364 50.5453H25.2727V63.1816H12.6364V50.5453ZM0 50.5453H12.6364V63.1816H0V50.5453ZM0 -0.00017944H12.6364V12.6362H0V-0.00017944ZM50.4961 -0.00017944H63.1325V12.6362H50.4961V-0.00017944ZM50.4961 12.6362H63.1325V25.2725H50.4961V12.6362ZM50.4961 25.2725H63.1325V37.9089H50.4961V25.2725ZM50.4961 37.9089H63.1325V50.5453H50.4961V37.9089ZM50.4961 50.5453H63.1325V63.1816H50.4961V50.5453ZM63.1325 50.5453H75.7688V63.1816H63.1325V50.5453ZM75.7688 50.5453H88.4052V63.1816H75.7688V50.5453ZM75.7688 37.9089H88.4052V50.5453H75.7688V37.9089ZM75.7688 25.2725H88.4052V37.9089H75.7688V25.2725ZM75.7688 12.6362H88.4052V25.2725H75.7688V12.6362ZM75.7688 -0.00017944H88.4052V12.6362H75.7688V-0.00017944ZM100.992 -0.00017944H113.629V12.6362H100.992V-0.00017944ZM100.992 12.6362H113.629V25.2725H100.992V12.6362ZM100.992 25.2725H113.629V37.9089H100.992V25.2725ZM100.992 37.9089H113.629V50.5453H100.992V37.9089ZM100.992 50.5453H113.629V63.1816H100.992V50.5453ZM113.629 -0.00017944H126.265V12.6362H113.629V-0.00017944ZM126.265 -0.00017944H138.901V12.6362H126.265V-0.00017944ZM126.265 12.6362H138.901V25.2725H126.265V12.6362ZM126.265 25.2725H138.901V37.9089H126.265V25.2725ZM113.629 25.2725H126.265V37.9089H113.629V25.2725ZM151.488 -0.00017944H164.125V12.6362H151.488V-0.00017944ZM151.488 12.6362H164.125V25.2725H151.488V12.6362ZM151.488 25.2725H164.125V37.9089H151.488V25.2725ZM151.488 37.9089H164.125V50.5453H151.488V37.9089ZM151.488 50.5453H164.125V63.1816H151.488V50.5453ZM164.125 -0.00017944H176.761V12.6362H164.125V-0.00017944ZM164.125 50.5453H176.761V63.1816H164.125V50.5453ZM164.125 25.2725H176.761V37.9089H164.125V25.2725ZM176.761 -0.00017944H189.397V12.6362H176.761V-0.00017944ZM176.761 50.5453H189.397V63.1816H176.761V50.5453ZM201.984 50.5453H214.621V63.1816H201.984V50.5453ZM201.984 37.9089H214.621V50.5453H201.984V37.9089ZM201.984 25.2725H214.621V37.9089H201.984V25.2725ZM201.984 12.6362H214.621V25.2725H201.984V12.6362ZM201.984 -0.00017944H214.621V12.6362H201.984V-0.00017944ZM214.621 -0.00017944H227.257V12.6362H214.621V-0.00017944ZM227.257 -0.00017944H239.893V12.6362H227.257V-0.00017944ZM227.257 12.6362H239.893V25.2725H227.257V12.6362ZM214.621 25.2725H227.257V37.9089H214.621V25.2725ZM227.257 37.9089H239.893V50.5453H227.257V37.9089ZM227.257 50.5453H239.893V63.1816H227.257V50.5453ZM277.753 -0.00017944H290.39V12.6362H277.753V-0.00017944ZM265.117 -0.00017944H277.753V12.6362H265.117V-0.00017944ZM252.48 12.6362H265.117V25.2725H252.48V12.6362ZM252.48 25.2725H265.117V37.9089H252.48V25.2725ZM265.117 25.2725H277.753V37.9089H265.117V25.2725ZM277.753 25.2725H290.39V37.9089H277.753V25.2725ZM277.753 37.9089H290.39V50.5453H277.753V37.9089ZM277.753 50.5453H290.39V63.1816H277.753V50.5453ZM265.117 50.5453H277.753V63.1816H265.117V50.5453ZM252.48 50.5453H265.117V63.1816H252.48V50.5453ZM252.48 -0.00017944H265.117V12.6362H252.48V-0.00017944ZM302.977 -0.00017944H315.613V12.6362H302.977V-0.00017944ZM302.977 12.6362H315.613V25.2725H302.977V12.6362ZM302.977 25.2725H315.613V37.9089H302.977V25.2725ZM302.977 37.9089H315.613V50.5453H302.977V37.9089ZM302.977 50.5453H315.613V63.1816H302.977V50.5453ZM315.613 -0.00017944H328.249V12.6362H315.613V-0.00017944ZM315.613 50.5453H328.249V63.1816H315.613V50.5453ZM315.613 25.2725H328.249V37.9089H315.613V25.2725ZM328.249 -0.00017944H340.886V12.6362H328.249V-0.00017944ZM328.249 50.5453H340.886V63.1816H328.249V50.5453ZM353.473 -0.00017944H366.109V12.6362H353.473V-0.00017944ZM366.109 -0.00017944H378.745V12.6362H366.109V-0.00017944ZM378.745 -0.00017944H391.382V12.6362H378.745V-0.00017944ZM366.109 12.6362H378.745V25.2725H366.109V12.6362ZM366.109 25.2725H378.745V37.9089H366.109V25.2725ZM366.109 37.9089H378.745V50.5453H366.109V37.9089ZM366.109 50.5453H378.745V63.1816H366.109V50.5453Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export interface CloudWorkspace {
	id: string;
	sessionId: string;
	title: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	status: string;
	sandboxStatus: string | null;
	model: string | null;
	linearIssueKey?: string | null;
	prUrl?: string | null;
	prNumber?: number | null;
	createdAt: Date;
	updatedAt: Date;
}

interface ArchivedWorkspace {
	id: string;
	sessionId: string;
	title: string;
	repoOwner: string;
	repoName: string;
	archivedAt: Date | null;
}

interface CloudSidebarProps {
	initialWorkspaces: CloudWorkspace[];
	activeSessionId?: string;
	realtimeSandboxStatus?: string;
	className?: string;
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return "now";
}

function isInactive(date: Date): boolean {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const days = diff / (1000 * 60 * 60 * 24);
	return days > 7;
}

export function CloudSidebar({
	initialWorkspaces,
	activeSessionId,
	realtimeSandboxStatus,
	className,
}: CloudSidebarProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	const { data: polledWorkspaces } = useQuery({
		...trpc.cloudWorkspace.list.queryOptions(),
		refetchInterval: 30000,
		staleTime: 0,
	});

	const { data: archivedWorkspaces = [] } = useQuery({
		...trpc.cloudWorkspace.listArchived.queryOptions(),
		enabled: showArchived,
	});

	const unarchiveMutation = useMutation(
		trpc.cloudWorkspace.unarchive.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.cloudWorkspace.list.queryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.cloudWorkspace.listArchived.queryKey(),
				});
			},
		}),
	);

	const deleteMutation = useMutation(
		trpc.cloudWorkspace.delete.mutationOptions({
			onSuccess: () => {
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({
					queryKey: trpc.cloudWorkspace.listArchived.queryKey(),
				});
			},
		}),
	);

	const workspaces = useMemo(() => {
		if (polledWorkspaces) {
			return polledWorkspaces.map((w) => ({
				id: w.id,
				sessionId: w.sessionId,
				title: w.title,
				repoOwner: w.repoOwner,
				repoName: w.repoName,
				branch: w.branch,
				baseBranch: w.baseBranch,
				status: w.status,
				sandboxStatus: w.sandboxStatus,
				model: w.model,
				createdAt: w.createdAt,
				updatedAt: w.updatedAt,
			}));
		}
		return initialWorkspaces;
	}, [polledWorkspaces, initialWorkspaces]);

	const filteredWorkspaces = useMemo(() => {
		if (!searchQuery.trim()) return workspaces;
		const query = searchQuery.toLowerCase();
		return workspaces.filter(
			(w) =>
				w.title?.toLowerCase().includes(query) ||
				`${w.repoOwner}/${w.repoName}`.toLowerCase().includes(query),
		);
	}, [workspaces, searchQuery]);

	const activeWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => !isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	const inactiveWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	const getStatusColor = (workspace: CloudWorkspace) => {
		const sandboxStatus =
			workspace.sessionId === activeSessionId
				? (realtimeSandboxStatus ?? workspace.sandboxStatus)
				: workspace.sandboxStatus;

		if (sandboxStatus === "ready" || sandboxStatus === "running") {
			return "bg-emerald-500";
		}
		if (sandboxStatus === "warming" || sandboxStatus === "syncing") {
			return "bg-amber-500 animate-pulse";
		}
		if (sandboxStatus === "error" || sandboxStatus === "failed") {
			return "bg-red-500";
		}
		return "bg-muted-foreground/30";
	};

	return (
		<>
			<Sidebar className={className}>
				<SidebarHeader className="border-b">
					<div className="flex items-center justify-between px-2">
						<Link href="/cloud" className="hover:opacity-80 transition-opacity">
							<SupersetLogo className="h-4" />
						</Link>
						<Button variant="ghost" size="icon" className="size-8" asChild>
							<Link href="/cloud/new">
								<LuPlus className="size-4" />
							</Link>
						</Button>
					</div>
				</SidebarHeader>

				<SidebarContent>
					<SidebarGroup>
						<div className="relative px-2">
							<LuSearch className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
							<SidebarInput
								placeholder="Search..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8"
							/>
						</div>
					</SidebarGroup>

					{filteredWorkspaces.length === 0 ? (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							{searchQuery ? "No sessions found" : "No sessions yet"}
						</div>
					) : (
						<>
							{activeWorkspaces.length > 0 && (
								<SidebarGroup>
									<SidebarGroupContent>
										<SidebarMenu>
											{activeWorkspaces.map((workspace) => (
												<SidebarMenuItem key={workspace.id}>
													<SidebarMenuButton
														asChild
														isActive={workspace.sessionId === activeSessionId}
													>
														<Link href={`/cloud/${workspace.sessionId}`}>
															<div
																className={cn(
																	"size-2 rounded-full shrink-0",
																	getStatusColor(workspace),
																)}
															/>
															<span className="truncate">
																{workspace.title ||
																	`${workspace.repoOwner}/${workspace.repoName}`}
															</span>
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}

							{inactiveWorkspaces.length > 0 && (
								<SidebarGroup>
									<SidebarGroupLabel>Older</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu>
											{inactiveWorkspaces.map((workspace) => (
												<SidebarMenuItem key={workspace.id}>
													<SidebarMenuButton
														asChild
														isActive={workspace.sessionId === activeSessionId}
													>
														<Link href={`/cloud/${workspace.sessionId}`}>
															<div
																className={cn(
																	"size-2 rounded-full shrink-0",
																	getStatusColor(workspace),
																)}
															/>
															<span className="truncate">
																{workspace.title ||
																	`${workspace.repoOwner}/${workspace.repoName}`}
															</span>
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}

							<SidebarGroup>
								<Collapsible open={showArchived} onOpenChange={setShowArchived}>
									<CollapsibleTrigger asChild>
										<SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md gap-2">
											{showArchived ? (
												<LuChevronDown className="size-4" />
											) : (
												<LuChevronRight className="size-4" />
											)}
											<LuArchive className="size-4" />
											<span>Archived</span>
											{archivedWorkspaces.length > 0 && (
												<span className="ml-auto text-muted-foreground">
													{archivedWorkspaces.length}
												</span>
											)}
										</SidebarGroupLabel>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<SidebarGroupContent>
											{archivedWorkspaces.length === 0 ? (
												<div className="px-2 py-3 text-xs text-muted-foreground">
													No archived sessions
												</div>
											) : (
												<SidebarMenu>
													{archivedWorkspaces.map((workspace) => (
														<SidebarMenuItem
															key={workspace.id}
															className="group/archived"
														>
															<SidebarMenuButton className="text-muted-foreground">
																<div className="size-2 rounded-full bg-muted-foreground/20 shrink-0" />
																<span className="truncate">
																	{workspace.title ||
																		`${workspace.repoOwner}/${workspace.repoName}`}
																</span>
															</SidebarMenuButton>
															<div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/archived:opacity-100 transition-opacity">
																<Button
																	variant="ghost"
																	size="icon"
																	className="size-6"
																	onClick={() =>
																		unarchiveMutation.mutate({
																			id: workspace.id,
																		})
																	}
																	disabled={unarchiveMutation.isPending}
																>
																	{unarchiveMutation.isPending &&
																	unarchiveMutation.variables?.id ===
																		workspace.id ? (
																		<LuLoader className="size-3 animate-spin" />
																	) : (
																		<LuArchiveRestore className="size-3" />
																	)}
																</Button>
																<Button
																	variant="ghost"
																	size="icon"
																	className="size-6 text-destructive hover:text-destructive"
																	onClick={() =>
																		setDeleteConfirmId(workspace.id)
																	}
																>
																	<LuTrash2 className="size-3" />
																</Button>
															</div>
														</SidebarMenuItem>
													))}
												</SidebarMenu>
											)}
										</SidebarGroupContent>
									</CollapsibleContent>
								</Collapsible>
							</SidebarGroup>
						</>
					)}
				</SidebarContent>

				<SidebarFooter className="border-t">
					<div className="px-2 text-xs text-muted-foreground">
						{workspaces.length} sessions
					</div>
				</SidebarFooter>
			</Sidebar>

			<AlertDialog
				open={!!deleteConfirmId}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this session permanently?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. The session and all its data will be
							permanently deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })
							}
							disabled={deleteMutation.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending ? (
								<>
									<LuLoader className="size-4 mr-2 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
