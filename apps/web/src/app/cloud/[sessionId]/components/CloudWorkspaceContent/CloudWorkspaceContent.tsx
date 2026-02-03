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
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@superset/ui/sidebar";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	LuArchive,
	LuArrowUp,
	LuCheck,
	LuEllipsis,
	LuExternalLink,
	LuFile,
	LuGitBranch,
	LuGithub,
	LuGitPullRequest,
	LuGlobe,
	LuLoader,
	LuPencil,
	LuSquare,
	LuTerminal,
	LuWifi,
	LuWifiOff,
	LuX,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import { CloudSidebar, type CloudWorkspace } from "../../../components/CloudSidebar";
import {
	type Artifact,
	type CloudEvent,
	type FileChange,
	type ParticipantPresence,
	useCloudSession,
} from "../../hooks";
import { ToolCallGroup } from "../ToolCallGroup";

type GroupedEvent =
	| { type: "assistant_message"; id: string; text: string }
	| { type: "user_message"; id: string; content: string }
	| {
			type: "tool_call_group";
			id: string;
			events: CloudEvent[];
			toolName: string;
	  }
	| { type: "other"; event: CloudEvent };

function groupEvents(events: CloudEvent[]): GroupedEvent[] {
	const result: GroupedEvent[] = [];
	let currentTokenGroup: { id: string; tokens: string[] } | null = null;
	let currentToolGroup: {
		id: string;
		events: CloudEvent[];
		toolName: string;
	} | null = null;

	const flushTokens = () => {
		if (currentTokenGroup) {
			result.push({
				type: "assistant_message",
				id: currentTokenGroup.id,
				text: currentTokenGroup.tokens.join(""),
			});
			currentTokenGroup = null;
		}
	};

	const flushTools = () => {
		if (currentToolGroup) {
			result.push({
				type: "tool_call_group",
				id: currentToolGroup.id,
				events: currentToolGroup.events,
				toolName: currentToolGroup.toolName,
			});
			currentToolGroup = null;
		}
	};

	for (const event of events) {
		if (event.type === "heartbeat") continue;

		if (event.type === "user_message") {
			flushTokens();
			flushTools();
			const data = event.data as { content?: string };
			result.push({
				type: "user_message",
				id: event.id,
				content: data.content || "",
			});
		} else if (event.type === "token") {
			flushTools();
			// OpenCode sends cumulative content, not individual tokens
			const data = event.data as { content?: string; token?: string };
			const text = data.content || data.token;
			if (text) {
				// Since content is cumulative, we replace rather than append
				if (!currentTokenGroup) {
					currentTokenGroup = { id: event.id, tokens: [] };
				}
				// Clear previous tokens and set the cumulative text
				currentTokenGroup.tokens = [text];
			}
		} else if (event.type === "tool_call") {
			flushTokens();
			const data = event.data as { name?: string };
			const toolName = data.name || "Unknown";

			if (currentToolGroup && currentToolGroup.toolName === toolName) {
				currentToolGroup.events.push(event);
			} else {
				flushTools();
				currentToolGroup = {
					id: event.id,
					events: [event],
					toolName,
				};
			}
		} else {
			flushTokens();
			flushTools();
			result.push({ type: "other", event });
		}
	}

	flushTokens();
	flushTools();

	return result;
}

interface CloudWorkspaceContentProps {
	workspace: CloudWorkspace;
	workspaces: CloudWorkspace[];
}

const CONTROL_PLANE_URL =
	env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
	"https://superset-control-plane.avi-6ac.workers.dev";

