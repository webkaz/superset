import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LuArrowLeft,
	LuBot,
	LuCheck,
	LuChevronRight,
	LuCircle,
	LuCircleX,
	LuClock,
	LuExternalLink,
	LuGripVertical,
	LuLoader,
	LuMessageSquare,
	LuPanelRightClose,
	LuPanelRightOpen,
	LuPlay,
	LuPlus,
	LuRefreshCw,
	LuSearch,
	LuSend,
	LuSquare,
	LuTerminal,
	LuTrash2,
	LuUser,
	LuWrench,
	LuX,
} from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { trpc } from "renderer/lib/trpc";
import { useClosePlan } from "renderer/stores/app-state";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";

type PlanTaskStatus = "backlog" | "queued" | "running" | "completed" | "failed";
type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

interface PlanTask {
	id: string;
	planId: string;
	title: string;
	description: string | null;
	status: PlanTaskStatus;
	priority: TaskPriority | null;
	columnOrder: number;
	workspaceId: string | null;
	worktreeId: string | null;
	externalProvider: string | null;
	externalId: string | null;
	externalUrl: string | null;
	executionStatus: string | null;
	createdAt: number;
	updatedAt: number;
}

const COLUMN_CONFIG: {
	status: PlanTaskStatus;
	title: string;
	color: string;
}[] = [
	{ status: "backlog", title: "Backlog", color: "bg-muted" },
	{ status: "queued", title: "Queued", color: "bg-yellow-500" },
	{ status: "running", title: "Running", color: "bg-blue-500" },
	{ status: "completed", title: "Completed", color: "bg-green-500" },
	{ status: "failed", title: "Failed", color: "bg-red-500" },
];

