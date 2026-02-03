"use client";

import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";

interface TextShimmerProps {
	children: React.ReactNode;
	className?: string;
	duration?: number;
	as?: React.ElementType;
}

/**
 * TextShimmer - Animated shimmer effect for pending states.
 * Inspired by 1code's TextShimmer component.
 */
export function TextShimmer({
	children,
	className,
	duration = 1.5,
	as: Component = "span",
}: TextShimmerProps) {
	const [isAnimating, setIsAnimating] = useState(true);

	// Stop animation after component unmounts to avoid memory leaks
	useEffect(() => {
		return () => setIsAnimating(false);
	}, []);

	return (
		<Component
			className={cn(
				"inline-flex items-center",
				isAnimating && "animate-shimmer bg-clip-text text-transparent",
				className,
			)}
			style={{
				backgroundImage: isAnimating
					? "linear-gradient(90deg, currentColor 0%, currentColor 40%, hsl(var(--muted-foreground)) 50%, currentColor 60%, currentColor 100%)"
					: undefined,
				backgroundSize: isAnimating ? "200% 100%" : undefined,
				animationDuration: `${duration}s`,
				color: isAnimating ? undefined : "inherit",
			}}
		>
			{children}
		</Component>
	);
}
