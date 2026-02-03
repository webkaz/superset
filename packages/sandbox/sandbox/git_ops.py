"""Git operations for sandbox environment."""

import asyncio
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

from .config import SandboxConfig, WORKSPACE_ROOT, GIT_CLONE_TIMEOUT_SECONDS
from .events import EventEmitter


class TokenResolution(NamedTuple):
    """Result of GitHub token resolution."""

    token: str
    source: str


class GitOperations:
    """Handles git operations within the sandbox."""

    def __init__(self, config: SandboxConfig, emitter: EventEmitter):
        self.config = config
        self.emitter = emitter
        self.workspace_path = Path(WORKSPACE_ROOT) / config.repo_name

    def _run_git(self, args: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + args
        return subprocess.run(
            cmd,
            cwd=cwd or self.workspace_path,
            capture_output=True,
            text=True,
            timeout=timeout or 60,
        )

    def clone_repo(self, github_token: str) -> bool:
        """Clone the repository."""
        self.emitter.emit_git_sync("cloning")

        # Clean up existing workspace directory if it exists
        if self.workspace_path.exists():
            try:
                shutil.rmtree(self.workspace_path)
            except Exception as e:
                self.emitter.emit_error(f"Failed to clean workspace: {str(e)}")
                return False

        # Construct clone URL with token
        clone_url = f"https://x-access-token:{github_token}@github.com/{self.config.repo_owner}/{self.config.repo_name}.git"

        try:
            result = self._run_git(
                ["clone", "--depth", "100", clone_url, str(self.workspace_path)],
                cwd=Path(WORKSPACE_ROOT),
                timeout=GIT_CLONE_TIMEOUT_SECONDS,
            )

            if result.returncode != 0:
                self.emitter.emit_error(f"Git clone failed: {result.stderr}")
                return False

            self.emitter.emit_git_sync("cloned", {"repo": f"{self.config.repo_owner}/{self.config.repo_name}"})
            return True

        except subprocess.TimeoutExpired:
            self.emitter.emit_error("Git clone timed out")
            return False
        except Exception as e:
            self.emitter.emit_error(f"Git clone error: {str(e)}")
            return False

    def checkout_branch(self) -> bool:
        """Checkout or create the working branch."""
        self.emitter.emit_git_sync("checking_out", {"branch": self.config.branch})

        try:
            # Fetch the base branch first
            result = self._run_git(["fetch", "origin", self.config.base_branch])
            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to fetch base branch: {result.stderr}")
                return False

            # Check if branch exists remotely
            result = self._run_git(["ls-remote", "--heads", "origin", self.config.branch])

            if self.config.branch in result.stdout:
                # Branch exists, checkout and pull
                result = self._run_git(["checkout", self.config.branch])
                if result.returncode != 0:
                    # Try creating local tracking branch
                    result = self._run_git(["checkout", "-b", self.config.branch, f"origin/{self.config.branch}"])
                if result.returncode == 0:
                    self._run_git(["pull", "origin", self.config.branch])
            else:
                # Create new branch from base
                result = self._run_git(["checkout", "-b", self.config.branch, f"origin/{self.config.base_branch}"])

            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to checkout branch: {result.stderr}")
                return False

            self.emitter.emit_git_sync("checked_out", {"branch": self.config.branch})
            return True

        except Exception as e:
            self.emitter.emit_error(f"Checkout error: {str(e)}")
            return False

    def configure_user(self) -> None:
        """Configure git user for commits."""
        name = self.config.git_user_name or "Superset Bot"
        email = self.config.git_user_email or "bot@superset.sh"

        self._run_git(["config", "user.name", name])
        self._run_git(["config", "user.email", email])

    def get_status(self) -> dict:
        """Get current git status."""
        result = self._run_git(["status", "--porcelain"])
        changed_files = [line.strip() for line in result.stdout.splitlines() if line.strip()]

        result = self._run_git(["rev-parse", "HEAD"])
        current_sha = result.stdout.strip() if result.returncode == 0 else None

        result = self._run_git(["branch", "--show-current"])
        current_branch = result.stdout.strip() if result.returncode == 0 else None

        return {
            "branch": current_branch,
            "sha": current_sha,
            "changed_files": changed_files,
            "has_changes": len(changed_files) > 0,
        }

    def push_changes(self) -> bool:
        """Push local changes to remote."""
        status = self.get_status()
        if not status["has_changes"]:
            return True

        self.emitter.emit_git_sync("pushing")

        try:
            # Add all changes
            result = self._run_git(["add", "-A"])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git add failed: {result.stderr}")
                return False

            # Commit
            result = self._run_git(["commit", "-m", "Changes from Superset cloud workspace"])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git commit failed: {result.stderr}")
                return False

            # Push
            result = self._run_git(["push", "origin", self.config.branch])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git push failed: {result.stderr}")
                return False

            self.emitter.emit_git_sync("pushed", {"branch": self.config.branch})
            return True

        except Exception as e:
            self.emitter.emit_error(f"Push error: {str(e)}")
            return False

    def resolve_github_token(
        self,
        fresh_token: str | None = None,
        env_token_key: str = "GITHUB_APP_TOKEN",
    ) -> TokenResolution:
        """Resolve GitHub token with priority ordering.

        Token priority:
        1. Fresh app token from command (just-in-time from control plane)
        2. Startup app token from env (may be expired for long sessions)
        3. No auth (will fail for private repos)

        Args:
            fresh_token: Fresh token provided from command
            env_token_key: Environment variable name for fallback token

        Returns:
            TokenResolution with token and source description for logging.
        """
        if fresh_token:
            return TokenResolution(fresh_token, "fresh from command")
        elif os.environ.get(env_token_key):
            return TokenResolution(os.environ[env_token_key], "from env")
        else:
            return TokenResolution("", "none")

    async def push_branch_async(
        self,
        branch_name: str,
        github_token: str | None = None,
        repo_owner: str | None = None,
        repo_name: str | None = None,
    ) -> dict:
        """Push a specific branch to remote with authenticated URL.

        This method is designed to be called from the bridge in response
        to a push command from the control plane. It uses a fresh GitHub
        token for authentication.

        Args:
            branch_name: Name of the branch to push
            github_token: Fresh GitHub token for authentication
            repo_owner: Repository owner (defaults to config)
            repo_name: Repository name (defaults to config)

        Returns:
            dict with success status and optional error message
        """
        owner = repo_owner or self.config.repo_owner
        name = repo_name or self.config.repo_name

        token, token_source = self.resolve_github_token(github_token)
        print(f"[git_ops] Pushing branch: {branch_name} to {owner}/{name} (token: {token_source})")

        if not self.workspace_path.exists():
            return {"success": False, "error": "No repository found"}

        try:
            refspec = f"HEAD:refs/heads/{branch_name}"

            if not token or not owner or not name:
                print("[git_ops] Push failed: missing GitHub token or repository info")
                return {
                    "success": False,
                    "error": "Push failed - GitHub authentication token is required",
                }

            # Build authenticated push URL
            push_url = f"https://x-access-token:{token}@github.com/{owner}/{name}.git"
            print(f"[git_ops] Pushing HEAD to {branch_name} via authenticated URL")

            # Use asyncio subprocess for non-blocking push
            result = await asyncio.create_subprocess_exec(
                "git",
                "push",
                push_url,
                refspec,
                "-f",
                cwd=self.workspace_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            _stdout, stderr = await result.communicate()

            if result.returncode != 0:
                # Don't log stderr as it may contain the token
                print("[git_ops] Push failed (see event for details)")
                return {
                    "success": False,
                    "error": "Push failed - authentication may be required",
                }
            else:
                print("[git_ops] Push successful")
                self.emitter.emit_git_sync("pushed", {"branch": branch_name})
                return {"success": True, "branch": branch_name}

        except Exception as e:
            print(f"[git_ops] Push error: {e}")
            return {"success": False, "error": str(e)}

    def push_branch(
        self,
        branch_name: str,
        github_token: str | None = None,
        repo_owner: str | None = None,
        repo_name: str | None = None,
    ) -> dict:
        """Push a branch (sync wrapper for async implementation)."""
        return asyncio.run(
            self.push_branch_async(branch_name, github_token, repo_owner, repo_name)
        )
