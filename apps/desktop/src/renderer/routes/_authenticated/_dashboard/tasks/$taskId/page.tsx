import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../components/TasksView/hooks/useTasksTable";
import { TaskDetailView } from "./components/TaskDetailView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();

	const { data: taskData } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) => eq(tasks.id, taskId)),
		[collections, taskId],
	);

	const task: TaskWithStatus | null = useMemo(() => {
		if (!taskData || taskData.length === 0) return null;
		return taskData[0];
	}, [taskData]);

	const handleBack = () => {
		navigate({ to: "/tasks" });
	};

	if (!task) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">Task not found</span>
			</div>
		);
	}

	return <TaskDetailView task={task} onBack={handleBack} />;
}
