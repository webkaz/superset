import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { HiArrowPath, HiCheck, HiExclamationTriangle } from "react-icons/hi2";
import type { PlanStatus } from "shared/tabs-types";

interface DecisionBarProps {
	planId: string;
	originPaneId: string;
	status: PlanStatus;
	onApprove: () => void;
	onReject: (feedback: string) => void;
	isSubmitting: boolean;
}

export function DecisionBar({
	status,
	onApprove,
	onReject,
	isSubmitting,
}: DecisionBarProps) {
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedback, setFeedback] = useState("");

	// Show status indicator for already-decided plans
	if (status !== "pending") {
		return (
			<div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
				{status === "approved" ? (
					<>
						<HiCheck className="size-4 text-green-500" />
						<span className="text-sm text-muted-foreground">Plan approved</span>
					</>
				) : (
					<>
						<HiExclamationTriangle className="size-4 text-yellow-500" />
						<span className="text-sm text-muted-foreground">
							Changes requested
						</span>
					</>
				)}
			</div>
		);
	}

	// Show feedback form when rejecting
	if (showFeedback) {
		return (
			<div className="border-t bg-muted/30 p-3 space-y-2">
				<Textarea
					value={feedback}
					onChange={(e) => setFeedback(e.target.value)}
					placeholder="Describe what changes you'd like..."
					className="min-h-[80px] resize-none"
					autoFocus
				/>
				<div className="flex justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setShowFeedback(false);
							setFeedback("");
						}}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={() => onReject(feedback)}
						disabled={!feedback.trim() || isSubmitting}
					>
						{isSubmitting ? (
							<>
								<HiArrowPath className="size-4 mr-1.5 animate-spin" />
								Sending...
							</>
						) : (
							"Send Feedback"
						)}
					</Button>
				</div>
			</div>
		);
	}

	// Show approve/reject buttons
	return (
		<div className="flex items-center justify-end gap-2 px-3 py-2 border-t bg-muted/30">
			<Button
				variant="outline"
				size="sm"
				onClick={() => setShowFeedback(true)}
				disabled={isSubmitting}
			>
				Request Changes
			</Button>
			<Button
				size="sm"
				className="bg-green-600 hover:bg-green-500 text-white"
				onClick={onApprove}
				disabled={isSubmitting}
			>
				{isSubmitting ? (
					<>
						<HiArrowPath className="size-4 mr-1.5 animate-spin" />
						Approving...
					</>
				) : (
					"Approve"
				)}
			</Button>
		</div>
	);
}
