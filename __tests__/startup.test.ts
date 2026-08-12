import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvironmentValidationTask } from "@/lib/startup/environment";
import { DatabaseMigrationTask } from "@/lib/startup/migrations";
import { StartupManager } from "@/lib/startup/manager";
import { StartupLogger } from "@/lib/startup/logger";

describe("Startup System", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("EnvironmentValidationTask", () => {
    it("should fail validation if required env vars are missing", async () => {
      // Clear required variables
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
      delete process.env.SESSION_SECRET;

      const task = new EnvironmentValidationTask();
      await expect(task.run()).rejects.toThrow("Environment validation failed");
    });

    it("should pass validation when all required env vars are present", async () => {
      process.env.DATABASE_URL = "postgresql://localhost:5432/db";
      process.env.SESSION_SECRET = "a".repeat(32);
      process.env.R2_ACCOUNT_ID = "account-id";
      process.env.R2_ACCESS_KEY_ID = "access-key";
      process.env.R2_SECRET_ACCESS_KEY = "secret-key";
      process.env.R2_BUCKET_NAME = "bucket-name";
      process.env.R2_PUBLIC_URL = "https://example.r2.dev";

      const task = new EnvironmentValidationTask();
      await expect(task.run()).resolves.toBeUndefined();
    });

    it("should log warning if optional variables are missing", async () => {
      process.env.DATABASE_URL = "postgresql://localhost:5432/db";
      process.env.SESSION_SECRET = "a".repeat(32);
      process.env.R2_ACCOUNT_ID = "account-id";
      process.env.R2_ACCESS_KEY_ID = "access-key";
      process.env.R2_SECRET_ACCESS_KEY = "secret-key";
      process.env.R2_BUCKET_NAME = "bucket-name";
      process.env.R2_PUBLIC_URL = "https://example.r2.dev";
      
      delete process.env.CRON_SECRET;

      const warnSpy = vi.spyOn(StartupLogger, "warn");
      
      const task = new EnvironmentValidationTask();
      await task.run();
      
      expect(warnSpy).toHaveBeenCalledWith("Environment Validation", expect.stringContaining("CRON_SECRET is not set"));
    });
  });

  describe("DatabaseMigrationTask — boot-time auto-migration gate", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("skips by default when NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.RUN_MIGRATIONS_ON_BOOT;
      expect(DatabaseMigrationTask.shouldRunAutoMigrations()).toBe(false);
    });

    it("runs by default outside production", () => {
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.RUN_MIGRATIONS_ON_BOOT;
      expect(DatabaseMigrationTask.shouldRunAutoMigrations()).toBe(true);
    });

    it("RUN_MIGRATIONS_ON_BOOT=true overrides even in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.RUN_MIGRATIONS_ON_BOOT = "true";
      expect(DatabaseMigrationTask.shouldRunAutoMigrations()).toBe(true);
    });

    it("RUN_MIGRATIONS_ON_BOOT=false overrides even outside production", () => {
      vi.stubEnv("NODE_ENV", "development");
      process.env.RUN_MIGRATIONS_ON_BOOT = "false";
      expect(DatabaseMigrationTask.shouldRunAutoMigrations()).toBe(false);
    });

    it("run() skips without touching DATABASE_URL when gated off", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.RUN_MIGRATIONS_ON_BOOT;
      delete process.env.DATABASE_URL; // would throw if the gate check weren't first

      const infoSpy = vi.spyOn(StartupLogger, "info");
      const task = new DatabaseMigrationTask();
      await expect(task.run()).resolves.toBeUndefined();
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping automatic migrations"));
    });
  });

  describe("StartupManager", () => {
    it("should respect process-wide global lock flags to prevent duplicate startup runs", async () => {
      const g = globalThis as Record<string, unknown>;
      g["__gbaStartupCompleted__"] = true;

      const infoSpy = vi.spyOn(StartupLogger, "info");
      
      const result = await StartupManager.run();
      expect(result).toBe(true);
      // It should not log about starting bootstrap again since lock flag was set
      expect(infoSpy).not.toHaveBeenCalledWith("Starting centralized application bootstrap...");

      delete g["__gbaStartupCompleted__"];
    });
  });
});
