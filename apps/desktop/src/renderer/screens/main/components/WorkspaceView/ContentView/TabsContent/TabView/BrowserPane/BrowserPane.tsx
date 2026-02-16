import { useCallback, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { BrowserOverflowMenu } from "./components/BrowserToolbar/components/BrowserOverflowMenu";
import { DEFAULT_BROWSER_URL } from "./constants";
import { useBrowserNavigation } from "./hooks/useBrowserNavigation";

interface BrowserPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	tabId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function BrowserPane({
	paneId,
	path,
	isActive,
	tabId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: BrowserPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const openDevToolsPane = useTabsStore((s) => s.openDevToolsPane);
	const browserState = pane?.browser;
	const currentUrl = browserState?.currentUrl ?? DEFAULT_BROWSER_URL;
	const isLoading = browserState?.isLoading ?? false;

	// Capture the initial URL on first render only — subsequent navigations
	// are handled via webview.loadURL() to preserve browser history.
	const initialUrlRef = useRef(currentUrl);

	const { setWebviewRef, goBack, goForward, reload, navigateTo } =
		useBrowserNavigation({
			paneId,
			initialUrl: initialUrlRef.current,
		});

	const webviewRefCallback = useCallback(
		(node: HTMLElement | null) => {
			setWebviewRef(node as Electron.WebviewTag | null);
		},
		[setWebviewRef],
	);

	const handleOpenDevTools = useCallback(() => {
		openDevToolsPane(tabId, paneId, path);
	}, [openDevToolsPane, tabId, paneId, path]);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			isActive={isActive}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between">
					<BrowserToolbar
						currentUrl={currentUrl}
						isLoading={isLoading}
						onGoBack={goBack}
						onGoForward={goForward}
						onReload={reload}
						onNavigate={navigateTo}
					/>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
						leadingActions={
							<BrowserOverflowMenu
								paneId={paneId}
								onOpenDevTools={handleOpenDevTools}
							/>
						}
					/>
				</div>
			)}
		>
			<webview
				ref={webviewRefCallback}
				src={initialUrlRef.current}
				partition="persist:superset"
				data-pane-id={paneId}
				className="w-full h-full"
				style={{ display: "flex", flex: 1 }}
			/>
		</BasePaneWindow>
	);
}