export function PlanView() {
	const closePlan = useClosePlan();
	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
	const [isLinearImportOpen, setIsLinearImportOpen] = useState(false);
	const [isChatOpen, setIsChatOpen] = useState(true);
	const [selectedTask, setSelectedTask] = useState<PlanTask | null>(null);

	// Get active workspace to determine the project
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const projectId = activeWorkspace?.project?.id;

	// Get or create plan for the project
	const { data: plan, refetch: refetchPlan } =
		trpc.plan.getActiveByProject.useQuery(
			{ projectId: projectId! },
			{ enabled: !!projectId },
		);

	const createPlanMutation = trpc.plan.create.useMutation({
		onSuccess: () => refetchPlan(),
	});

	// Auto-create plan if none exists
	useEffect(() => {
		if (projectId && plan === null && !createPlanMutation.isPending) {
			createPlanMutation.mutate({ projectId });
		}
	}, [projectId, plan, createPlanMutation]);

	// Get tasks for the plan
	const { data: tasksData, refetch: refetchTasks } =
		trpc.plan.getTasksByPlan.useQuery(
			{ planId: plan?.id! },
			{ enabled: !!plan?.id },
		);

	const createTaskMutation = trpc.plan.createTask.useMutation({
		onSuccess: () => {
			refetchTasks();
			setIsCreateTaskOpen(false);
		},
	});

	const moveTaskMutation = trpc.plan.moveTask.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const deleteTaskMutation = trpc.plan.deleteTask.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const startTaskMutation = trpc.plan.start.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const stopTaskMutation = trpc.plan.stop.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const retryTaskMutation = trpc.plan.retry.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const bulkCreateTasksMutation = trpc.plan.bulkCreateTasks.useMutation({
		onSuccess: () => {
			refetchTasks();
			setIsLinearImportOpen(false);
		},
	});

	const handleCreateTask = useCallback(
		(data: {
			title: string;
			description?: string;
			priority?: TaskPriority;
		}) => {
			if (!plan?.id) return;
			createTaskMutation.mutate({
				planId: plan.id,
				title: data.title,
				description: data.description,
				priority: data.priority,
			});
		},
		[plan?.id, createTaskMutation],
	);

	const handleMoveTask = useCallback(
		(taskId: string, status: PlanTaskStatus, columnOrder: number) => {
			moveTaskMutation.mutate({ id: taskId, status, columnOrder });
		},
		[moveTaskMutation],
	);

	const handleDeleteTask = useCallback(
		(taskId: string) => {
			deleteTaskMutation.mutate({ id: taskId });
		},
		[deleteTaskMutation],
	);

	const handleStartTask = useCallback(
		(taskId: string) => {
			startTaskMutation.mutate({ taskId });
		},
		[startTaskMutation],
	);

	const handleStopTask = useCallback(
		(taskId: string) => {
			stopTaskMutation.mutate({ taskId });
		},
		[stopTaskMutation],
	);

	const handleRetryTask = useCallback(
		(taskId: string) => {
			retryTaskMutation.mutate({ taskId });
		},
		[retryTaskMutation],
	);

	const handleImportFromLinear = useCallback(
		(
			issues: Array<{
				id: string;
				identifier: string;
				title: string;
				description: string | null;
				priority: number;
				url: string;
			}>,
		) => {
			if (!plan?.id) return;

			const priorityMap: Record<number, TaskPriority> = {
				1: "urgent",
				2: "high",
				3: "medium",
				4: "low",
				0: "none",
			};

			bulkCreateTasksMutation.mutate({
				planId: plan.id,
				tasks: issues.map((issue) => ({
					title: `[${issue.identifier}] ${issue.title}`,
					description: issue.description ?? undefined,
					priority: priorityMap[issue.priority] ?? "medium",
					externalProvider: "linear",
					externalId: issue.id,
					externalUrl: issue.url,
				})),
			});
		},
		[plan?.id, bulkCreateTasksMutation],
	);

	// Keyboard shortcuts
	useAppHotkey(
		"PLAN_NEW_TASK",
		() => setIsCreateTaskOpen(true),
		{ enabled: !!plan?.id },
		[plan?.id],
	);

	useAppHotkey(
		"PLAN_IMPORT_LINEAR",
		() => setIsLinearImportOpen(true),
		{ enabled: !!plan?.id },
		[plan?.id],
	);

	useAppHotkey(
		"PLAN_TOGGLE_CHAT",
		() => setIsChatOpen((prev) => !prev),
		undefined,
		[],
	);

	useAppHotkey("PLAN_CLOSE", () => closePlan(), undefined, [closePlan]);

	if (!activeWorkspace?.project) {
		return (
			<div className="flex flex-col h-full w-full bg-background items-center justify-center">
				<p className="text-muted-foreground">
					Open a workspace to use the Plan view
				</p>
				<Button variant="outline" onClick={closePlan} className="mt-4">
					Go Back
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden bg-background">
			{/* Header */}
			<div className="flex-shrink-0 flex items-center justify-between border-b border-border px-4 py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={closePlan}
						className="size-8"
					>
						<LuArrowLeft className="size-4" />
					</Button>
					<div>
						<h1 className="text-sm font-semibold">Plan</h1>
						<p className="text-xs text-muted-foreground">
							{activeWorkspace.project.name}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<Button
						size="sm"
						variant="outline"
						className="gap-1.5 h-8"
						onClick={() => setIsLinearImportOpen(true)}
					>
						<SiLinear className="size-3" />
						Import
					</Button>
					<Button
						size="sm"
						className="gap-1.5 h-8 bg-red-500 hover:bg-red-600"
						onClick={() => setIsCreateTaskOpen(true)}
					>
						<LuPlus className="size-3.5" />
						Add Task
					</Button>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setIsChatOpen(!isChatOpen)}
									className="size-8"
								>
									{isChatOpen ? (
										<LuPanelRightClose className="size-4" />
									) : (
										<LuPanelRightOpen className="size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{isChatOpen ? "Hide Orchestrator" : "Show Orchestrator"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Main content area - split between kanban and chat */}
			<div className="flex-1 min-h-0 overflow-hidden flex">
				{/* Kanban Board */}
				<div className="flex-1 h-full overflow-hidden">
					<KanbanBoard
						tasks={tasksData?.tasks ?? []}
						onMoveTask={handleMoveTask}
						onDeleteTask={handleDeleteTask}
						onStartTask={handleStartTask}
						onStopTask={handleStopTask}
						onRetryTask={handleRetryTask}
						onSelectTask={setSelectedTask}
						selectedTaskId={selectedTask?.id}
					/>
				</div>

				{/* Orchestration Chat Panel - Collapsible */}
				<div
					className={cn(
						"h-full border-l border-border/50 transition-all duration-200 ease-in-out overflow-hidden flex-shrink-0",
						isChatOpen ? "w-80" : "w-0",
					)}
				>
					<div className="h-full w-80">
						<OrchestrationChat
							projectId={projectId!}
							planId={plan?.id ?? ""}
							onTasksChanged={() => refetchTasks()}
							onClose={() => setIsChatOpen(false)}
						/>
					</div>
				</div>
			</div>

			{/* Create Task Dialog */}
			<CreateTaskDialog
				open={isCreateTaskOpen}
				onOpenChange={setIsCreateTaskOpen}
				onSubmit={handleCreateTask}
				isLoading={createTaskMutation.isPending}
			/>

			{/* Linear Import Modal */}
			<LinearImportModal
				open={isLinearImportOpen}
				onOpenChange={setIsLinearImportOpen}
				onImport={handleImportFromLinear}
				isLoading={bulkCreateTasksMutation.isPending}
			/>

			{/* Task Detail Panel */}
			<TaskDetailPanel
				task={selectedTask}
				onClose={() => setSelectedTask(null)}
				onStartTask={handleStartTask}
				onStopTask={handleStopTask}
			/>
		</div>
	);
}

interface KanbanBoardProps {
	tasks: PlanTask[];
	onMoveTask: (
		taskId: string,
		status: PlanTaskStatus,
		columnOrder: number,
	) => void;
	onDeleteTask: (taskId: string) => void;
	onStartTask: (taskId: string) => void;
	onRetryTask: (taskId: string) => void;
	onStopTask: (taskId: string) => void;
	onSelectTask: (task: PlanTask) => void;
	selectedTaskId?: string;
}

function KanbanBoard({
	tasks,
	onMoveTask,
	onDeleteTask,
	onStartTask,
	onStopTask,
	onRetryTask,
	onSelectTask,
	selectedTaskId,
}: KanbanBoardProps) {
	// Group tasks by status
	const groupedTasks: Record<PlanTaskStatus, PlanTask[]> = {
		backlog: [],
		queued: [],
		running: [],
		completed: [],
		failed: [],
	};

	for (const task of tasks) {
		const status = task.status as PlanTaskStatus;
		groupedTasks[status].push(task);
	}

	// Sort each column by columnOrder
	for (const status of Object.keys(groupedTasks) as PlanTaskStatus[]) {
		groupedTasks[status].sort((a, b) => a.columnOrder - b.columnOrder);
	}

	return (
		<div className="h-full p-3 overflow-x-auto">
			<div className="flex gap-3 h-full">
				{COLUMN_CONFIG.map((column) => (
					<KanbanColumn
						key={column.status}
						status={column.status}
						title={column.title}
						color={column.color}
						tasks={groupedTasks[column.status]}
						onMoveTask={onMoveTask}
						onDeleteTask={onDeleteTask}
						onStartTask={onStartTask}
						onStopTask={onStopTask}
						onRetryTask={onRetryTask}
						onSelectTask={onSelectTask}
						selectedTaskId={selectedTaskId}
					/>
				))}
			</div>
		</div>
	);
}

interface KanbanColumnProps {
	status: PlanTaskStatus;
	title: string;
	color: string;
	tasks: PlanTask[];
	onMoveTask: (
		taskId: string,
		status: PlanTaskStatus,
		columnOrder: number,
	) => void;
	onDeleteTask: (taskId: string) => void;
	onStartTask: (taskId: string) => void;
	onStopTask: (taskId: string) => void;
	onRetryTask: (taskId: string) => void;
	onSelectTask: (task: PlanTask) => void;
	selectedTaskId?: string;
}

function KanbanColumn({
	status,
	title,
	color,
	tasks,
	onMoveTask,
	onDeleteTask,
	onSelectTask,
	selectedTaskId,
	onStartTask,
	onStopTask,
	onRetryTask,
}: KanbanColumnProps) {
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		if (taskId) {
			onMoveTask(taskId, status, tasks.length);
		}
	};

	return (
		<div
			className="flex flex-col flex-shrink-0 w-56 bg-muted/20 rounded-lg border border-border/50"
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
				<div className={cn("size-2.5 rounded-full", color)} />
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground ml-auto bg-muted/50 px-1.5 py-0.5 rounded">
					{tasks.length}
				</span>
			</div>
			<div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
				{tasks.length === 0 ? (
					<div className="flex items-center justify-center h-24 border border-dashed border-muted-foreground/20 rounded-md text-muted-foreground text-xs">
						Drop tasks here
					</div>
				) : (
					tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onDelete={() => onDeleteTask(task.id)}
							onStart={() => onStartTask(task.id)}
							onStop={() => onStopTask(task.id)}
							onRetry={() => onRetryTask(task.id)}
							onSelect={() => onSelectTask(task)}
							isSelected={selectedTaskId === task.id}
						/>
					))
				)}
			</div>
		</div>
	);
}

