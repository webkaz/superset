import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	TbCamera,
	TbCopy,
	TbDeviceDesktop,
	TbDots,
	TbReload,
	TbTrash,
} from "react-icons/tb";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface BrowserOverflowMenuProps {
	paneId: string;
	onOpenDevTools?: () => void;
}

export function BrowserOverflowMenu({
	paneId,
	onOpenDevTools,
}: BrowserOverflowMenuProps) {
	const screenshotMutation = electronTrpc.browser.screenshot.useMutation();
	const reloadMutation = electronTrpc.browser.reload.useMutation();
	const openDevToolsMutation = electronTrpc.browser.openDevTools.useMutation();
	const clearBrowsingDataMutation =
		electronTrpc.browser.clearBrowsingData.useMutation();

	const handleScreenshot = async () => {
		try {
			const { base64 } = await screenshotMutation.mutateAsync({ paneId });
			// Convert base64 to blob and copy to clipboard
			const response = await fetch(`data:image/png;base64,${base64}`);
			const blob = await response.blob();
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": blob }),
			]);
		} catch {
			// Screenshot failed
		}
	};

	const handleHardReload = () => {
		reloadMutation.mutate({ paneId, hard: true });
	};

	const handleCopyUrl = () => {
		const webview = document.querySelector(
			`webview[data-pane-id="${paneId}"]`,
		) as Electron.WebviewTag | null;
		if (webview) {
			navigator.clipboard.writeText(webview.getURL());
		}
	};

	const handleOpenDevTools = () => {
		if (onOpenDevTools) {
			onOpenDevTools();
		} else {
			openDevToolsMutation.mutate({ paneId });
		}
	};

	const handleClearCookies = () => {
		clearBrowsingDataMutation.mutate({ type: "cookies" });
	};

	const handleClearAllData = () => {
		clearBrowsingDataMutation.mutate({ type: "all" });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<TbDots className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={handleScreenshot} className="gap-2">
					<TbCamera className="size-4" />
					Take Screenshot
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleHardReload} className="gap-2">
					<TbReload className="size-4" />
					Hard Reload
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleCopyUrl} className="gap-2">
					<TbCopy className="size-4" />
					Copy URL
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleOpenDevTools} className="gap-2">
					<TbDeviceDesktop className="size-4" />
					Open DevTools
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleClearCookies} className="gap-2">
					<TbTrash className="size-4" />
					Clear Cookies
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleClearAllData} className="gap-2">
					<TbTrash className="size-4" />
					Clear All Data
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
