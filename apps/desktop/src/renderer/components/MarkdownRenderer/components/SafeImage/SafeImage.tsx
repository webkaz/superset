import { LuImageOff } from "react-icons/lu";
import { env } from "renderer/env.renderer";

const LINEAR_IMAGE_HOST = "uploads.linear.app";

/**
 * Checks if a URL is a Linear image upload URL.
 */
function isLinearImageUrl(src: string): boolean {
	try {
		const url = new URL(src);
		return url.host === LINEAR_IMAGE_HOST;
	} catch {
		return false;
	}
}

/**
 * Converts a Linear image URL to our proxy URL.
 */
function getLinearProxyUrl(linearUrl: string): string {
	const proxyUrl = new URL(`${env.NEXT_PUBLIC_API_URL}/api/proxy/linear-image`);
	proxyUrl.searchParams.set("url", linearUrl);
	return proxyUrl.toString();
}

type ImageSrcResult =
	| { type: "safe"; src: string }
	| { type: "proxy"; src: string }
	| { type: "blocked" };

/**
 * Check if an image source is safe to load.
 *
 * Uses strict ALLOWLIST approach:
 *
 * ALLOWED:
 * - data: URLs (embedded base64 images)
 * - Linear image URLs (proxied through our API for authentication)
 *
 * BLOCKED (everything else):
 * - http://, https:// (tracking pixels, privacy leak)
 * - file:// URLs (arbitrary local file access)
 * - Absolute paths /... or \... (become file:// in Electron)
 * - Relative paths with .. (can escape repo boundary)
 * - UNC paths //server/share (Windows NTLM credential leak)
 * - Empty or malformed sources
 *
 * Security context: In Electron production, renderer loads via file://
 * protocol. Any non-data: image src could access local filesystem or
 * trigger network requests to attacker-controlled servers.
 */
function processImageSrc(src: string | undefined): ImageSrcResult {
	if (!src) return { type: "blocked" };
	const trimmed = src.trim();
	if (trimmed.length === 0) return { type: "blocked" };

	// Allow data: URLs (embedded images)
	if (trimmed.toLowerCase().startsWith("data:")) {
		return { type: "safe", src: trimmed };
	}

	// Allow Linear image URLs (will be proxied)
	if (isLinearImageUrl(trimmed)) {
		return { type: "proxy", src: getLinearProxyUrl(trimmed) };
	}

	// Block everything else
	return { type: "blocked" };
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	className?: string;
}

/**
 * Safe image component for untrusted markdown content.
 *
 * Renders:
 * - Embedded data: URLs (directly)
 * - Linear image URLs (via authenticated proxy)
 *
 * All other sources are blocked to prevent local file access, network
 * requests, and path traversal attacks from malicious repository content.
 */
export function SafeImage({ src, alt, className }: SafeImageProps) {
	const result = processImageSrc(src);

	if (result.type === "blocked") {
		return (
			<div
				className={`inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm ${className ?? ""}`}
				title={`Image blocked: ${src ?? "(empty)"}`}
			>
				<LuImageOff className="w-4 h-4 flex-shrink-0" />
				<span className="truncate max-w-[300px]">Image blocked</span>
			</div>
		);
	}

	return (
		<img
			src={result.src}
			alt={alt}
			className={className ?? "max-w-full h-auto rounded-md my-4"}
			// For proxied images, we need to include credentials (auth token)
			crossOrigin={result.type === "proxy" ? "use-credentials" : undefined}
		/>
	);
}
