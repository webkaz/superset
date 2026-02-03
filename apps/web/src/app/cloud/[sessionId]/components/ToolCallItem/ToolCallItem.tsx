"use client";

import { useState } from "react";
import { LuCheck, LuChevronRight, LuLoader } from "react-icons/lu";

import type { CloudEvent } from "../../hooks";
import { formatToolCall } from "../../lib/tool-formatters";
import { TextShimmer } from "../TextShimmer";
import { ToolIcon } from "../ToolIcon";

interface ToolCallItemProps {
	event: CloudEvent;
	isExpanded: boolean;
	onToggle: () => void;
	showTime?: boolean;
	isPending?: boolean;
}

export function ToolCallItem({
	event,
	isExpanded,
	onToggle,
	showTime = true,
	isPending = false,
}: ToolCallItemProps) {
	const [copied, setCopied] = useState(false);
	const formatted = formatToolCall(event);
	const time = new Date(event.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const { args, output } = formatted.getDetails();

	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<div className="py-0.5">
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-2 text-xs text-left text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2 -mx-2 rounded-lg hover:bg-muted/50 active:scale-[0.99]"
			>
				<LuChevronRight
					className={`size-3 shrink-0 transition-transform duration-200 ${
						isExpanded ? "rotate-90" : ""
					}`}
				/>
				<ToolIcon name={formatted.icon} className="shrink-0" />
				<span className="flex items-center gap-1.5 min-w-0 truncate">
					{isPending ? (
						<TextShimmer className="font-medium shrink-0 text-foreground">
							{formatted.toolName}
						</TextShimmer>
					) : (
						<span className="font-medium shrink-0">{formatted.toolName}</span>
					)}
					<span className="text-muted-foreground/60 truncate">
						{formatted.summary}
					</span>
				</span>
				{isPending && (
					<LuLoader className="size-3 animate-spin text-muted-foreground/50 shrink-0 ml-auto" />
				)}
				{showTime && !isPending && (
					<span className="text-[10px] text-muted-foreground/40 shrink-0 ml-auto tabular-nums">
						{time}
					</span>
				)}
			</button>

			{isExpanded && (
				<div className="mt-1.5 ml-5 p-3 bg-muted/30 border border-border/50 rounded-lg text-xs overflow-hidden">
					{args && Object.keys(args).length > 0 && (
						<div className="mb-3">
							<div className="text-muted-foreground/80 mb-1.5 text-[10px] uppercase tracking-wider font-medium">
								Arguments
							</div>
							<div className="relative group/args">
								<pre className="overflow-x-auto text-foreground/80 whitespace-pre-wrap text-xs font-mono bg-background/50 rounded-lg p-3">
									{JSON.stringify(args, null, 2)}
								</pre>
								<button
									onClick={() => handleCopy(JSON.stringify(args, null, 2))}
									className="absolute top-2 right-2 p-1 rounded bg-background/80 border border-border/50 text-muted-foreground hover:text-foreground opacity-0 group-hover/args:opacity-100 transition-opacity"
								>
									{copied ? (
										<LuCheck className="size-3" />
									) : (
										<svg
											className="size-3"
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
							</div>
						</div>
					)}
					{output && (
						<div>
							<div className="text-muted-foreground/80 mb-1.5 text-[10px] uppercase tracking-wider font-medium">
								Output
							</div>
							<div className="relative group/output">
								<pre className="overflow-x-auto max-h-48 text-foreground/80 whitespace-pre-wrap text-xs overflow-y-auto font-mono bg-background/50 rounded-lg p-3">
									{output}
								</pre>
								<button
									onClick={() => handleCopy(output)}
									className="absolute top-2 right-2 p-1 rounded bg-background/80 border border-border/50 text-muted-foreground hover:text-foreground opacity-0 group-hover/output:opacity-100 transition-opacity"
								>
									{copied ? (
										<LuCheck className="size-3" />
									) : (
										<svg
											className="size-3"
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
							</div>
						</div>
					)}
					{!args && !output && (
						<span className="text-muted-foreground/60 italic">
							No details available
						</span>
					)}
				</div>
			)}
		</div>
	);
}
