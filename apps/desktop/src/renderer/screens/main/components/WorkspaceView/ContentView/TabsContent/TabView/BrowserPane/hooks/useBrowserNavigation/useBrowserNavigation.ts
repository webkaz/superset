import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface UseBrowserNavigationOptions {
	paneId: string;
	initialUrl: string;
}

export function useBrowserNavigation({
	paneId,
	initialUrl,
}: UseBrowserNavigationOptions) {
	const webviewRef = useRef<Electron.WebviewTag | null>(null);
	const isHistoryNavigation = useRef(false);
	const faviconUrlRef = useRef<string | undefined>(undefined);
	const updateBrowserUrl = useTabsStore((s) => s.updateBrowserUrl);
	const updateBrowserLoading = useTabsStore((s) => s.updateBrowserLoading);
	const navigateBrowserHistory = useTabsStore((s) => s.navigateBrowserHistory);
	const registerMutation = electronTrpc.browser.register.useMutation();
	const unregisterMutation = electronTrpc.browser.unregister.useMutation();
	const upsertHistoryMutation =
		electronTrpc.browserHistory.upsert.useMutation();

	const browserState = useTabsStore((s) => s.panes[paneId]?.browser);
	const historyIndex = browserState?.historyIndex ?? 0;
	const historyLength = browserState?.history.length ?? 0;
	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < historyLength - 1;

	// Subscribe to new-window events from the main process (target="_blank" links, window.open)
	electronTrpc.browser.onNewWindow.useSubscription(
		{ paneId },
		{
			onData: ({ url }) => {
				const state = useTabsStore.getState();
				const pane = state.panes[paneId];
				if (!pane) return;
				const tab = state.tabs.find((t) => t.id === pane.tabId);
				if (!tab) return;
				state.addBrowserTab(tab.workspaceId, url);
			},
		},
	);

	const handleDomReady = useCallback(() => {
		const webview = webviewRef.current;
		if (!webview) return;

		const webContentsId = webview.getWebContentsId();
		registerMutation.mutate({ paneId, webContentsId });
	}, [paneId, registerMutation]);

	const handleDidNavigate = useCallback(
		(_event: Electron.DidNavigateEvent) => {
			const webview = webviewRef.current;
			if (!webview) return;

			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}

			updateBrowserUrl(
				paneId,
				webview.getURL(),
				webview.getTitle(),
				faviconUrlRef.current,
			);
			updateBrowserLoading(paneId, false);
		},
		[paneId, updateBrowserUrl, updateBrowserLoading],
	);

	const handleDidNavigateInPage = useCallback(
		(_event: Electron.DidNavigateInPageEvent) => {
			const webview = webviewRef.current;
			if (!webview) return;

			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}

			updateBrowserUrl(
				paneId,
				webview.getURL(),
				webview.getTitle(),
				faviconUrlRef.current,
			);
		},
		[paneId, updateBrowserUrl],
	);

	const handleDidStartLoading = useCallback(() => {
		updateBrowserLoading(paneId, true);
		// Reset favicon for new navigation
		faviconUrlRef.current = undefined;
	}, [paneId, updateBrowserLoading]);

	const handleDidStopLoading = useCallback(() => {
		updateBrowserLoading(paneId, false);
		const webview = webviewRef.current;
		if (webview) {
			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}
			const url = webview.getURL();
			const title = webview.getTitle();
			updateBrowserUrl(paneId, url, title, faviconUrlRef.current);

			// Record visit in persistent history (skip blank pages)
			if (url && url !== "about:blank") {
				upsertHistoryMutation.mutate({
					url,
					title,
					faviconUrl: faviconUrlRef.current ?? null,
				});
			}
		}
	}, [paneId, updateBrowserUrl, updateBrowserLoading, upsertHistoryMutation]);

	const handlePageTitleUpdated = useCallback(
		(event: Electron.PageTitleUpdatedEvent) => {
			const webview = webviewRef.current;
			if (!webview) return;
			updateBrowserUrl(
				paneId,
				webview.getURL(),
				event.title,
				faviconUrlRef.current,
			);
		},
		[paneId, updateBrowserUrl],
	);

	const handlePageFaviconUpdated = useCallback(
		(event: Electron.PageFaviconUpdatedEvent) => {
			const favicons = event.favicons;
			if (favicons && favicons.length > 0) {
				faviconUrlRef.current = favicons[0];
				const webview = webviewRef.current;
				if (webview) {
					const url = webview.getURL();
					const title = webview.getTitle();
					// Update the in-memory pane entry with the new favicon
					updateBrowserUrl(paneId, url, title, favicons[0]);
					// Also upsert to persistent history — favicon often arrives
					// after did-stop-loading, so the initial upsert may have null
					if (url && url !== "about:blank") {
						upsertHistoryMutation.mutate({
							url,
							title,
							faviconUrl: favicons[0],
						});
					}
				}
			}
		},
		[paneId, updateBrowserUrl, upsertHistoryMutation],
	);

	const setupListeners = useCallback(
		(webview: Electron.WebviewTag) => {
			webview.addEventListener("dom-ready", handleDomReady);
			webview.addEventListener(
				"did-navigate",
				handleDidNavigate as EventListener,
			);
			webview.addEventListener(
				"did-navigate-in-page",
				handleDidNavigateInPage as EventListener,
			);
			webview.addEventListener("did-start-loading", handleDidStartLoading);
			webview.addEventListener("did-stop-loading", handleDidStopLoading);
			webview.addEventListener(
				"page-title-updated",
				handlePageTitleUpdated as EventListener,
			);
			webview.addEventListener(
				"page-favicon-updated",
				handlePageFaviconUpdated as EventListener,
			);
		},
		[
			handleDomReady,
			handleDidNavigate,
			handleDidNavigateInPage,
			handleDidStartLoading,
			handleDidStopLoading,
			handlePageTitleUpdated,
			handlePageFaviconUpdated,
		],
	);

	const cleanupListeners = useCallback(
		(webview: Electron.WebviewTag) => {
			webview.removeEventListener("dom-ready", handleDomReady);
			webview.removeEventListener(
				"did-navigate",
				handleDidNavigate as EventListener,
			);
			webview.removeEventListener(
				"did-navigate-in-page",
				handleDidNavigateInPage as EventListener,
			);
			webview.removeEventListener("did-start-loading", handleDidStartLoading);
			webview.removeEventListener("did-stop-loading", handleDidStopLoading);
			webview.removeEventListener(
				"page-title-updated",
				handlePageTitleUpdated as EventListener,
			);
			webview.removeEventListener(
				"page-favicon-updated",
				handlePageFaviconUpdated as EventListener,
			);
		},
		[
			handleDomReady,
			handleDidNavigate,
			handleDidNavigateInPage,
			handleDidStartLoading,
			handleDidStopLoading,
			handlePageTitleUpdated,
			handlePageFaviconUpdated,
		],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			unregisterMutation.mutate({ paneId });
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [paneId, unregisterMutation.mutate]);

	const setWebviewRef = useCallback(
		(webview: Electron.WebviewTag | null) => {
			const prev = webviewRef.current;
			if (prev) {
				cleanupListeners(prev);
			}

			webviewRef.current = webview;

			if (webview) {
				setupListeners(webview);
			}
		},
		[setupListeners, cleanupListeners],
	);

	const goBack = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "back");
		if (url) {
			isHistoryNavigation.current = true;
			webviewRef.current?.loadURL(url);
		}
	}, [paneId, navigateBrowserHistory]);

	const goForward = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "forward");
		if (url) {
			isHistoryNavigation.current = true;
			webviewRef.current?.loadURL(url);
		}
	}, [paneId, navigateBrowserHistory]);

	const reload = useCallback(() => {
		webviewRef.current?.reload();
	}, []);

	const navigateTo = useCallback((url: string) => {
		let finalUrl = url;
		if (!/^https?:\/\//i.test(url) && !url.startsWith("about:")) {
			// If it looks like a domain (has a dot), add https
			if (url.includes(".")) {
				finalUrl = `https://${url}`;
			} else {
				// Otherwise treat as search
				finalUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
			}
		}
		webviewRef.current?.loadURL(finalUrl);
	}, []);

	return {
		webviewRef,
		setWebviewRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
		initialUrl,
	};
}
