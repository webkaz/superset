"""Claude Code runner for sandbox execution via OpenCode API."""

import asyncio
import subprocess
from pathlib import Path
from typing import Any, Callable

from .config import SandboxConfig
from .events import EventEmitter
from .opencode_client import OpenCodeClient, OpenCodeEvent


class ClaudeRunner:
    """Runs Claude Code via OpenCode API in the sandbox environment."""

    def __init__(
        self,
        config: SandboxConfig,
        emitter: EventEmitter,
        workspace_path: Path,
        opencode_port: int = 4096,
    ):
        self.config = config
        self.emitter = emitter
        self.workspace_path = workspace_path
        self.opencode_port = opencode_port
        self._stop_requested = False
        self._opencode_client: OpenCodeClient | None = None

    async def _get_client(self) -> OpenCodeClient:
        """Get or create the OpenCode client."""
        if self._opencode_client is None:
            self._opencode_client = OpenCodeClient(port=self.opencode_port)
            await self._opencode_client.__aenter__()
        return self._opencode_client

    async def run_prompt_async(
        self,
        prompt: str,
        message_id: str | None = None,
        model: str | None = None,
        author: dict[str, Any] | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute a prompt through OpenCode API.

        Args:
            prompt: The prompt text to send to Claude
            message_id: Control plane message ID for event correlation
            model: Optional model override (e.g., "claude-sonnet-4" or "anthropic/claude-sonnet-4")
            author: Optional author info for git identity (userId, githubName, githubEmail)
            on_event: Optional callback for each event

        Returns:
            dict with success status and output/error
        """
        self._stop_requested = False

        # Configure git identity if author provided
        if author:
            await self._configure_git_identity(author)

        # Use model from args, or fall back to config
        effective_model = model or self.config.model

        try:
            client = await self._get_client()
            final_text = ""
            tool_calls: list[dict[str, Any]] = []

            async for event in client.stream_prompt(
                content=prompt,
                message_id=message_id or "unknown",
                model=effective_model,
            ):
                if self._stop_requested:
                    await client.stop_session()
                    self.emitter.emit_error("Execution stopped by user", message_id)
                    return {"success": False, "error": "Stopped by user"}

                # Process event and emit to control plane
                self._process_event(event, message_id, on_event)

                # Track state for result
                if event.type == "token":
                    final_text = event.data.get("content", "")
                elif event.type == "tool_call":
                    tool_calls.append(event.data)
                elif event.type == "error":
                    self.emitter.emit_execution_complete(
                        success=False,
                        summary=event.data.get("error"),
                        message_id=message_id,
                    )
                    return {"success": False, "error": event.data.get("error")}

            # Success
            self.emitter.emit_execution_complete(
                success=True,
                summary="Prompt completed",
                message_id=message_id,
            )

            return {
                "success": True,
                "output": final_text,
                "tool_calls": tool_calls,
            }

        except Exception as e:
            error_msg = str(e)
            self.emitter.emit_error(error_msg, message_id)
            self.emitter.emit_execution_complete(
                success=False,
                summary=error_msg,
                message_id=message_id,
            )
            return {"success": False, "error": error_msg}

    def run_prompt(
        self,
        prompt: str,
        message_id: str | None = None,
        model: str | None = None,
        author: dict[str, Any] | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute a prompt (sync wrapper for async implementation).

        This is the synchronous API for backward compatibility.
        """
        return asyncio.run(
            self.run_prompt_async(prompt, message_id, model, author, on_event)
        )

    def _process_event(
        self,
        event: OpenCodeEvent,
        message_id: str | None,
        on_event: Callable[[dict[str, Any]], None] | None,
    ) -> None:
        """Process an OpenCode event and emit to control plane."""
        if event.type == "token":
            content = event.data.get("content", "")
            if content:
                self.emitter.emit_token(content, message_id)

        elif event.type == "tool_call":
            tool = event.data.get("tool", "unknown")
            args = event.data.get("args", {})
            status = event.data.get("status", "")
            output = event.data.get("output", "")

            if status in ("pending", "running"):
                self.emitter.emit_tool_call(tool, args, message_id)
            elif status == "completed":
                self.emitter.emit_tool_result(tool, output, None, message_id)
            elif status == "error":
                self.emitter.emit_tool_result(tool, None, output, message_id)

        elif event.type == "error":
            self.emitter.emit_error(event.data.get("error", "Unknown error"), message_id)

        # Call optional callback
        if on_event:
            on_event({"type": event.type, **event.data})

    async def _configure_git_identity(self, author: dict[str, Any]) -> None:
        """Configure git identity for commit attribution."""
        github_name = author.get("githubName")
        github_email = author.get("githubEmail")

        if not github_name or not github_email:
            return

        print(f"[runner] Configuring git identity: {github_name} <{github_email}>")

        try:
            # Set git config locally for the workspace
            subprocess.run(
                ["git", "config", "--local", "user.name", github_name],
                cwd=self.workspace_path,
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "config", "--local", "user.email", github_email],
                cwd=self.workspace_path,
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            print(f"[runner] Failed to configure git identity: {e}")

    async def stop_async(self) -> None:
        """Stop the running execution (async)."""
        self._stop_requested = True
        if self._opencode_client:
            await self._opencode_client.stop_session()

    def stop(self) -> None:
        """Stop the running execution (sync wrapper)."""
        self._stop_requested = True
        # Try to stop via OpenCode API if client exists
        if self._opencode_client:
            asyncio.run(self._opencode_client.stop_session())

    async def cleanup(self) -> None:
        """Clean up resources."""
        if self._opencode_client:
            await self._opencode_client.__aexit__(None, None, None)
            self._opencode_client = None
