import { useCallback, useEffect, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BasePaneWindow } from "../../../components";

interface DevToolsPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	tabId: string;
	targetPaneId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function DevToolsPane({
	paneId,
	path,
	isActive,
	tabId,
	targetPaneId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: DevToolsPaneProps) {
	const webviewRef = useRef<Electron.WebviewTag | null>(null);
	const attachedRef = useRef(false);
	const attachMutation = electronTrpc.browser.attachDevTools.useMutation();
	const detachMutation = electronTrpc.browser.detachDevTools.useMutation();

	const handleDomReady = useCallback(() => {
		const webview = webviewRef.current;
		if (!webview || attachedRef.current) return;

		attachedRef.current = true;
		const webContentsId = webview.getWebContentsId();
		attachMutation.mutate({
			browserPaneId: targetPaneId,
			devtoolsWebContentsId: webContentsId,
		});
	}, [targetPaneId, attachMutation]);

	const webviewRefCallback = useCallback(
		(node: HTMLElement | null) => {
			const prev = webviewRef.current;
			if (prev) {
				prev.removeEventListener("dom-ready", handleDomReady);
			}

			webviewRef.current = node as Electron.WebviewTag | null;

			if (node) {
				(node as Electron.WebviewTag).addEventListener(
					"dom-ready",
					handleDomReady,
				);
			}
		},
		[handleDomReady],
	);

	useEffect(() => {
		return () => {
			if (attachedRef.current) {
				detachMutation.mutate({ browserPaneId: targetPaneId });
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [targetPaneId, detachMutation.mutate]);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			isActive={isActive}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={() => (
				<div className="flex h-full w-full items-center px-2">
					<span className="text-xs text-muted-foreground">DevTools</span>
				</div>
			)}
		>
			<webview
				ref={webviewRefCallback}
				src="about:blank"
				partition="persist:superset"
				className="w-full h-full"
				style={{ display: "flex", flex: 1 }}
			/>
		</BasePaneWindow>
	);
}
