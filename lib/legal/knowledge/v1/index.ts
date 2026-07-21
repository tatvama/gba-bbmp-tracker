/**
 * Legal knowledge base — version 1.
 *
 * Assembles the curated, verified catalog from its grouped source files. Each
 * source file owns one subject area; adding a law means adding one LegalReference
 * to the right file (open for extension, closed for modification — no resolver
 * change). Revenue provisions (property tax, trade licence) live inside the KMC
 * Act entry in municipal.ts so the Act is cited once with grouped provisions.
 */
import type { LegalReference } from "@/lib/legal/types";
import { MUNICIPAL_REFERENCES } from "./municipal";
import { TOWN_PLANNING_REFERENCES } from "./townplanning";
import { HEALTH_WASTE_REFERENCES } from "./health-waste";
import { ENVIRONMENT_REFERENCES } from "./environment";
import { HORTICULTURE_REFERENCES } from "./horticulture";
import { UTILITY_REFERENCES } from "./utilities";
import { ANTICORRUPTION_REFERENCES } from "./anticorruption";
import { NUISANCE_REFERENCES } from "./nuisance";

export const V1_VERSION = "v1";

export const V1_CATALOG: LegalReference[] = [
  ...MUNICIPAL_REFERENCES,
  ...TOWN_PLANNING_REFERENCES,
  ...HEALTH_WASTE_REFERENCES,
  ...ENVIRONMENT_REFERENCES,
  ...HORTICULTURE_REFERENCES,
  ...UTILITY_REFERENCES,
  ...ANTICORRUPTION_REFERENCES,
  ...NUISANCE_REFERENCES,
];
