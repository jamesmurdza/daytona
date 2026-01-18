/**
 * Logger class for handling plugin logging
 */

import { appendFileSync } from "fs";
import type { LogLevel } from "./types";
import { LOG_LEVEL_INFO, LOG_LEVEL_ERROR, LOG_LEVEL_WARN } from "./types";

export class Logger {
  private readonly logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
  }

  log(message: string, level: LogLevel = LOG_LEVEL_INFO): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    appendFileSync(this.logFile, logEntry);
  }

  info(message: string): void {
    this.log(message, LOG_LEVEL_INFO);
  }

  error(message: string): void {
    this.log(message, LOG_LEVEL_ERROR);
  }

  warn(message: string): void {
    this.log(message, LOG_LEVEL_WARN);
  }
}
