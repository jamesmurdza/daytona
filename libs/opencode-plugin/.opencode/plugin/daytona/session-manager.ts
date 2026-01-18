/**
 * Manages Daytona sandbox sessions and persists session-sandbox mappings
 * Stores data per-project in ~/.local/share/opencode/storage/daytona/{projectId}.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import type { Logger } from "./logger";
import type { SandboxInfo, SessionSandboxMap, ProjectSessionData } from "./types";

export class DaytonaSessionManager {
  private readonly apiKey: string;
  private readonly storageDir: string;
  private readonly logger: Logger;
  private sessionSandboxes: SessionSandboxMap;
  private currentProjectId?: string;

  constructor(apiKey: string, storageDir: string, logger: Logger) {
    this.apiKey = apiKey;
    this.storageDir = storageDir;
    this.logger = logger;
    this.sessionSandboxes = new Map();
    
    // Ensure storage directory exists
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a project's session data
   */
  private getProjectFilePath(projectId: string): string {
    return join(this.storageDir, `${projectId}.json`);
  }

  /**
   * Load project session data from disk
   */
  private loadProjectData(projectId: string): ProjectSessionData | null {
    const filePath = this.getProjectFilePath(projectId);
    try {
      if (existsSync(filePath)) {
        return JSON.parse(readFileSync(filePath, 'utf-8')) as ProjectSessionData;
      }
    } catch (err) {
      this.logger.error(`Failed to load project data for ${projectId}: ${err}`);
    }
    return null;
  }

  /**
   * Load sessions for a specific project into memory
   */
  private loadProjectSessions(projectId: string): void {
    const projectData = this.loadProjectData(projectId);
    if (projectData) {
      for (const [sessionId, sessionInfo] of Object.entries(projectData.sessions)) {
        this.sessionSandboxes.set(sessionId, { id: sessionInfo.sandboxId });
      }
      this.logger.info(`Loaded ${Object.keys(projectData.sessions).length} sessions for project ${projectId}`);
    }
  }

  /**
   * Save project session data to disk
   */
  private saveProjectData(projectId: string, worktree: string, sessions: Record<string, { sandboxId: string; created: number; lastAccessed: number }>): void {
    const filePath = this.getProjectFilePath(projectId);
    const projectData: ProjectSessionData = {
      projectId,
      worktree,
      sessions,
    };
    
    try {
      writeFileSync(filePath, JSON.stringify(projectData, null, 2));
      this.logger.info(`Saved project data for ${projectId}`);
    } catch (err) {
      this.logger.error(`Failed to save project data for ${projectId}: ${err}`);
    }
  }

  /**
   * Update a single session in the project file
   */
  private updateSession(projectId: string, worktree: string, sessionId: string, sandboxId: string): void {
    const projectData = this.loadProjectData(projectId) || {
      projectId,
      worktree,
      sessions: {},
    };

    const now = Date.now();
    if (!projectData.sessions[sessionId]) {
      projectData.sessions[sessionId] = {
        sandboxId,
        created: now,
        lastAccessed: now,
      };
    } else {
      projectData.sessions[sessionId].sandboxId = sandboxId;
      projectData.sessions[sessionId].lastAccessed = now;
    }

    this.saveProjectData(projectId, worktree, projectData.sessions);
  }

  /**
   * Set the current project context
   */
  setProjectContext(projectId: string): void {
    if (this.currentProjectId !== projectId) {
      this.currentProjectId = projectId;
      this.loadProjectSessions(projectId);
    }
  }

  /**
   * Get or create a sandbox for the given session ID
   */
  async getSandbox(sessionId: string, projectId: string, worktree: string): Promise<Sandbox> {
    if (!this.apiKey) {
      this.logger.error('DAYTONA_API_KEY is not set. Cannot create or retrieve sandbox.');
      throw new Error('DAYTONA_API_KEY is not set. Please set the environment variable to use Daytona sandboxes.');
    }

    // Load project sessions if needed
    this.setProjectContext(projectId);

    const existing = this.sessionSandboxes.get(sessionId);
    
    // If we have a fully initialized sandbox, reuse it
    if (existing && 'process' in existing) {
      this.logger.info(`Reusing existing sandbox for session: ${sessionId}`);
      // Update last accessed time
      this.updateSession(projectId, worktree, sessionId, existing.id);
      return existing as Sandbox;
    }
    
    // If we have a sandboxId but not a full sandbox object, reconnect to it
    if (existing && 'id' in existing && !('process' in existing)) {
      this.logger.info(`Reconnecting to existing sandbox: ${existing.id}`);
      const daytona = new Daytona({ apiKey: this.apiKey });
      const sandbox = await daytona.get(existing.id);
      this.sessionSandboxes.set(sessionId, sandbox);
      this.updateSession(projectId, worktree, sessionId, sandbox.id);
      return sandbox;
    }
    
    // Otherwise, create a new sandbox
    this.logger.info(`Creating new sandbox for session: ${sessionId} in project: ${projectId}`);
    const daytona = new Daytona({ apiKey: this.apiKey });
    const sandbox = await daytona.create();
    this.sessionSandboxes.set(sessionId, sandbox);
    this.updateSession(projectId, worktree, sessionId, sandbox.id);
    this.logger.info(`Sandbox created successfully: ${sandbox.id}`);
    return sandbox;
  }

  /**
   * Delete the sandbox associated with the given session ID
   */
  async deleteSandbox(sessionId: string, projectId: string): Promise<void> {
    const sandbox = this.sessionSandboxes.get(sessionId);
    if (sandbox && 'delete' in sandbox) {
      this.logger.info(`Removing sandbox for session: ${sessionId}`);
      await sandbox.delete();
      this.sessionSandboxes.delete(sessionId);
      
      // Remove from project file
      const projectData = this.loadProjectData(projectId);
      if (projectData && projectData.sessions[sessionId]) {
        delete projectData.sessions[sessionId];
        this.saveProjectData(projectId, projectData.worktree, projectData.sessions);
      }
      
      this.logger.info(`Sandbox deleted successfully.`);
    } else {
      this.logger.warn(`No sandbox found for session: ${sessionId}`);
    }
  }
}
