import { ipcMain, dialog, BrowserWindow } from 'electron'

import type { CreateWorkspaceInput, UpdateWorkspaceInput, CreateWorktreeInput, CreateScreenInput } from 'shared/types'

import workspaceManager from './workspace-manager'

export function registerWorkspaceIPCs() {
  // Open repository dialog
  ipcMain.on('open-repository', async (event) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) return

    // Show directory picker
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Repository',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return
    }

    const repoPath = result.filePaths[0]

    // Get current branch
    const worktreeManager = (await import('./worktree-manager')).default
    if (!worktreeManager.isGitRepo(repoPath)) {
      dialog.showErrorBox('Not a Git Repository', 'The selected directory is not a git repository.')
      return
    }

    const currentBranch = worktreeManager.getCurrentBranch(repoPath)
    if (!currentBranch) {
      dialog.showErrorBox('Error', 'Could not determine current branch.')
      return
    }

    // Check if workspace already exists for this repo
    const existingWorkspaces = await workspaceManager.list()
    const existingWorkspace = existingWorkspaces.find((ws) => ws.repoPath === repoPath)

    if (existingWorkspace) {
      // Workspace already exists, just switch to it
      mainWindow.webContents.send('workspace-opened', existingWorkspace)
      return
    }

    // Create workspace with repo name and current branch
    const repoName = repoPath.split('/').pop() || 'Repository'

    const createResult = await workspaceManager.create({
      name: repoName,
      repoPath,
      branch: currentBranch,
    })

    if (!createResult.success) {
      dialog.showErrorBox('Error', createResult.error || 'Failed to open repository')
      return
    }

    // Notify renderer to reload workspaces
    mainWindow.webContents.send('workspace-opened', createResult.workspace)
  })

  // List all workspaces
  ipcMain.handle('workspace-list', async () => {
    return await workspaceManager.list()
  })

  // Get workspace by ID
  ipcMain.handle('workspace-get', async (_event, id: string) => {
    return await workspaceManager.get(id)
  })

  // Create workspace
  ipcMain.handle('workspace-create', async (_event, input: CreateWorkspaceInput) => {
    return await workspaceManager.create(input)
  })

  // Update workspace
  ipcMain.handle('workspace-update', async (_event, input: UpdateWorkspaceInput) => {
    return await workspaceManager.update(input)
  })

  // Delete workspace
  ipcMain.handle('workspace-delete', async (_event, id: string, removeWorktree = false) => {
    return await workspaceManager.delete(id, removeWorktree)
  })

  // Get last opened workspace
  ipcMain.handle('workspace-get-last-opened', async () => {
    return await workspaceManager.getLastOpened()
  })

  // Create worktree
  ipcMain.handle('worktree-create', async (_event, input: CreateWorktreeInput) => {
    return await workspaceManager.createWorktree(input)
  })

  // Create screen
  ipcMain.handle('screen-create', async (_event, input: CreateScreenInput) => {
    return await workspaceManager.createScreen(input)
  })
}
