import { Button } from "@superset/ui/button";
import { GlobeIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { BrowserLoadError } from "shared/tabs-types";

const ERROR_LABELS: Record<number, string> = {
	[-2]: "Network Changed",
	[-6]: "Connection Refused",
	[-7]: "Connection Timed Out",
	[-21]: "Network Changed",
	[-100]: "Connection Closed",
	[-105]: "Name Not Resolved",
	[-106]: "Internet Disconnected",
	[-109]: "Address Unreachable",
	[-118]: "Connection Timed Out",
	[-137]: "Name Not Resolved",
	[-200]: "Certificate Error",
	[-201]: "Certificate Date Invalid",
	[-202]: "Certificate Authority Invalid",
};

interface BrowserErrorOverlayProps {
	error: BrowserLoadError;
	onRetry: () => void;
}

export function BrowserErrorOverlay({
	error,
	onRetry,
}: BrowserErrorOverlayProps) {
	const [showDetails, setShowDetails] = useState(false);
	const label = ERROR_LABELS[error.code] ?? "Page Load Failed";

	const toggleDetails = useCallback(() => {
		setShowDetails((prev) => !prev);
	}, []);

	return (
		<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background z-10">
			<GlobeIcon className="size-12 text-muted-foreground/30" />
			<div className="text-center max-w-sm">
				<h2 className="text-lg font-medium text-muted-foreground/70">
					{label}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground/50">
					{error.description}
					{" · "}
					<button
						type="button"
						onClick={toggleDetails}
						className="underline hover:text-muted-foreground/70 transition-colors"
					>
						{showDetails ? "Hide Details" : "Show Details"}
					</button>
				</p>
				{showDetails && (
					<p className="mt-2 text-xs text-muted-foreground/40 break-all">
						{error.url}
						<br />
						Error code: {error.code}
					</p>
				)}
			</div>
			<Button variant="outline" size="sm" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}
