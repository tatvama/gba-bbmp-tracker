/**
 * Side-effect-only: importing this file registers every translation
 * namespace (each ./*.ts file calls registerNamespace() at module load).
 * Mirrors lib/jobs/handlers/index.ts and lib/sources/adapters/index.ts.
 */
import "./common";
import "./navigation";
import "./status";
import "./workflow";
import "./complaints";
import "./rti";

export {};
