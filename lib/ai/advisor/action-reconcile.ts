import { RECOMMENDATION_ACTIONS, type RecommendationAction } from "./types";

/**
 * Decide the final primary action. The AI owns the decision when it ran and
 * returned a valid enum value; otherwise (AI disabled/failed, or an out-of-enum
 * hallucination) we fall back to the deterministic date-math action so the
 * advisor still gives a sane answer with no AI key. Pure — unit-tested.
 */
export function reconcileAction(
  aiAction: string | null | undefined,
  deterministicFallback: RecommendationAction,
  aiOk: boolean,
): RecommendationAction {
  if (!aiOk) return deterministicFallback;
  if (aiAction && (RECOMMENDATION_ACTIONS as readonly string[]).includes(aiAction)) {
    return aiAction as RecommendationAction;
  }
  return deterministicFallback;
}