export function CloudWorkspaceContent({
	workspace,
	workspaces: initialWorkspaces,
}: CloudWorkspaceContentProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const searchParams = useSearchParams();
	const initialPromptRef = useRef<string | null>(null);
	const hasSentInitialPrompt = useRef(false);

	const [promptInput, setPromptInput] = useState("");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(workspace.title);
	const [isMounted, setIsMounted] = useState(false);
	const [showArchiveDialog, setShowArchiveDialog] = useState(false);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Track hydration to avoid Radix ID mismatch
	useEffect(() => {
		setIsMounted(true);
	}, []);

	// Update title mutation
	const updateMutation = useMutation(
		trpc.cloudWorkspace.update.mutationOptions({
			onSuccess: () => {
				setIsEditingTitle(false);
				// Refresh the page to get updated server data (sidebar uses server-fetched data)
				router.refresh();
			},
		}),
	);

	// Archive mutation
	const archiveMutation = useMutation(
		trpc.cloudWorkspace.archive.mutationOptions({
			onSuccess: () => {
				router.push("/cloud");
			},
		}),
	);

	const handleTitleSave = useCallback(() => {
		if (editedTitle.trim() && editedTitle !== workspace.title) {
			updateMutation.mutate({ id: workspace.id, title: editedTitle.trim() });
		} else {
			setIsEditingTitle(false);
			setEditedTitle(workspace.title);
		}
	}, [editedTitle, workspace.title, workspace.id, updateMutation]);

	const handleTitleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleTitleSave();
			} else if (e.key === "Escape") {
				setIsEditingTitle(false);
				setEditedTitle(workspace.title);
			}
		},
		[handleTitleSave, workspace.title],
	);

	const handleArchive = useCallback(() => {
		archiveMutation.mutate({ id: workspace.id });
	}, [archiveMutation, workspace.id]);

	// Focus title input when editing starts
	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
			titleInputRef.current.select();
		}
	}, [isEditingTitle]);

	const {
		isConnected,
		isConnecting,
		isReconnecting,
		reconnectAttempt,
		isLoadingHistory,
		isSpawning,
		isProcessing,
		isSandboxReady,
		isControlPlaneAvailable,
		spawnAttempt,
		maxSpawnAttempts,
		error,
		sessionState,
		events,
		pendingPrompts,
		sendPrompt,
		sendStop,
		sendTyping,
		spawnSandbox,
		clearError,
	} = useCloudSession({
		controlPlaneUrl: CONTROL_PLANE_URL,
		sessionId: workspace.sessionId,
	});

	const isExecuting = isProcessing || sessionState?.sandboxStatus === "running";
	const canSendPrompt = isConnected && isSandboxReady && !isProcessing;

	// Auto-scroll to bottom when new events arrive
	useEffect(() => {
		if (scrollAreaRef.current) {
			const scrollContainer = scrollAreaRef.current.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}
		}
	}, []);

	const handleSendPrompt = useCallback(() => {
		if (promptInput.trim() && canSendPrompt) {
			sendPrompt(promptInput.trim());
			setPromptInput("");
			textareaRef.current?.focus();
		}
	}, [promptInput, canSendPrompt, sendPrompt]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSendPrompt();
			}
		},
		[handleSendPrompt],
	);

	// Global keyboard shortcuts
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
			const modKey = isMac ? e.metaKey : e.ctrlKey;

			// ⌘+Enter or Ctrl+Enter to send prompt
			if (modKey && e.key === "Enter") {
				e.preventDefault();
				handleSendPrompt();
				return;
			}

			// Escape to stop execution
			if (e.key === "Escape" && isExecuting) {
				e.preventDefault();
				sendStop();
				return;
			}

			// ⌘+K or Ctrl+K to focus input
			if (modKey && e.key === "k") {
				e.preventDefault();
				textareaRef.current?.focus();
				return;
			}

			// Note: ⌘+B for sidebar toggle is handled by SidebarProvider
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, [handleSendPrompt, isExecuting, sendStop]);

	// Auto-send initial prompt from URL when sandbox is ready
	useEffect(() => {
		// Capture initial prompt from URL on mount
		if (initialPromptRef.current === null) {
			const prompt = searchParams.get("prompt");
			initialPromptRef.current = prompt || "";

			// If there's a prompt, pre-populate the input
			if (prompt) {
				setPromptInput(prompt);
				// Clear the URL param to avoid re-sending on refresh
				router.replace(`/cloud/${workspace.sessionId}`, { scroll: false });
			}
		}
	}, [searchParams, router, workspace.sessionId]);

	// Send initial prompt when sandbox becomes ready
	useEffect(() => {
		if (
			isSandboxReady &&
			isConnected &&
			!hasSentInitialPrompt.current &&
			initialPromptRef.current &&
			initialPromptRef.current.trim()
		) {
			hasSentInitialPrompt.current = true;
			const prompt = initialPromptRef.current;
			console.log(
				"[cloud-workspace] Auto-sending initial prompt:",
				prompt.substring(0, 50),
			);
			sendPrompt(prompt);
			setPromptInput("");
		}
	}, [isSandboxReady, isConnected, sendPrompt]);

	const groupedEvents = useMemo(() => groupEvents(events), [events]);

	return (
		<SidebarProvider>
			<CloudSidebar
				initialWorkspaces={initialWorkspaces}
				activeSessionId={workspace.sessionId}
				realtimeSandboxStatus={sessionState?.sandboxStatus}
			/>

			<SidebarInset>
				{/* Header */}
				<header className="h-14 flex items-center gap-3 border-b px-4">
					<SidebarTrigger />
					<div className="flex-1 min-w-0">
						{isEditingTitle ? (
							<div className="flex items-center gap-1">
								<Input
									ref={titleInputRef}
									value={editedTitle}
									onChange={(e) => setEditedTitle(e.target.value)}
									onKeyDown={handleTitleKeyDown}
									onBlur={handleTitleSave}
									className="h-7 text-sm font-semibold"
									disabled={updateMutation.isPending}
								/>
								{updateMutation.isPending && (
									<LuLoader className="size-4 animate-spin" />
								)}
							</div>
						) : (
							<button
								type="button"
								onClick={() => setIsEditingTitle(true)}
								className="text-sm font-semibold truncate hover:text-muted-foreground transition-colors text-left w-full flex items-center gap-1 group"
							>
								<span className="truncate">{workspace.title}</span>
								<LuPencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
							</button>
						)}
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<LuGithub className="size-3" />
							<span className="truncate">
								{workspace.repoOwner}/{workspace.repoName}
							</span>
							<LuGitBranch className="size-3" />
							<span className="truncate">{workspace.branch}</span>
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{/* Connection status */}
						<Badge
							variant={isConnected ? "default" : "secondary"}
							className="gap-1"
						>
							{isConnecting || isReconnecting ? (
								<LuLoader className="size-3 animate-spin" />
							) : isConnected ? (
								<LuWifi className="size-3" />
							) : (
								<LuWifiOff className="size-3" />
							)}
							{isReconnecting
								? `Reconnecting (${reconnectAttempt}/5)...`
								: isConnecting
									? "Connecting..."
									: isConnected
										? "Connected"
										: "Disconnected"}
						</Badge>
						<Badge variant="outline">{workspace.status}</Badge>
						{(sessionState?.sandboxStatus ||
							workspace.sandboxStatus ||
							isSpawning) && (
							<Badge
								variant={
									(sessionState?.sandboxStatus || workspace.sandboxStatus) ===
									"ready"
										? "default"
										: "secondary"
								}
								className="gap-1"
							>
								{(isSpawning ||
									sessionState?.sandboxStatus === "warming" ||
									sessionState?.sandboxStatus === "syncing") && (
									<LuLoader className="size-3 animate-spin" />
								)}
								{isSpawning
									? spawnAttempt > 0
										? `Spawning (${spawnAttempt + 1}/${maxSpawnAttempts})...`
										: "Spawning..."
									: sessionState?.sandboxStatus === "warming"
										? "Warming..."
										: sessionState?.sandboxStatus || workspace.sandboxStatus}
							</Badge>
						)}
						{/* Artifacts - PR and Preview links */}
						{sessionState?.artifacts && sessionState.artifacts.length > 0 && (
							<div className="flex items-center gap-1">
								{sessionState.artifacts.map((artifact) => (
									<ArtifactButton key={artifact.id} artifact={artifact} />
								))}
							</div>
						)}
						{/* Files changed indicator */}
						{sessionState?.filesChanged &&
							sessionState.filesChanged.length > 0 &&
							isMounted && (
								<FilesChangedDropdown files={sessionState.filesChanged} />
							)}
						{/* Participant avatars */}
						{sessionState?.participants &&
							sessionState.participants.length > 0 && (
								<ParticipantAvatars participants={sessionState.participants} />
							)}
						{/* Session menu - only render after hydration to avoid Radix ID mismatch */}
						{isMounted ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="size-8">
										<LuEllipsis className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
										<LuPencil className="size-4 mr-2" />
										Rename
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() => setShowArchiveDialog(true)}
										className="text-destructive focus:text-destructive"
									>
										<LuArchive className="size-4 mr-2" />
										Archive Session
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button variant="ghost" size="icon" className="size-8">
								<LuEllipsis className="size-4" />
							</Button>
						)}
					</div>
				</header>

				{/* Main content area */}
				<main className="flex min-h-0 flex-1 flex-col">
					{/* Events display */}
					<ScrollArea ref={scrollAreaRef} className="flex-1 h-full">
						<div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
							{events.length === 0 && !error && (
								<div className="flex flex-col items-center justify-center py-12 text-center">
									<div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
										<LuTerminal className="size-5 text-muted-foreground" />
									</div>
									<h3 className="text-sm font-medium text-foreground mb-1">
										{isSpawning
											? "Starting cloud sandbox..."
											: isConnected
												? sessionState?.sandboxStatus === "ready"
													? "Ready to start"
													: "Preparing workspace..."
												: isConnecting
													? "Connecting..."
													: "Waiting for connection..."}
									</h3>
									<p className="text-xs text-muted-foreground max-w-xs">
										{isSpawning
											? "This may take a moment"
											: isConnected && sessionState?.sandboxStatus === "ready"
												? "Send a message to start working with Claude"
												: "Please wait while we set things up"}
									</p>
								</div>
							)}

							{isLoadingHistory && isConnected && events.length === 0 && (
								<div className="flex items-center justify-center py-4">
									<LuLoader className="size-5 animate-spin text-muted-foreground" />
									<span className="ml-2 text-sm text-muted-foreground">
										Loading history...
									</span>
								</div>
							)}

							{groupedEvents.map((grouped, index) => {
								if (grouped.type === "user_message") {
									return (
										<UserMessage
											key={`user-${index}-${grouped.id}`}
											content={grouped.content}
										/>
									);
								}
								if (grouped.type === "assistant_message") {
									return (
										<AssistantMessage
											key={`assistant-${index}-${grouped.id}`}
											text={grouped.text}
										/>
									);
								}
								if (grouped.type === "tool_call_group") {
									return (
										<div
											key={`tools-${index}-${grouped.id}`}
											className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
										>
											<ToolCallGroup
												events={grouped.events}
												groupId={grouped.id}
											/>
										</div>
									);
								}
								return (
									<EventItem
										key={`event-${index}-${grouped.event.id}`}
										event={grouped.event}
									/>
								);
							})}
							{/* Processing indicator */}
							{isProcessing && (
								<div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-muted/40 border border-border/50">
									<div className="relative flex items-center justify-center">
										<div className="size-2 rounded-full bg-primary animate-pulse" />
										<div className="absolute size-4 rounded-full border-2 border-primary/30 animate-ping" />
									</div>
									<span className="text-sm text-muted-foreground font-medium animate-pulse">
										Claude is thinking...
									</span>
								</div>
							)}
						</div>
					</ScrollArea>
				</main>

				{/* Prompt input - sticky at bottom */}
				<div className="sticky bottom-0 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent relative z-10">
					<div className="max-w-3xl mx-auto">
						<div className="relative">
							<Textarea
								ref={textareaRef}
								value={promptInput}
								onChange={(e) => {
									setPromptInput(e.target.value);
									// Trigger sandbox pre-warming on first keystroke
									if (e.target.value.length > 0) {
										sendTyping();
									}
								}}
								onKeyDown={handleKeyDown}
								placeholder={
									!isConnected
										? "Connecting to cloud workspace..."
										: isSpawning
											? "Starting sandbox..."
											: sessionState?.sandboxStatus === "syncing"
												? "Syncing repository..."
												: !isSandboxReady
													? "Waiting for sandbox..."
													: isProcessing
														? "Processing..."
														: "What do you want to build?"
								}
								disabled={!canSendPrompt}
								rows={1}
								className="min-h-[52px] max-h-[200px] resize-none pr-14 rounded-xl border-border bg-background shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
							/>
							<div className="absolute right-2 bottom-2 flex items-center gap-1">
								{isExecuting ? (
									<Button
										variant="destructive"
										size="icon"
										onClick={sendStop}
										disabled={!isConnected}
										className="size-8 rounded-lg shrink-0"
									>
										<LuSquare className="size-4" />
									</Button>
								) : (
									<Button
										onClick={handleSendPrompt}
										disabled={!canSendPrompt || !promptInput.trim()}
										size="icon"
										className="size-8 rounded-lg shrink-0 bg-foreground text-background hover:bg-foreground/90"
									>
										{!isSandboxReady && isConnected ? (
											<LuLoader className="size-4 animate-spin" />
										) : (
											<LuArrowUp className="size-4" />
										)}
									</Button>
								)}
							</div>
						</div>
					</div>
				</div>
			</SidebarInset>

			{/* Archive Confirmation Dialog */}
			<AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive this session?</AlertDialogTitle>
						<AlertDialogDescription>
							This will archive the session and stop the cloud sandbox. You can
							view and restore archived sessions from the home page.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleArchive}
							disabled={archiveMutation.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{archiveMutation.isPending ? (
								<>
									<LuLoader className="size-4 mr-2 animate-spin" />
									Archiving...
								</>
							) : (
								"Archive"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	);
}

interface EventItemProps {
	event: CloudEvent;
}

function EventItem({ event }: EventItemProps) {
	const getEventContent = () => {
		switch (event.type) {
			case "token": {
				const data = event.data as { token?: string };
				return (
					<span className="font-mono text-sm whitespace-pre-wrap">
						{data.token}
					</span>
				);
			}

			case "tool_result": {
				const data = event.data as { result?: unknown; error?: string };
				return (
					<div className="space-y-2">
						{data.error ? (
							<pre className="text-xs bg-destructive/10 text-destructive p-3 rounded-lg overflow-x-auto font-mono">
								{data.error}
							</pre>
						) : (
							<pre className="text-xs bg-muted/30 border border-border/50 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto font-mono text-foreground/80">
								{typeof data.result === "string"
									? data.result
									: JSON.stringify(data.result, null, 2)}
							</pre>
						)}
					</div>
				);
			}

			case "error": {
				const data = event.data as { message?: string };
				return (
					<div className="flex items-start gap-2 text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
						<LuX className="size-4 shrink-0 mt-0.5" />
						<p className="text-sm">{data.message || "Unknown error"}</p>
					</div>
				);
			}

			case "git_sync": {
				const data = event.data as {
					status?: string;
					action?: string;
					branch?: string;
					repo?: string;
				};
				const action = data.status || data.action || "syncing";
				const detail = data.branch || data.repo || "";
				return (
					<div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
						<LuGitBranch className="size-3" />
						<span>
							{action}
							{detail ? `: ${detail}` : ""}
						</span>
					</div>
				);
			}

			case "execution_complete": {
				return (
					<div className="flex items-center gap-2 text-green-600 dark:text-green-500 text-xs py-1">
						<LuCheck className="size-3" />
						<span className="font-medium">Complete</span>
					</div>
				);
			}

			case "heartbeat":
			case "tool_call":
				// tool_call is handled by ToolCallGroup
				return null;

			default:
				return (
					<pre className="text-xs text-muted-foreground/60 font-mono">
						{JSON.stringify(event.data, null, 2)}
					</pre>
				);
		}
	};

	// Don't render heartbeat or tool_call events (tool_call handled separately)
	if (event.type === "heartbeat" || event.type === "tool_call") {
		return null;
	}

	return <div>{getEventContent()}</div>;
}

function UserMessage({ content }: { content: string }) {
	return (
		<div className="flex justify-start">
			<div className="max-w-[85%] rounded-xl bg-muted/50 border border-border/50 px-4 py-2.5 shadow-sm">
				<p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
					{content}
				</p>
			</div>
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<button
			onClick={handleCopy}
			className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover/code:opacity-100"
			title={copied ? "Copied!" : "Copy code"}
		>
			{copied ? (
				<LuCheck className="size-3.5" />
			) : (
				<svg
					className="size-3.5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<rect
						x="9"
						y="9"
						width="13"
						height="13"
						rx="2"
						ry="2"
						strokeWidth="2"
					/>
					<path
						d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
						strokeWidth="2"
					/>
				</svg>
			)}
		</button>
	);
}

function AssistantMessage({ text }: { text: string }) {
	return (
		<div className="group/message">
			<div
				className="prose prose-sm dark:prose-invert max-w-none
				prose-p:text-foreground/80 prose-p:my-1 prose-p:leading-relaxed prose-p:text-sm
				prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
				prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
				prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-foreground/80 prose-li:text-sm
				prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2
				prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
				prose-blockquote:border-l-2 prose-blockquote:border-foreground/20 prose-blockquote:pl-4 prose-blockquote:text-foreground/70 prose-blockquote:not-italic
				prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
				prose-strong:text-foreground prose-strong:font-medium
			"
			>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						pre: ({ children, ...props }) => {
							// Extract code content for copy button using a ref
							const extractText = (node: React.ReactNode): string => {
								if (typeof node === "string") return node;
								if (typeof node === "number") return String(node);
								if (Array.isArray(node)) return node.map(extractText).join("");
								if (node && typeof node === "object" && "props" in node) {
									const element = node as React.ReactElement<{
										children?: React.ReactNode;
									}>;
									return extractText(element.props.children);
								}
								return "";
							};
							const codeContent = extractText(children).replace(/\n$/, "");

							return (
								<div className="relative group/code rounded-xl bg-muted/50 border border-border overflow-hidden my-2">
									<CopyButton text={codeContent} />
									<pre
										className="overflow-x-auto p-4 text-sm font-mono"
										{...props}
									>
										{children}
									</pre>
								</div>
							);
						},
						code: ({ className, children, ...props }) => {
							const isInline = !className;
							if (isInline) {
								return (
									<code
										className="rounded bg-foreground/[0.06] dark:bg-foreground/[0.1] px-1.5 py-0.5 text-[85%] font-mono"
										{...props}
									>
										{children}
									</code>
								);
							}
							return (
								<code className="font-mono text-sm" {...props}>
									{children}
								</code>
							);
						},
					}}
				>
					{text}
				</ReactMarkdown>
			</div>
		</div>
	);
}

