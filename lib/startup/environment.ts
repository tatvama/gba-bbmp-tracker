import "server-only";
import { z } from "zod";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
  R2_PUBLIC_URL: z.string().url("R2_PUBLIC_URL must be a valid URL"),
});

export class EnvironmentValidationTask implements StartupTask {
  name = "Environment Validation";
  critical = true;

  async run(): Promise<void> {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errors = result.error.errors
        .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Environment validation failed:\n${errors}`);
    }

    // Optional environment checks
    const aiProvider = process.env.AI_PROVIDER || "anthropic";
    if (aiProvider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
      StartupLogger.warn(this.name, "AI_PROVIDER is set to 'anthropic' but ANTHROPIC_API_KEY is not configured.");
    } else if (aiProvider === "openai" && !process.env.OPENAI_API_KEY) {
      StartupLogger.warn(this.name, "AI_PROVIDER is set to 'openai' but OPENAI_API_KEY is not configured.");
    }

    if (!process.env.CRON_SECRET) {
      StartupLogger.warn(this.name, "CRON_SECRET is not set. Scheduled routes will be inaccessible.");
    }
  }
}
