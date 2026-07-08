import "server-only";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

export class CacheInitializationTask implements StartupTask {
  name = "Cache Layer Initialization";
  critical = false;

  async run(): Promise<void> {
    // There is no Redis/Memcached configured in this Next.js project.
    // In-memory or Next.js build-in fetch caching are used.
    StartupLogger.info("External cache not configured. Defaulting to in-memory caching.");
  }
}
