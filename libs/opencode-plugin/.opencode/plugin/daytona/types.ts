/**
 * Type definitions and constants for the Daytona OpenCode plugin
 */

import type { Sandbox } from "@daytonaio/sdk";

// OpenCode Types

export type EventSessionDeleted = {
  type: "session.deleted";
  properties: {
    info: { id: string };
  };
};

// OpenCode constants

export const EVENT_TYPE_SESSION_DELETED = 'session.deleted';

// Daytona plugin types

export type LogLevel = 'INFO' | 'ERROR' | 'WARN';

export type SandboxInfo = {
  id: string;
};

export type SessionInfo = {
  sandboxId: string;
  created: number;
  lastAccessed: number;
};

export type ProjectSessionData = {
  projectId: string;
  worktree: string;
  sessions: Record<string, SessionInfo>;
};

export type SessionSandboxMap = Map<string, Sandbox | SandboxInfo>;

// Daytona plugin constants

export const LOG_LEVEL_INFO: LogLevel = 'INFO';
export const LOG_LEVEL_ERROR: LogLevel = 'ERROR';
export const LOG_LEVEL_WARN: LogLevel = 'WARN';
