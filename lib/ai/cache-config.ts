import "server-only";

/**
 * Global kill switch for Anthropic prompt caching (lib/ai/provider.ts). Default
 * enabled — set ANTHROPIC_PROMPT_CACHE=false to revert every AI call to its
 * pre-caching request shape with no other code changes anywhere.
 */
export function isPromptCacheEnabled(): boolean {
  return (process.env.ANTHROPIC_PROMPT_CACHE ?? "true").toLowerCase() !== "false";
}
