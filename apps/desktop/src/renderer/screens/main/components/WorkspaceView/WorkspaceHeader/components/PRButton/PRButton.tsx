import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { VscGitPullRequest } from "react-icons/vsc";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

function buildPRPrompt(
	branch: string,
	uncommittedCount: number,
	isDraft: boolean,
): string {
	const lines = [
		"The user likes the state of the code.",
		"",
		`There are ${uncommittedCount} uncommitted changes.`,
		`The current branch is ${branch}.`,
		"The target branch is origin/main.",
		"",
		"There is no upstream branch yet.",
		isDraft ? "The user requested a draft PR." : "The user requested a PR.",
		"",
		"Follow these **exact steps** to create a PR:",
		"",
		"- Run `git diff` to review uncommitted changes",
		"- Commit them. Follow any instructions the user gave you about writing commit messages.",
		"- Push to origin.",
		"- Use `git diff origin/main...` to review the PR diff",
		`- Use \`gh pr create --base main${isDraft ? " --draft" : ""}\` to create a PR onto the target branch. Keep the title under 80 characters and the description under five sentences (unless the user has given you other instructions).`,
		"",
		"If any of these steps fail, ask the user for help.",
		"",
		"## PR Description Template",
		"",
		"This workspace has a PR template, which is provided below. Use it for writing the PR description, filling it in based on the changes made.",
		"",
		"```markdown",
		"## What problem(s) was I solving?",
		"",
		"## What user-facing changes did I ship?",
		"",
		"## How I implemented it",
		"",
		"## How to verify it",
		"",
		"- [ ] I have ensured `make check test` passes",
		"",
		"## Description for the changelog",
		"",
		"## A picture of a cute animal (not mandatory but encouraged)",
		"",
		"```",
	];

	return lines.join("\n");
}

export function PRButton() {
	const [isOpen, setIsOpen] = useState(false);
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: gitStatus } = trpc.changes.getStatus.useQuery(
		{
			worktreePath: activeWorkspace?.worktreePath ?? "",
		},
		{ enabled: !!activeWorkspace?.worktreePath },
	);
	const addTab = useTabsStore((state) => state.addTab);
	const openUrl = trpc.external.openUrl.useMutation();

	const handleCreatePR = (isDraft: boolean) => {
		if (!activeWorkspace?.id) return;
		setIsOpen(false);

		const branch = activeWorkspace.worktree?.branch ?? "unknown";
		const uncommittedCount =
			(gitStatus?.staged?.length ?? 0) +
			(gitStatus?.unstaged?.length ?? 0) +
			(gitStatus?.untracked?.length ?? 0);

		const prompt = buildPRPrompt(branch, uncommittedCount, isDraft);

		// Base64 encode the prompt to avoid shell escaping issues
		const base64Prompt = btoa(unescape(encodeURIComponent(prompt)));
		const command = `claude --dangerously-skip-permissions "$(echo '${base64Prompt}' | base64 -d)"`;

		addTab(activeWorkspace.id, {
			initialCommands: [command],
		});
	};

	const handleCreateManually = () => {
		setIsOpen(false);
		const branch = activeWorkspace?.worktree?.branch;
		if (branch) {
			openUrl.mutate(
				`https://github.com/new?base=main&compare=${encodeURIComponent(branch)}`,
			);
		}
	};

	if (!activeWorkspace?.id) {
		return null;
	}

	return (
		<ButtonGroup>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="gap-1"
						onClick={() => handleCreatePR(true)}
					>
						<VscGitPullRequest className="size-4" />
						<span>Create PR</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Open Claude Code to create a draft PR
				</TooltipContent>
			</Tooltip>
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="px-1.5">
						<HiChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => handleCreatePR(true)}>
						<VscGitPullRequest className="size-4 mr-2" />
						Create draft PR
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCreateManually}>
						<LuExternalLink className="size-4 mr-2" />
						Create PR manually
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
