import "server-only";
import { StartupLogger } from "./logger";
import { EnvironmentValidationTask } from "./environment";
import { DatabaseConfigurationTask, DatabaseConnectivityTask } from "./database";
import { DatabaseMigrationTask } from "./migrations";
import { DatabaseSeedingTask } from "./seed";
import { StorageInitializationTask } from "./storage";
import { CacheInitializationTask } from "./cache";
import { BackgroundJobsTask } from "./jobs";
import { ExternalServicesHealthCheckTask } from "./health";
import type { StartupTask } from "./types";

const STARTUP_COMPLETED_KEY = "__gbaStartupCompleted__";
const STARTUP_IN_PROGRESS_KEY = "__gbaStartupInProgress__";

export class StartupManager {
  private static tasks: StartupTask[] = [
    new EnvironmentValidationTask(),
    new DatabaseConfigurationTask(),
    new DatabaseConnectivityTask(),
    new DatabaseMigrationTask(),
    new DatabaseSeedingTask(),
    new StorageInitializationTask(),
    new CacheInitializationTask(),
    new BackgroundJobsTask(),
    new ExternalServicesHealthCheckTask(),
  ];

  static async run(): Promise<boolean> {
    const g = globalThis as Record<string, unknown>;

    if (g[STARTUP_COMPLETED_KEY]) {
      // Already initialized, do nothing
      return true;
    }

    if (g[STARTUP_IN_PROGRESS_KEY]) {
      // Startup is already running in this process
      return false;
    }

    g[STARTUP_IN_PROGRESS_KEY] = true;
    const startTime = Date.now();

    StartupLogger.info("Starting centralized application bootstrap...");

    for (const task of this.tasks) {
      StartupLogger.info(`Running task: ${task.name}...`);
      const taskStart = Date.now();
      try {
        await task.run();
        const duration = Date.now() - taskStart;
        StartupLogger.success(task.name, duration);
      } catch (err) {
        const duration = Date.now() - taskStart;
        StartupLogger.failure(task.name, err, duration);

        if (task.critical) {
          StartupLogger.failure("Startup Manager", `Halt: Critical startup task "${task.name}" failed.`);
          // Terminate the process cleanly with exit code 1 to prevent server startup
          if (process.env.NODE_ENV !== "test") {
            process.exit(1);
          }
          throw err;
        } else {
          StartupLogger.warn("Startup Manager", `Non-critical startup task "${task.name}" failed. Continuing...`);
        }
      }
    }

    g[STARTUP_COMPLETED_KEY] = true;
    g[STARTUP_IN_PROGRESS_KEY] = false;

    const totalDuration = Date.now() - startTime;
    StartupLogger.success("Application Bootstrap", totalDuration);
    StartupLogger.info("Application is ready to accept requests.");
    
    return true;
  }
}
