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
import "./complaints-list";
import "./complaints-detail";
import "./complaints-forms";
import "./complaints-advanced";
import "./rti";
import "./rti-advanced";
import "./rti-forms";
import "./rti-list";

export {};
