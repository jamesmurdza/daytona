/**
 * Manages Daytona sandbox sessions and persists session-sandbox mappings
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import type { Logger } from "./logger";
import type { SandboxInfo, SessionSandboxMap } from "./types";

export class DaytonaSessionManager {
  private readonly apiKey: string;
  private readonly sessionMapFile: string;
  private readonly logger: Logger;
  private sessionSandboxes: SessionSandboxMap;

  constructor(apiKey: string, sessionMapFile: string, logger: Logger) {
    this.apiKey = apiKey;
    this.sessionMapFile = sessionMapFile;
    this.logger = logger;
    this.sessionSandboxes = this.loadSessionMap();
  }

  /**
   * Load session map from file
   */
  private loadSessionMap(): SessionSandboxMap {
    const map: SessionSandboxMap = new Map();
    try {
      if (existsSync(this.sessionMapFile)) {
        const data = JSON.parse(readFileSync(this.sessionMapFile, 'utf-8')) as Record<string, SandboxInfo>;
        for (const [sessionId, sandboxInfo] of Object.entries(data)) {
          map.set(sessionId, sandboxInfo);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to load session map: ${err}`);
    }
    return map;
  }

  /**
   * Save session map to file
   */
  private saveSessionMap(): void {
    try {
      const data: Record<string, SandboxInfo> = {};
      for (const [sessionId, sandbox] of this.sessionSandboxes.entries()) {
        data[sessionId] = { id: sandbox.id };
      }
      writeFileSync(this.sessionMapFile, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.error(`Failed to save session map: ${err}`);
    }
  }

  /**
   * Get or create a sandbox for the given session ID
   */
  async getSandbox(sessionId: string): Promise<Sandbox> {
    if (!this.apiKey) {
      this.logger.error('DAYTONA_API_KEY is not set. Cannot create or retrieve sandbox.');
      throw new Error('DAYTONA_API_KEY is not set. Please set the environment variable to use Daytona sandboxes.');
    }

    if (!this.sessionSandboxes.has(sessionId)) {
      this.logger.info(`Creating new sandbox for session: ${sessionId}`);
      const daytona = new Daytona({ apiKey: this.apiKey });
      const sandbox = await daytona.create();
      this.sessionSandboxes.set(sessionId, sandbox);
      this.saveSessionMap();
      this.logger.info(`Sandbox created successfully.`);
    } else {
      const sandboxInfo = this.sessionSandboxes.get(sessionId);
      if (sandboxInfo && !('process' in sandboxInfo)) {
        const daytona = new Daytona({ apiKey: this.apiKey });
        const sandbox = await daytona.create();
        this.sessionSandboxes.set(sessionId, sandbox);
        this.saveSessionMap();
      } else {
        this.logger.info(`Reusing existing sandbox for session: ${sessionId}`);
      }
    }

    const sandbox = this.sessionSandboxes.get(sessionId);
    if (!sandbox) {
      throw new Error(`Failed to get sandbox for session: ${sessionId}`);
    }
    if (!('process' in sandbox)) {
      throw new Error(`Sandbox is not fully initialized for session: ${sessionId}`);
    }
    return sandbox as Sandbox;
  }

  /**
   * Delete the sandbox associated with the given session ID
   */
  async deleteSandbox(sessionId: string): Promise<void> {
    const sandbox = this.sessionSandboxes.get(sessionId);
    if (sandbox && 'delete' in sandbox) {
      this.logger.info(`Removing sandbox for session: ${sessionId}`);
      await sandbox.delete();
      this.sessionSandboxes.delete(sessionId);
      this.saveSessionMap();
      this.logger.info(`Sandbox deleted successfully.`);
    } else {
      this.logger.warn(`No sandbox found for session: ${sessionId}`);
    }
  }
}
