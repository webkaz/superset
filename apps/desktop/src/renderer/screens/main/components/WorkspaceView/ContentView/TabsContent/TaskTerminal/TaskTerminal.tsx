import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalTheme } from "renderer/stores/theme";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupResizeHandlers,
} from "../Terminal/helpers";

interface TaskTerminalProps {
	paneId: string;
	taskId: string;
	workspaceId: string;
}

/**
 * TaskTerminal renders a terminal that attaches to a running plan task's PTY session.
 * This allows viewing and interacting with Claude CLI running in the task execution context.
 */
export function TaskTerminal({
	paneId,
	taskId,
	workspaceId,
}: TaskTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const [isAttached, setIsAttached] = useState(false);
	const terminalTheme = useTerminalTheme();
	const initialThemeRef = useRef(terminalTheme);

	// Get pane info for focus handling
	const pane = useTabsStore((s) => s.panes[paneId]);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const focusedPaneId = useTabsStore(
		(s) => s.focusedPaneIds[pane?.tabId ?? ""],
	);
	const isFocused = focusedPaneId === paneId;

	// Attach to task terminal
	const { data: attachData } = trpc.plan.attachTerminal.useQuery(
		{ taskId },
		{ enabled: !!taskId },
	);

	// Write to task terminal
	const writeMutation = trpc.plan.writeToTerminal.useMutation();
	const resizeMutation = trpc.plan.resizeTerminal.useMutation();

	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;

	// Subscribe to terminal output
	trpc.plan.subscribeTerminal.useSubscription(
		{ taskId },
		{
			onData: (event: { data: string }) => {
				if (xtermRef.current && event.data) {
					xtermRef.current.write(event.data);
				}
			},
			enabled: !!taskId && isAttached,
		},
	);

	// Focus handling
	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		if (pane?.tabId) {
			setFocusedPane(pane.tabId, paneId);
		}
	};

	useEffect(() => {
		if (isFocused && xtermRef.current) {
			xtermRef.current.focus();
		}
	}, [isFocused]);

	// Initialize terminal
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const { xterm, fitAddon, cleanup } = createTerminalInstance(container, {
			initialTheme: initialThemeRef.current,
		});
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Handle user input - write to task terminal
		const inputDisposable = xterm.onData((data: string) => {
			writeRef.current({ taskId, data });
		});

		// Setup focus listener
		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);

		// Setup resize handlers
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ taskId, cols, rows });
			},
		);

		return () => {
			inputDisposable.dispose();
			cleanupFocus?.();
			cleanupResize();
			cleanup();
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [taskId, workspaceId]);

	// Write scrollback when attach data is available
	useEffect(() => {
		if (attachData?.exists && attachData.scrollback && xtermRef.current) {
			xtermRef.current.write(attachData.scrollback);
			setIsAttached(true);
		}
	}, [attachData]);

	// Update theme
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	// Show message if task terminal not found
	if (attachData && !attachData.exists) {
		return (
			<div
				className="h-full w-full flex items-center justify-center text-muted-foreground"
				style={{ backgroundColor: terminalBg }}
			>
				<div className="text-center">
					<p>Task terminal session not found</p>
					<p className="text-sm mt-1">
						The task may have completed or not started yet.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			role="application"
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
		>
			{!isAttached && (
				<div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10">
					Attaching to task terminal...
				</div>
			)}
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}