interface TaskCardProps {
	task: PlanTask;
	onDelete: () => void;
	onStart: () => void;
	onStop: () => void;
	onRetry: () => void;
	onSelect: () => void;
	isSelected?: boolean;
}

function TaskCard({
	task,
	onDelete,
	onStart,
	onStop,
	onRetry,
	onSelect,
	isSelected,
}: TaskCardProps) {
	const handleDragStart = (e: React.DragEvent) => {
		e.dataTransfer.setData("text/plain", task.id);
		e.dataTransfer.effectAllowed = "move";
	};

	const priorityColors: Record<string, string> = {
		urgent: "bg-red-500",
		high: "bg-orange-500",
		medium: "bg-yellow-500",
		low: "bg-blue-500",
		none: "bg-muted",
	};

	const isRunning = task.status === "running";
	const isQueued = task.status === "queued";
	const isFailed = task.status === "failed";
	const canStart = task.status === "backlog";
	const canStop = isRunning || isQueued;

	return (
		<TooltipProvider>
			<div
				draggable
				onDragStart={handleDragStart}
				onClick={onSelect}
				className={cn(
					"group bg-background border rounded-md p-2.5 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all",
					isSelected
						? "border-primary ring-1 ring-primary/30"
						: "border-border/80",
				)}
			>
				<div className="flex items-start gap-1.5">
					<LuGripVertical className="size-3.5 text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5">
							{task.priority && (
								<div
									className={cn(
										"size-1.5 rounded-full flex-shrink-0",
										priorityColors[task.priority] ?? "bg-muted",
									)}
									title={`Priority: ${task.priority}`}
								/>
							)}
							<span className="text-xs font-medium truncate">{task.title}</span>
							{isRunning && (
								<LuLoader className="size-3 text-blue-500 animate-spin flex-shrink-0" />
							)}
						</div>
						{task.description && (
							<p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
								{task.description}
							</p>
						)}
						{task.externalUrl && (
							<a
								href={task.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-blue-500 hover:underline mt-1 block"
								onClick={(e) => e.stopPropagation()}
							>
								View in Linear
							</a>
						)}
						{task.executionStatus && (
							<span className="text-[10px] text-muted-foreground mt-1 block capitalize">
								{task.executionStatus}
							</span>
						)}
					</div>
					<div className="flex items-center gap-0.5 flex-shrink-0">
						{canStart && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 opacity-0 group-hover:opacity-100 transition-opacity text-green-500 hover:text-green-600 hover:bg-green-500/10"
										onClick={(e) => {
											e.stopPropagation();
											onStart();
										}}
									>
										<LuPlay className="size-2.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Start
								</TooltipContent>
							</Tooltip>
						)}
						{isFailed && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
										onClick={(e) => {
											e.stopPropagation();
											onRetry();
										}}
									>
										<LuRefreshCw className="size-2.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Retry
								</TooltipContent>
							</Tooltip>
						)}
						{canStop && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
										onClick={(e) => {
											e.stopPropagation();
											onStop();
										}}
									>
										<LuSquare className="size-2.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Stop
								</TooltipContent>
							</Tooltip>
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
									onClick={(e) => {
										e.stopPropagation();
										onDelete();
									}}
								>
									<LuTrash2 className="size-2.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">
								Delete
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: {
		title: string;
		description?: string;
		priority?: TaskPriority;
	}) => void;
	isLoading: boolean;
}

