/**
 * Side-effect-only: importing this file registers every source adapter (each
 * ./*.ts file calls registerSourceAdapter at module load). Import once from
 * any code path that needs allSourceAdapters()/getSourceAdapter() to see the
 * full set — e.g. lib/jobs/handlers/source-fetch.ts.
 */
import "./ifms";
import "./rti";
import "./contacts";
import "./job-documents";
import "./manual";

export {};
