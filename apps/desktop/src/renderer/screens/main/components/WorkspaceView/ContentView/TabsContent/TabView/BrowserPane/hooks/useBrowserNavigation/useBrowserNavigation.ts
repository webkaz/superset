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
	const updateBrowserUrl = useTabsStore((s) => s.updateBrowserUrl);
	const updateBrowserLoading = useTabsStore((s) => s.updateBrowserLoading);
	const registerMutation = electronTrpc.browser.register.useMutation();
	const unregisterMutation = electronTrpc.browser.unregister.useMutation();

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

			updateBrowserUrl(paneId, webview.getURL(), webview.getTitle());
			updateBrowserLoading(paneId, false);
		},
		[paneId, updateBrowserUrl, updateBrowserLoading],
	);

	const handleDidNavigateInPage = useCallback(
		(_event: Electron.DidNavigateInPageEvent) => {
			const webview = webviewRef.current;
			if (!webview) return;

			updateBrowserUrl(paneId, webview.getURL(), webview.getTitle());
		},
		[paneId, updateBrowserUrl],
	);

	const handleDidStartLoading = useCallback(() => {
		updateBrowserLoading(paneId, true);
	}, [paneId, updateBrowserLoading]);

	const handleDidStopLoading = useCallback(() => {
		updateBrowserLoading(paneId, false);
		const webview = webviewRef.current;
		if (webview) {
			updateBrowserUrl(paneId, webview.getURL(), webview.getTitle());
		}
	}, [paneId, updateBrowserUrl, updateBrowserLoading]);

	const handlePageTitleUpdated = useCallback(
		(event: Electron.PageTitleUpdatedEvent) => {
			const webview = webviewRef.current;
			if (!webview) return;
			updateBrowserUrl(paneId, webview.getURL(), event.title);
		},
		[paneId, updateBrowserUrl],
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
		},
		[
			handleDomReady,
			handleDidNavigate,
			handleDidNavigateInPage,
			handleDidStartLoading,
			handleDidStopLoading,
			handlePageTitleUpdated,
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
		},
		[
			handleDomReady,
			handleDidNavigate,
			handleDidNavigateInPage,
			handleDidStartLoading,
			handleDidStopLoading,
			handlePageTitleUpdated,
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
		webviewRef.current?.goBack();
	}, []);

	const goForward = useCallback(() => {
		webviewRef.current?.goForward();
	}, []);

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
		initialUrl,
	};
}