function ArtifactButton({ artifact }: { artifact: Artifact }) {
	if (!artifact.url) return null;

	const getIcon = () => {
		switch (artifact.type) {
			case "pr":
				return <LuGitPullRequest className="size-3" />;
			case "preview":
				return <LuGlobe className="size-3" />;
			default:
				return <LuExternalLink className="size-3" />;
		}
	};

	const getLabel = () => {
		switch (artifact.type) {
			case "pr":
				return artifact.title || "PR";
			case "preview":
				return "Preview";
			default:
				return artifact.title || "Link";
		}
	};

	return (
		<Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
			<a href={artifact.url} target="_blank" rel="noopener noreferrer">
				{getIcon()}
				{getLabel()}
			</a>
		</Button>
	);
}

function ParticipantAvatars({
	participants,
}: {
	participants: ParticipantPresence[];
}) {
	const onlineParticipants = participants.filter((p) => p.isOnline);
	const offlineParticipants = participants.filter((p) => !p.isOnline);

	// Show up to 3 online avatars, then +N
	const visibleOnline = onlineParticipants.slice(0, 3);
	const remainingCount =
		onlineParticipants.length - 3 + offlineParticipants.length;

	if (participants.length === 0) return null;

	return (
		<div className="flex items-center -space-x-2">
			{visibleOnline.map((p) => (
				<div key={p.id} className="relative" title={`${p.userName} (online)`}>
					{p.avatarUrl ? (
						<img
							src={p.avatarUrl}
							alt={p.userName}
							className="size-7 rounded-full border-2 border-background"
						/>
					) : (
						<div className="size-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium">
							{p.userName.charAt(0).toUpperCase()}
						</div>
					)}
					<span className="absolute bottom-0 right-0 size-2 rounded-full bg-green-500 border border-background" />
				</div>
			))}
			{remainingCount > 0 && (
				<div
					className="size-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium"
					title={`${remainingCount} more participant${remainingCount > 1 ? "s" : ""}`}
				>
					+{remainingCount}
				</div>
			)}
		</div>
	);
}

function FilesChangedDropdown({ files }: { files: FileChange[] }) {
	const getFileIcon = (type: FileChange["type"]) => {
		switch (type) {
			case "added":
				return <span className="text-green-500">+</span>;
			case "modified":
				return <span className="text-amber-500">~</span>;
			case "deleted":
				return <span className="text-red-500">-</span>;
			default:
				return <LuFile className="size-3" />;
		}
	};

	const getFileName = (path: string) => {
		const parts = path.split("/");
		return parts[parts.length - 1];
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
					<LuFile className="size-3" />
					{files.length} file{files.length !== 1 ? "s" : ""} changed
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
				{files.slice(0, 20).map((file) => (
					<DropdownMenuItem
						key={file.path}
						className="flex items-center gap-2 font-mono text-xs"
						title={file.path}
					>
						{getFileIcon(file.type)}
						<span className="truncate">{getFileName(file.path)}</span>
					</DropdownMenuItem>
				))}
				{files.length > 20 && (
					<div className="px-2 py-1 text-xs text-muted-foreground">
						+{files.length - 20} more files
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
