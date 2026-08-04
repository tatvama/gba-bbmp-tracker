import "server-only";
import { z } from "zod";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";
import { resolveMailConfig } from "@/lib/mail/config";

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

    // Web Push for the Android app / installed PWA. Warn-only for the same
    // reason as mail below: push is optional, and adding it to the schema above
    // would break every existing deployment on boot.
    //
    // The half-configured branch is the one that matters. The opt-in toggle
    // (components/nav/push-toggle.tsx) renders on the presence of the PUBLIC key
    // alone — that is all a browser needs to subscribe — while sending needs the
    // private key too. So with only the public key set, staff can switch alerts
    // on, the subscription is stored, and nothing is ever delivered, with no
    // error anywhere. Naming the missing variable at boot is the cheapest place
    // to catch that.
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic && !vapidPrivate) {
      StartupLogger.warn(
        this.name,
        "VAPID keys are not set. Phone push notifications are off (letter email + notify webhook are unaffected).",
      );
    } else if (!vapidPublic || !vapidPrivate) {
      StartupLogger.warn(
        this.name,
        `Web Push is HALF-CONFIGURED — ${
          vapidPublic ? "VAPID_PRIVATE_KEY" : "NEXT_PUBLIC_VAPID_PUBLIC_KEY"
        } is missing. Staff can enable alerts that will never be delivered. Set both, or neither.`,
      );
    }

    // Outbound letter email. Deliberately warn-only: mail is optional, and
    // adding it to the schema above would break every existing deployment on
    // boot. The last branch is the important one — it is the only place the app
    // announces that filing a letter will now write to a real official.
    const mail = resolveMailConfig(process.env);
    switch (mail.mode) {
      case "unconfigured":
        StartupLogger.warn(
          this.name,
          "MAIL_ENABLED is \"true\" but GMAIL_USER / GMAIL_APP_PASSWORD are not both set. Letters will be recorded, not emailed.",
        );
        break;
      case "redirect":
        StartupLogger.warn(
          this.name,
          `Letter email is in TEST MODE — every message goes to ${mail.redirectTo}. Officials will NOT be contacted (unset MAIL_REDIRECT_TO to go live).`,
        );
        break;
      case "live":
        StartupLogger.warn(
          this.name,
          `Letter email is LIVE — filed letters will be emailed to the officials on record, from ${mail.user}. Set MAIL_REDIRECT_TO to divert to a test inbox.`,
        );
        break;
      default:
        break;
    }
  }
}
