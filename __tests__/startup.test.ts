import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvironmentValidationTask } from "@/lib/startup/environment";
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
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.DATABASE_URL;

      const task = new EnvironmentValidationTask();
      await expect(task.run()).rejects.toThrow("Environment validation failed");
    });

    it("should pass validation when all required env vars are present", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
      process.env.DATABASE_URL = "postgresql://localhost:5432/db";
      process.env.R2_ACCOUNT_ID = "account-id";
      process.env.R2_ACCESS_KEY_ID = "access-key";
      process.env.R2_SECRET_ACCESS_KEY = "secret-key";
      process.env.R2_BUCKET_NAME = "bucket-name";
      process.env.R2_PUBLIC_URL = "https://example.r2.dev";

      const task = new EnvironmentValidationTask();
      await expect(task.run()).resolves.toBeUndefined();
    });

    it("should log warning if optional variables are missing", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
      process.env.DATABASE_URL = "postgresql://localhost:5432/db";
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
