import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { format } from "date-fns";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { PriorityIcon } from "../../../components/TasksView/components/shared/PriorityIcon";
import {
	StatusIcon,
	type StatusType,
} from "../../../components/TasksView/components/shared/StatusIcon";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";

interface TaskDetailViewProps {
	task: TaskWithStatus;
	onBack: () => void;
}

export function TaskDetailView({ task, onBack }: TaskDetailViewProps) {
	const labels = task.labels ?? [];

	return (
		<div className="flex-1 flex min-h-0">
			{/* Main content area */}
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				{/* Header */}
				<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onBack}
					>
						<HiArrowLeft className="w-4 h-4" />
					</Button>
					<span className="text-sm text-muted-foreground">{task.slug}</span>
					{task.externalUrl && (
						<a
							href={task.externalUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground transition-colors"
							title="Open in Linear"
						>
							<LuExternalLink className="w-4 h-4" />
						</a>
					)}
				</div>

				{/* Content */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 py-6 max-w-4xl">
						<h1 className="text-2xl font-semibold mb-6">{task.title}</h1>

						{task.description ? (
							<MarkdownRenderer content={task.description} />
						) : (
							<p className="text-muted-foreground text-sm">No description</p>
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Properties sidebar */}
			<div className="w-64 border-l border-border shrink-0">
				<ScrollArea className="h-full">
					<div className="p-4 space-y-6">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Properties
						</h3>

						{/* Status */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Status</span>
							<div className="flex items-center gap-2">
								<StatusIcon
									type={task.status.type as StatusType}
									color={task.status.color}
									progress={task.status.progressPercent ?? undefined}
								/>
								<span className="text-sm">{task.status.name}</span>
							</div>
						</div>

						{/* Priority */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Priority</span>
							<div className="flex items-center gap-2">
								<PriorityIcon priority={task.priority} />
								<span className="text-sm capitalize">
									{task.priority === "none" ? "No priority" : task.priority}
								</span>
							</div>
						</div>

						{/* Assignee */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Assignee</span>
							{task.assignee ? (
								<div className="flex items-center gap-2">
									{task.assignee.image ? (
										<img
											src={task.assignee.image}
											alt=""
											className="w-5 h-5 rounded-full"
										/>
									) : (
										<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
											{task.assignee.name?.charAt(0).toUpperCase() ?? "?"}
										</div>
									)}
									<span className="text-sm">{task.assignee.name}</span>
								</div>
							) : (
								<span className="text-sm text-muted-foreground">
									Unassigned
								</span>
							)}
						</div>

						{/* Labels */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Labels</span>
							{labels.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{labels.map((label) => (
										<Badge key={label} variant="outline" className="text-xs">
											{label}
										</Badge>
									))}
								</div>
							) : (
								<span className="text-sm text-muted-foreground">No labels</span>
							)}
						</div>

						{/* Due Date */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Due date</span>
							{task.dueDate ? (
								<span className="text-sm">
									{format(new Date(task.dueDate), "MMM d, yyyy")}
								</span>
							) : (
								<span className="text-sm text-muted-foreground">
									No due date
								</span>
							)}
						</div>

						{/* Created */}
						<div className="space-y-2">
							<span className="text-xs text-muted-foreground">Created</span>
							<span className="text-sm text-muted-foreground">
								{format(new Date(task.createdAt), "MMM d, yyyy")}
							</span>
						</div>
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}
