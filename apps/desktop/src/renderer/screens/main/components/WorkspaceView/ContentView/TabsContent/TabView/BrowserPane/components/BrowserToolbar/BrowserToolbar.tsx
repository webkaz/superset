import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	TbArrowLeft,
	TbArrowRight,
	TbLoader2,
	TbRefresh,
} from "react-icons/tb";

function displayUrl(url: string): string {
	return url === "about:blank" ? "" : url;
}

interface BrowserToolbarProps {
	currentUrl: string;
	pageTitle: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	onGoBack: () => void;
	onGoForward: () => void;
	onReload: () => void;
	onNavigate: (url: string) => void;
}

export function BrowserToolbar({
	currentUrl,
	pageTitle,
	isLoading,
	canGoBack,
	canGoForward,
	onGoBack,
	onGoForward,
	onReload,
	onNavigate,
}: BrowserToolbarProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [urlInputValue, setUrlInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const url = displayUrl(currentUrl);
	const isBlank = !url;

	// Focus and select input when entering edit mode
	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const enterEditMode = useCallback(() => {
		setUrlInputValue(url);
		setIsEditing(true);
	}, [url]);

	const exitEditMode = useCallback(() => {
		setIsEditing(false);
	}, []);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = urlInputValue.trim();
			if (trimmed) {
				onNavigate(trimmed);
				setIsEditing(false);
			}
		},
		[urlInputValue, onNavigate],
	);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			setIsEditing(false);
		}
	}, []);

	return (
		<div className="flex h-full flex-1 min-w-0 items-center px-2">
			<div className="flex items-center gap-0.5 shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onGoBack}
							disabled={!canGoBack}
							className={`rounded p-1 transition-colors ${canGoBack ? "text-muted-foreground/60 hover:text-muted-foreground" : "opacity-30 pointer-events-none"}`}
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
							disabled={!canGoForward}
							className={`rounded p-1 transition-colors ${canGoForward ? "text-muted-foreground/60 hover:text-muted-foreground" : "opacity-30 pointer-events-none"}`}
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
			<div className="mx-1.5 h-3.5 w-px bg-muted-foreground/60" />
			<div className="flex flex-1 min-w-0 items-center">
				{isEditing ? (
					<form onSubmit={handleSubmit} className="flex w-full min-w-0 items-center">
						<input
							ref={inputRef}
							type="text"
							value={urlInputValue}
							onChange={(e) => setUrlInputValue(e.target.value)}
							onBlur={exitEditMode}
							onKeyDown={handleKeyDown}
							placeholder="Enter URL or search..."
							className="h-[22px] w-full rounded-sm border border-ring bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
							spellCheck={false}
						/>
					</form>
				) : (
					<button
						type="button"
						onClick={enterEditMode}
						className="group flex w-full min-w-0 items-baseline rounded-sm border border-transparent px-2 py-0.5 text-left text-xs"
					>
						{isBlank ? (
							<span className="text-muted-foreground/40">
								Enter URL or search...
							</span>
						) : (
							<>
								<span className="shrink-0 whitespace-nowrap text-muted-foreground/60 transition-colors group-hover:text-foreground">
									{url}
								</span>
								{pageTitle && (
									<span className="min-w-0 ml-1 truncate text-muted-foreground/40 transition-opacity group-hover:opacity-0">
										/ {pageTitle}
									</span>
								)}
							</>
						)}
					</button>
				)}
			</div>
		</div>
	);
}
