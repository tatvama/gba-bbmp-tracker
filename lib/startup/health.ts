import "server-only";
const pg = typeof window === "undefined" ? eval('require("pg")') : null;
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

export class ExternalServicesHealthCheckTask implements StartupTask {
  name = "External Services Health Checks";
  critical = false;

  async run(): Promise<void> {
    // 1. Check Database Latency
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const isLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");
      if (!pg) {
        throw new Error("pg module is not available.");
      }
      const client = new pg.Client({
        connectionString: dbUrl,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });
      try {
        const t0 = Date.now();
        await client.connect();
        await client.query("SELECT 1;");
        const latency = Date.now() - t0;
        StartupLogger.info(`  • Database latency: ${latency}ms`);
      } catch (err) {
        StartupLogger.warn(this.name, `Database latency check failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await client.end().catch(() => {});
      }
    }

    // 2. Check Cloudflare R2 Connectivity
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;

    if (accountId && accessKeyId && secretAccessKey && bucket) {
      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });

      try {
        const t0 = Date.now();
        await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
        const latency = Date.now() - t0;
        StartupLogger.info(`  • Cloudflare R2 bucket connection: OK (${latency}ms)`);
      } catch (err) {
        StartupLogger.warn(this.name, `Cloudflare R2 health check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      StartupLogger.warn(this.name, "R2 credentials are not fully configured. Skipping R2 health check.");
    }

    // 3. Log AI Configurations
    const aiProvider = process.env.AI_PROVIDER || "anthropic";
    const aiModel = process.env.AI_MODEL || "claude-sonnet-4-6";
    StartupLogger.info(`  • AI Provider: ${aiProvider} (Model: ${aiModel})`);
  }
}
