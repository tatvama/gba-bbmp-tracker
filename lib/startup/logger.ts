import "server-only";

export class StartupLogger {
  static info(message: string) {
    console.log(`[startup] ${message}`);
  }

  static success(taskName: string, durationMs?: number) {
    const timeStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
    console.log(`✔ ${taskName} completed${timeStr}`);
  }

  static warn(taskName: string, message: string) {
    console.warn(`⚠ ${taskName} warning: ${message}`);
  }

  static failure(taskName: string, error: unknown, durationMs?: number) {
    const timeStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${taskName} failed${timeStr}: ${errMsg}`);
  }
}