function CreateTaskDialog({
	open,
	onOpenChange,
	onSubmit,
	isLoading,
}: CreateTaskDialogProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<TaskPriority>("medium");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;
		onSubmit({
			title: title.trim(),
			description: description.trim() || undefined,
			priority,
		});
		setTitle("");
		setDescription("");
		setPriority("medium");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create Task</DialogTitle>
						<DialogDescription>
							Add a new task to the backlog. You can drag it to other columns
							later.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="title">Title</Label>
							<Input
								id="title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Task title"
								autoFocus
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Task description"
								rows={3}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="priority">Priority</Label>
							<Select
								value={priority}
								onValueChange={(v) => setPriority(v as TaskPriority)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="urgent">Urgent</SelectItem>
									<SelectItem value="high">High</SelectItem>
									<SelectItem value="medium">Medium</SelectItem>
									<SelectItem value="low">Low</SelectItem>
									<SelectItem value="none">None</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!title.trim() || isLoading}>
							{isLoading && <LuLoader className="size-4 animate-spin mr-2" />}
							Create Task
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ============================================================================
// Linear Import Modal - Import issues from Linear
// ============================================================================

interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	priority: number;
	state: { id: string; name: string; color: string } | null;
	url: string;
	createdAt: string;
	updatedAt: string;
}

interface LinearImportModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImport: (issues: LinearIssue[]) => void;
	isLoading: boolean;
}

