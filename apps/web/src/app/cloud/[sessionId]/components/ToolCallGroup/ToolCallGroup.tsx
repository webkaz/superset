"use client";

import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";

import type { CloudEvent } from "../../hooks";
import { formatToolGroup } from "../../lib/tool-formatters";
import { ToolCallItem } from "../ToolCallItem";
import { ToolIcon } from "../ToolIcon";

interface ToolCallGroupProps {
	events: CloudEvent[];
	groupId: string;
}

export function ToolCallGroup({ events, groupId }: ToolCallGroupProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

	const firstEvent = events[0];
	if (!firstEvent) {
		return null;
	}

	const formatted = formatToolGroup(events);

	const time = new Date(firstEvent.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const toggleItem = (itemId: string) => {
		setExpandedItems((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(itemId)) {
				newSet.delete(itemId);
			} else {
				newSet.add(itemId);
			}
			return newSet;
		});
	};

	// For single tool call, render directly without group wrapper
	if (events.length === 1) {
		return (
			<ToolCallItem
				event={firstEvent}
				isExpanded={expandedItems.has(`${groupId}-0`)}
				onToggle={() => toggleItem(`${groupId}-0`)}
			/>
		);
	}

	return (
		<div className="py-0.5">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-2 text-xs text-left hover:bg-muted/50 px-1.5 py-1 -mx-1.5 rounded-md transition-colors"
			>
				<LuChevronRight
					className={`size-3 text-muted-foreground shrink-0 transition-transform duration-200 ${
						isExpanded ? "rotate-90" : ""
					}`}
				/>
				<ToolIcon name={formatted.icon} className="shrink-0" />
				<span className="font-medium text-foreground shrink-0">
					{formatted.toolName}
				</span>
				<span className="text-muted-foreground/60 truncate">
					{formatted.summary}
				</span>
				<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0 tabular-nums">
					{time}
				</span>
			</button>

			{isExpanded && (
				<div className="ml-4 mt-1 pl-3 border-l border-border/50">
					{events.map((event, index) => (
						<ToolCallItem
							key={`${groupId}-${index}`}
							event={event}
							isExpanded={expandedItems.has(`${groupId}-${index}`)}
							onToggle={() => toggleItem(`${groupId}-${index}`)}
							showTime={false}
						/>
					))}
				</div>
			)}
		</div>
	);
}
