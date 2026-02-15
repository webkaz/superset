import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useRef, useState } from "react";
import {
	TbArrowLeft,
	TbArrowRight,
	TbLoader2,
	TbRefresh,
} from "react-icons/tb";

interface BrowserToolbarProps {
	currentUrl: string;
	isLoading: boolean;
	onGoBack: () => void;
	onGoForward: () => void;
	onReload: () => void;
	onNavigate: (url: string) => void;
}

export function BrowserToolbar({
	currentUrl,
	isLoading,
	onGoBack,
	onGoForward,
	onReload,
	onNavigate,
}: BrowserToolbarProps) {
	const [urlInputValue, setUrlInputValue] = useState(currentUrl);
	const inputRef = useRef<HTMLInputElement>(null);
	const isEditing = useRef(false);

	// Sync URL from navigation when not actively editing
	if (!isEditing.current && urlInputValue !== currentUrl) {
		setUrlInputValue(currentUrl);
	}

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = urlInputValue.trim();
			if (trimmed) {
				onNavigate(trimmed);
				inputRef.current?.blur();
			}
		},
		[urlInputValue, onNavigate],
	);

	const handleFocus = useCallback(() => {
		isEditing.current = true;
		inputRef.current?.select();
	}, []);

	const handleBlur = useCallback(() => {
		isEditing.current = false;
		setUrlInputValue(currentUrl);
	}, [currentUrl]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				isEditing.current = false;
				setUrlInputValue(currentUrl);
				inputRef.current?.blur();
			}
		},
		[currentUrl],
	);

	return (
		<div className="flex h-full w-full items-center gap-1 px-2">
			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onGoBack}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							<TbArrowLeft className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Go Back
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onGoForward}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							<TbArrowRight className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Go Forward
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onReload}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							{isLoading ? (
								<TbLoader2 className="size-3.5 animate-spin" />
							) : (
								<TbRefresh className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isLoading ? "Loading..." : "Reload"}
					</TooltipContent>
				</Tooltip>
			</div>
			<form onSubmit={handleSubmit} className="flex-1 min-w-0">
				<input
					ref={inputRef}
					type="text"
					value={urlInputValue}
					onChange={(e) => setUrlInputValue(e.target.value)}
					onFocus={handleFocus}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					className="w-full rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
					spellCheck={false}
				/>
			</form>
		</div>
	);
}
