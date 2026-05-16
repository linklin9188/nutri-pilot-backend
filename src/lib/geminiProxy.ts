/**
 * geminiProxy.ts — single client-side helper for hitting the
 * /functions/v1/gemini-proxy edge function.
 *
 * Why: the four legacy gemini* libs used to fetch Google directly with
 * VITE_GEMINI_API_KEY (extractable from the bundle). They now post
 * through this helper so the key stays server-side and each endpoint
 * gets its own daily quota.
 */

import { getUserId } from './userId';

export type GeminiEndpoint = 'vision' | 'michelin' | 'school_balance' | 'recipe';

interface CallOptions {
  endpoint:           GeminiEndpoint;
  contents:           any[];          // Gemini contents array (text / multimodal parts)
  generationConfig?:  Record<string, unknown>;
  model?:             string;         // override default gemini-2.5-flash
}

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;

/**
 * Returns the raw Gemini response JSON (same shape as before — caller
 * extracts candidates[0].content.parts[0].text the same way).
 *
 * Throws on transport / rate-limit / Gemini errors so existing
 * try/catch blocks keep working.
 */
export async function callGemini({ endpoint, contents, generationConfig, model }: CallOptions): Promise<any> {
  const userId = getUserId() ?? 'anonymous';
  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      user_id:           userId,
      endpoint,
      contents,
      ...(generationConfig ? { generationConfig } : {}),
      ...(model            ? { model }            : {}),
    }),
  });
  const j = await res.json();
  if (res.status === 429) {
    throw new Error(j.error || 'AI 额度已用完，明日再试');
  }
  if (!res.ok) {
    throw new Error(j.error || 'AI 请求失败，请稍后重试');
  }
  return j.data;
}