function LinearImportModal({
	open,
	onOpenChange,
	onImport,
	isLoading,
}: LinearImportModalProps) {
	const [selectedTeamId, setSelectedTeamId] = useState<string>("");
	const [selectedProjectId, setSelectedProjectId] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());

	// Get user session to get organization ID
	const { data: session } = trpc.auth.getSession.useQuery();
	const organizationId = session?.session?.activeOrganizationId;

	// Check if Linear is connected
	const { data: linearConnection, isLoading: isLoadingConnection } =
		trpc.linear.getConnection.useQuery(
			{ organizationId: organizationId! },
			{ enabled: !!organizationId },
		);

	// Get teams
	const { data: teams, isLoading: isLoadingTeams } =
		trpc.linear.getTeams.useQuery(
			{ organizationId: organizationId! },
			{ enabled: !!organizationId && !!linearConnection },
		);

	// Get projects for selected team
	const { data: projects } = trpc.linear.getProjects.useQuery(
		{ organizationId: organizationId!, teamId: selectedTeamId || undefined },
		{ enabled: !!organizationId && !!linearConnection },
	);

	// Get issues with filters
	const { data: issuesData, isLoading: isLoadingIssues } =
		trpc.linear.getIssues.useQuery(
			{
				organizationId: organizationId!,
				teamId: selectedTeamId || undefined,
				projectId: selectedProjectId || undefined,
				first: 50,
			},
			{ enabled: !!organizationId && !!linearConnection && !searchQuery },
		);

	// Search issues
	const { data: searchData, isLoading: isSearching } =
		trpc.linear.searchIssues.useQuery(
			{ organizationId: organizationId!, query: searchQuery },
			{
				enabled:
					!!organizationId && !!linearConnection && searchQuery.length > 0,
			},
		);

	const issues = searchQuery
		? (searchData?.issues ?? [])
		: (issuesData?.issues ?? []);

	const handleToggleIssue = (issueId: string) => {
		setSelectedIssues((prev) => {
			const next = new Set(prev);
			if (next.has(issueId)) {
				next.delete(issueId);
			} else {
				next.add(issueId);
			}
			return next;
		});
	};

	const handleSelectAll = () => {
		if (selectedIssues.size === issues.length) {
			setSelectedIssues(new Set());
		} else {
			setSelectedIssues(new Set(issues.map((i) => i.id)));
		}
	};

	const handleImport = () => {
		const issuesToImport = issues.filter((i) => selectedIssues.has(i.id));
		onImport(issuesToImport);
	};

	// Reset state when modal opens
	useEffect(() => {
		if (open) {
			setSelectedIssues(new Set());
			setSearchQuery("");
		}
	}, [open]);

	const isConnected = !!linearConnection;
	const hasIssues = issues.length > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<SiLinear className="size-4" />
						Import from Linear
					</DialogTitle>
					<DialogDescription>
						{isConnected
							? "Select issues to import as tasks"
							: "Connect Linear to your organization to import issues"}
					</DialogDescription>
				</DialogHeader>

				{!organizationId ? (
					<div className="py-8 text-center text-muted-foreground">
						<p>Sign in to import from Linear</p>
					</div>
				) : isLoadingConnection ? (
					<div className="py-8 flex items-center justify-center">
						<LuLoader className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : !isConnected ? (
					<div className="py-8 text-center space-y-2">
						<SiLinear className="size-10 mx-auto text-muted-foreground" />
						<p className="text-muted-foreground">Linear is not connected</p>
						<p className="text-sm text-muted-foreground">
							Connect Linear in your organization settings on app.superset.sh
						</p>
					</div>
				) : (
					<>
						{/* Filters */}
						<div className="flex items-center gap-2 flex-shrink-0">
							<div className="flex-1">
								<div className="relative">
									<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
									<Input
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										placeholder="Search issues..."
										className="pl-8 h-8 text-sm"
									/>
								</div>
							</div>
							<Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
								<SelectTrigger className="w-36 h-8 text-xs">
									<SelectValue placeholder="All teams" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">All teams</SelectItem>
									{teams?.map((team) => (
										<SelectItem key={team.id} value={team.id}>
											{team.key} - {team.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={selectedProjectId}
								onValueChange={setSelectedProjectId}
							>
								<SelectTrigger className="w-36 h-8 text-xs">
									<SelectValue placeholder="All projects" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">All projects</SelectItem>
									{projects?.map((project) => (
										<SelectItem key={project.id} value={project.id}>
											{project.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Issues List */}
						<div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
							{isLoadingIssues || isSearching ? (
								<div className="py-8 flex items-center justify-center">
									<LuLoader className="size-5 animate-spin text-muted-foreground" />
								</div>
							) : !hasIssues ? (
								<div className="py-8 text-center text-muted-foreground text-sm">
									{searchQuery
										? "No issues found matching your search"
										: "No issues found"}
								</div>
							) : (
								<div className="divide-y divide-border">
									{/* Select All Header */}
									<div className="px-3 py-2 bg-muted/30 flex items-center gap-2 sticky top-0">
										<input
											type="checkbox"
											checked={
												selectedIssues.size === issues.length &&
												issues.length > 0
											}
											onChange={handleSelectAll}
											className="size-3.5 rounded border-border"
										/>
										<span className="text-xs text-muted-foreground">
											{selectedIssues.size > 0
												? `${selectedIssues.size} selected`
												: `${issues.length} issues`}
										</span>
									</div>
									{issues.map((issue) => (
										<label
											key={issue.id}
											className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
										>
											<input
												type="checkbox"
												checked={selectedIssues.has(issue.id)}
												onChange={() => handleToggleIssue(issue.id)}
												className="size-3.5 rounded border-border mt-0.5"
											/>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<span className="text-xs text-muted-foreground font-mono">
														{issue.identifier}
													</span>
													{issue.state && (
														<span
															className="text-[10px] px-1.5 py-0.5 rounded"
															style={{
																backgroundColor: `${issue.state.color}20`,
																color: issue.state.color,
															}}
														>
															{issue.state.name}
														</span>
													)}
												</div>
												<p className="text-sm font-medium truncate">
													{issue.title}
												</p>
												{issue.description && (
													<p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
														{issue.description}
													</p>
												)}
											</div>
										</label>
									))}
								</div>
							)}
						</div>
					</>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					{isConnected && (
						<Button
							type="button"
							disabled={selectedIssues.size === 0 || isLoading}
							onClick={handleImport}
						>
							{isLoading && <LuLoader className="size-4 animate-spin mr-2" />}
							Import {selectedIssues.size > 0 ? `(${selectedIssues.size})` : ""}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	toolCalls?: Array<{
		id: string;
		name: string;
		input: Record<string, unknown>;
		result?: unknown;
	}>;
	createdAt: number;
}

interface OrchestrationChatProps {
	projectId: string;
	planId: string;
	onTasksChanged?: () => void;
	onClose?: () => void;
}

function OrchestrationChat({
	projectId,
	planId,
	onTasksChanged,
	onClose,
}: OrchestrationChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const [pendingToolCalls, setPendingToolCalls] = useState<
		Array<{ id: string; name: string; input: Record<string, unknown> }>
	>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Fetch history on mount
	const { data: historyData } = trpc.plan.orchestration.getHistory.useQuery(
		{ projectId, limit: 50 },
		{ enabled: !!projectId },
	);

	// Load history into state
	useEffect(() => {
		if (historyData?.messages) {
			setMessages(historyData.messages as ChatMessage[]);
		}
	}, [historyData]);

	// Subscribe to stream
	trpc.plan.orchestration.subscribeToStream.useSubscription(
		{ projectId },
		{
			enabled: !!projectId,
			onData: (event) => {
				switch (event.type) {
					case "start":
						setIsStreaming(true);
						setStreamingContent("");
						setPendingToolCalls([]);
						break;
					case "token":
						setStreamingContent((prev) => prev + (event.data as string));
						break;
					case "tool_call": {
						const toolCall = event.data as {
							id: string;
							name: string;
							input: Record<string, unknown>;
						};
						setPendingToolCalls((prev) => [...prev, toolCall]);
						break;
					}
					case "tool_result": {
						const resultData = event.data as {
							callId: string;
							result: unknown;
						};
						setPendingToolCalls(
							(prev) =>
								prev.map((tc) =>
									tc.id === resultData.callId
										? { ...tc, result: resultData.result }
										: tc,
								) as Array<{
									id: string;
									name: string;
									input: Record<string, unknown>;
								}>,
						);
						// Refresh tasks when a tool completes
						onTasksChanged?.();
						break;
					}
					case "complete": {
						const message = event.data as ChatMessage;
						setMessages((prev) => [...prev, message]);
						setIsStreaming(false);
						setStreamingContent("");
						setPendingToolCalls([]);
						break;
					}
					case "error":
						setIsStreaming(false);
						setStreamingContent("");
						setPendingToolCalls([]);
						console.error("[orchestration] Error:", event.data);
						break;
				}
			},
		},
	);

	const sendMessageMutation = trpc.plan.orchestration.sendMessage.useMutation({
		onMutate: () => {
			// Optimistically add user message
			const userMessage: ChatMessage = {
				id: `temp-${Date.now()}`,
				role: "user",
				content: input,
				createdAt: Date.now(),
			};
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
		},
	});

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (!input.trim() || isStreaming || !planId) return;
			sendMessageMutation.mutate({ projectId, planId, content: input.trim() });
		},
		[input, isStreaming, planId, projectId, sendMessageMutation],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit(e);
			}
		},
		[handleSubmit],
	);

	// Auto-scroll to bottom
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const isEmpty = messages.length === 0 && !isStreaming;

	return (
		<div className="flex flex-col h-full overflow-hidden bg-background">
			{/* Chat header */}
			<div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
				<div className="flex items-center gap-1.5">
					<LuMessageSquare className="size-3.5 text-muted-foreground" />
					<h2 className="text-xs font-medium">Orchestrator</h2>
				</div>
				<div className="flex items-center gap-1">
					{isStreaming && (
						<LuLoader className="size-3 text-primary animate-spin" />
					)}
					{onClose && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onClose}
							className="size-6 text-muted-foreground hover:text-foreground"
						>
							<LuX className="size-3.5" />
						</Button>
					)}
				</div>
			</div>

			{/* Chat messages */}
			<div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-3">
				{isEmpty ? (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						<div className="text-center space-y-2 px-4">
							<div className="mx-auto size-10 rounded-full bg-muted/50 flex items-center justify-center">
								<LuBot className="size-5 text-muted-foreground" />
							</div>
							<div className="space-y-1">
								<p className="text-xs font-medium text-foreground">
									AI Orchestrator
								</p>
								<p className="text-[11px] text-muted-foreground leading-relaxed">
									Create, modify, and run tasks
									<br />
									through conversation.
								</p>
							</div>
						</div>
					</div>
				) : (
					<>
						{messages.map((msg) => (
							<ChatMessageBubble key={msg.id} message={msg} />
						))}
						{/* Streaming message */}
						{isStreaming &&
							(streamingContent || pendingToolCalls.length > 0) && (
								<div className="flex gap-2">
									<div className="flex-shrink-0 size-6 rounded-full bg-primary/10 flex items-center justify-center">
										<LuBot className="size-3.5 text-primary" />
									</div>
									<div className="flex-1 min-w-0 space-y-2">
										{streamingContent && (
											<div className="text-xs text-foreground whitespace-pre-wrap">
												{streamingContent}
												<span className="inline-block w-1.5 h-3.5 bg-primary/60 animate-pulse ml-0.5" />
											</div>
										)}
										{pendingToolCalls.map((tc) => (
											<ToolCallBubble key={tc.id} toolCall={tc} />
										))}
									</div>
								</div>
							)}
						<div ref={messagesEndRef} />
					</>
				)}
			</div>

			{/* Chat input */}
			<form
				onSubmit={handleSubmit}
				className="flex-shrink-0 border-t border-border p-2"
			>
				<div className="flex gap-1.5">
					<Input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Message..."
						className="flex-1 h-8 text-xs bg-muted/30 border-border/50 focus-visible:ring-1"
						disabled={isStreaming || !planId}
					/>
					<Button
						type="submit"
						size="icon"
						variant={input.trim() ? "default" : "ghost"}
						className="size-8 flex-shrink-0"
						disabled={isStreaming || !input.trim() || !planId}
					>
						{isStreaming ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuSend className="size-3.5" />
						)}
					</Button>
				</div>
			</form>
		</div>
	);
}

interface ChatMessageBubbleProps {
	message: ChatMessage;
}

function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
	const isUser = message.role === "user";

	return (
		<div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
			<div
				className={cn(
					"flex-shrink-0 size-5 rounded-full flex items-center justify-center mt-0.5",
					isUser ? "bg-primary" : "bg-muted",
				)}
			>
				{isUser ? (
					<LuUser className="size-3 text-primary-foreground" />
				) : (
					<LuBot className="size-3 text-muted-foreground" />
				)}
			</div>
			<div className={cn("flex-1 min-w-0 space-y-1.5", isUser && "text-right")}>
				{message.content && (
					<div
						className={cn(
							"inline-block text-xs whitespace-pre-wrap rounded-lg px-2.5 py-1.5 max-w-full leading-relaxed",
							isUser ? "bg-primary text-primary-foreground" : "text-foreground",
						)}
					>
						{message.content}
					</div>
				)}
				{/* Tool calls */}
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className="space-y-1">
						{message.toolCalls.map((tc) => (
							<ToolCallBubble key={tc.id} toolCall={tc} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

interface ToolCallBubbleProps {
	toolCall: {
		id: string;
		name: string;
		input: Record<string, unknown>;
		result?: unknown;
	};
}

function ToolCallBubble({ toolCall }: ToolCallBubbleProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const hasResult = toolCall.result !== undefined;

	const toolNames: Record<string, string> = {
		createTask: "Create Task",
		modifyTask: "Modify Task",
		startTask: "Start Task",
		stopTask: "Stop Task",
		listTasks: "List Tasks",
		getTaskOutput: "Get Output",
		setMemory: "Save Memory",
		getMemory: "Read Memory",
		getExecutionStats: "Get Stats",
	};

	return (
		<div className="bg-muted/30 border border-border/50 rounded-md overflow-hidden text-left">
			<button
				type="button"
				className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/50 transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<LuWrench className="size-3 text-muted-foreground flex-shrink-0" />
				<span className="text-[11px] font-medium flex-1 text-left truncate">
					{toolNames[toolCall.name] ?? toolCall.name}
				</span>
				{hasResult ? (
					<LuCheck className="size-3 text-green-500 flex-shrink-0" />
				) : (
					<LuLoader className="size-3 text-blue-500 animate-spin flex-shrink-0" />
				)}
				<LuChevronRight
					className={cn(
						"size-3 text-muted-foreground transition-transform flex-shrink-0",
						isExpanded && "rotate-90",
					)}
				/>
			</button>
			{isExpanded && (
				<div className="px-2 pb-2 text-[10px] text-muted-foreground space-y-1">
					<div>
						<span className="font-medium">Input:</span>
						<pre className="mt-0.5 text-[10px] bg-background/50 rounded px-1.5 py-1 overflow-x-auto">
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					</div>
					{hasResult && (
						<div>
							<span className="font-medium">Result:</span>
							<pre className="mt-0.5 text-[10px] bg-background/50 rounded px-1.5 py-1 overflow-x-auto">
								{JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Task Detail Panel - Slide-over for viewing task details and execution output
// ============================================================================

interface TaskDetailPanelProps {
	task: PlanTask | null;
	onClose: () => void;
	onStartTask: (taskId: string) => void;
	onStopTask: (taskId: string) => void;
}

function TaskDetailPanel({
	task,
	onClose,
	onStartTask,
	onStopTask,
}: TaskDetailPanelProps) {
	const setActiveWorkspaceMutation = trpc.workspaces.setActive.useMutation();
	const addTaskTerminalPane = useTabsStore((s) => s.addTaskTerminalPane);

	// Get execution status
	const { data: executionStatus } = trpc.plan.getStatus.useQuery(
		{ taskId: task?.id! },
		{ enabled: !!task?.id, refetchInterval: 1000 },
	);

	// Get workspace ID from either execution status (in-memory) or task record (persisted)
	const workspaceId = executionStatus?.workspaceId ?? task?.workspaceId;

	const handleJumpToWorkspace = useCallback(() => {
		if (workspaceId && task) {
			// First set the active workspace
			setActiveWorkspaceMutation.mutate(
				{ id: workspaceId },
				{
					onSuccess: () => {
						// After workspace is active, add the task terminal pane
						addTaskTerminalPane(workspaceId, {
							taskId: task.id,
							taskTitle: task.title,
						});
					},
				},
			);
			onClose();
		}
	}, [workspaceId, task, setActiveWorkspaceMutation, addTaskTerminalPane, onClose]);

	if (!task) return null;

	const isRunning = task.status === "running";
	const isQueued = task.status === "queued";
	const canStart = task.status === "backlog" || task.status === "failed";
	const canStop = isRunning || isQueued;
	const hasWorkspace = !!workspaceId;

	const statusColors: Record<string, string> = {
		backlog: "text-muted-foreground",
		queued: "text-yellow-500",
		running: "text-blue-500",
		completed: "text-green-500",
		failed: "text-red-500",
	};

	const priorityLabels: Record<string, string> = {
		urgent: "Urgent",
		high: "High",
		medium: "Medium",
		low: "Low",
		none: "None",
	};

	return (
		<>
			{/* Backdrop */}
			<div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

			{/* Panel */}
			<div className="fixed right-0 top-0 bottom-0 w-[600px] bg-background border-l border-border z-50 flex flex-col shadow-xl">
				{/* Header */}
				<div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
					<div className="flex items-center gap-2">
						<LuTerminal className="size-4 text-muted-foreground" />
						<h2 className="text-sm font-semibold">Task Details</h2>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="size-7"
					>
						<LuX className="size-4" />
					</Button>
				</div>

				{/* Task Info */}
				<div className="flex-shrink-0 p-4 border-b border-border space-y-3">
					<div>
						<h3 className="text-base font-medium">{task.title}</h3>
						{task.description && (
							<p className="text-sm text-muted-foreground mt-1">
								{task.description}
							</p>
						)}
					</div>

					<div className="flex items-center gap-4 text-sm">
						<div className="flex items-center gap-1.5">
							<LuCircle className={cn("size-3", statusColors[task.status])} />
							<span className="capitalize">{task.status}</span>
						</div>
						{task.priority && (
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<span>Priority:</span>
								<span>{priorityLabels[task.priority] ?? task.priority}</span>
							</div>
						)}
						{executionStatus?.startedAt && (
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<LuClock className="size-3" />
								<span>
									Started{" "}
									{new Date(executionStatus.startedAt).toLocaleTimeString()}
								</span>
							</div>
						)}
					</div>

					{/* Action Buttons */}
					<div className="flex items-center gap-2">
						{canStart && (
							<Button
								size="sm"
								variant="default"
								onClick={() => onStartTask(task.id)}
								className="gap-1.5"
							>
								<LuPlay className="size-3" />
								Start Task
							</Button>
						)}
						{canStop && (
							<Button
								size="sm"
								variant="destructive"
								onClick={() => onStopTask(task.id)}
								className="gap-1.5"
							>
								<LuSquare className="size-3" />
								Stop
							</Button>
						)}
						{hasWorkspace && (
							<Button
								size="sm"
								variant="outline"
								onClick={handleJumpToWorkspace}
								className="gap-1.5"
							>
								<LuExternalLink className="size-3" />
								Jump to Workspace
							</Button>
						)}
						{task.externalUrl && (
							<Button size="sm" variant="ghost" asChild>
								<a
									href={task.externalUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="gap-1.5"
								>
									<LuExternalLink className="size-3" />
									View in Linear
								</a>
							</Button>
						)}
					</div>
				</div>

				{/* Execution Status */}
				{executionStatus && (
					<div className="flex-shrink-0 px-4 py-2 border-b border-border bg-muted/30">
						<div className="flex items-center gap-2 text-sm">
							{executionStatus.status === "running" && (
								<LuLoader className="size-3.5 text-blue-500 animate-spin" />
							)}
							{executionStatus.status === "completed" && (
								<LuCheck className="size-3.5 text-green-500" />
							)}
							{executionStatus.status === "failed" && (
								<LuCircleX className="size-3.5 text-red-500" />
							)}
							<span className="text-muted-foreground">
								{executionStatus.message}
							</span>
						</div>
						{executionStatus.error && (
							<p className="text-xs text-red-500 mt-1">
								{executionStatus.error}
							</p>
						)}
					</div>
				)}

				{/* Terminal Output */}
				<div className="flex-1 min-h-0 overflow-hidden flex flex-col">
					<div className="flex-shrink-0 px-4 py-2 border-b border-border bg-muted/20">
						<div className="flex items-center gap-2">
							<LuTerminal className="size-3.5 text-muted-foreground" />
							<span className="text-xs font-medium">Terminal</span>
							{isRunning && (
								<span className="text-[10px] text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
									LIVE
								</span>
							)}
						</div>
					</div>

					<div className="flex-1 min-h-0">
						<TaskTerminal taskId={task.id} isActive={isRunning || isQueued} />
					</div>
				</div>
			</div>
		</>
	);
}

// ============================================================================
// Task Terminal - xterm.js component for task execution output
// ============================================================================

interface TaskTerminalProps {
	taskId: string;
	isActive: boolean;
}

function TaskTerminal({ taskId, isActive }: TaskTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const [isAttached, setIsAttached] = useState(false);

	// Attach to terminal and get scrollback
	// Refetch every 500ms until session exists (handles race condition with session creation)
	const { data: attachData } = trpc.plan.attachTerminal.useQuery(
		{ taskId },
		{
			enabled: !!taskId,
			refetchInterval: (query) => {
				// Stop refetching once we have the session
				if (query.state.data?.exists) return false;
				return 500; // Retry every 500ms until session exists
			},
		},
	);

	// Write to terminal mutation
	const writeToTerminalMutation = trpc.plan.writeToTerminal.useMutation();

	// Resize terminal mutation
	const resizeTerminalMutation = trpc.plan.resizeTerminal.useMutation();

	// Initialize xterm
	useEffect(() => {
		if (!terminalRef.current) return;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: '"JetBrains Mono", "Fira Code", monospace',
			theme: {
				background: "#0d1117",
				foreground: "#c9d1d9",
				cursor: "#58a6ff",
				cursorAccent: "#0d1117",
				selectionBackground: "#264f78",
				black: "#0d1117",
				red: "#ff7b72",
				green: "#3fb950",
				yellow: "#d29922",
				blue: "#58a6ff",
				magenta: "#bc8cff",
				cyan: "#39c5cf",
				white: "#b1bac4",
				brightBlack: "#6e7681",
				brightRed: "#ffa198",
				brightGreen: "#56d364",
				brightYellow: "#e3b341",
				brightBlue: "#79c0ff",
				brightMagenta: "#d2a8ff",
				brightCyan: "#56d4dd",
				brightWhite: "#f0f6fc",
			},
			scrollback: 10000,
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		terminal.loadAddon(fitAddon);
		terminal.loadAddon(webLinksAddon);

		terminal.open(terminalRef.current);
		fitAddon.fit();

		xtermRef.current = terminal;
		fitAddonRef.current = fitAddon;

		// Handle user input
		terminal.onData((data) => {
			writeToTerminalMutation.mutate({ taskId, data });
		});

		// Handle resize
		const handleResize = () => {
			fitAddon.fit();
			const dims = fitAddon.proposeDimensions();
			if (dims) {
				resizeTerminalMutation.mutate({
					taskId,
					cols: dims.cols,
					rows: dims.rows,
				});
			}
		};

		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(terminalRef.current);

		return () => {
			resizeObserver.disconnect();
			terminal.dispose();
			xtermRef.current = null;
			fitAddonRef.current = null;
		};
	}, [taskId, resizeTerminalMutation.mutate, writeToTerminalMutation.mutate]);

	// Write scrollback when attachment data is received
	useEffect(() => {
		if (attachData?.exists && xtermRef.current && !isAttached) {
			// Write scrollback if there is any (may be empty string initially)
			if (attachData.scrollback) {
				xtermRef.current.write(attachData.scrollback);
			}
			setIsAttached(true);
		}
	}, [attachData, isAttached]);

	// Reset attached state when taskId changes
	useEffect(() => {
		setIsAttached(false);
		if (xtermRef.current) {
			xtermRef.current.clear();
		}
	}, [taskId]);

	// Subscribe to terminal output
	trpc.plan.subscribeTerminal.useSubscription(
		{ taskId },
		{
			enabled: !!taskId && isAttached,
			onData: (event) => {
				if (xtermRef.current) {
					xtermRef.current.write(event.data);
				}
			},
		},
	);

	return (
		<div
			ref={terminalRef}
			className="w-full h-full bg-[#0d1117]"
			style={{ padding: "8px" }}
		/>
	);
}
