import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from './preferenceColMap';

// ── Text → structured signals ─────────────────────────────────────────────
//
// 中文关键词映射到 DB enum 标签。
// 每条规则命中后叠加，同一次输入可触发多条规则。

interface ParsedSignals {
  flavorSignals: Record<string, number>;  // flavor_tags → +1 喜欢 / -1 不喜欢
  healthSignals: Record<string, number>;  // health_benefit_tags → 同上
  cuisineSignal: string | null;
  isDishRequest: boolean;                 // 无法解析 → 视为新菜扩容请求
}

const PARSE_RULES: Array<{
  keywords: string[];
  flavorSignals?: Record<string, number>;
  healthSignals?: Record<string, number>;
  cuisineSignal?: string;
}> = [
  // 口味偏好
  { keywords: ['辣', '麻辣', '要辣', '吃辣', '辣的'],                      flavorSignals: { spicy: 1 } },
  { keywords: ['不辣', '不要辣', '少辣', '微辣'],                           flavorSignals: { spicy: -0.5 } },
  { keywords: ['清淡', '清淡的', '少油', '少盐', '低脂', '淡一点'],          flavorSignals: { light: 1, spicy: -1 } },
  { keywords: ['素', '素菜', '蔬菜', '不要肉', '纯素', '吃素'],              flavorSignals: { veggie: 1 } },
  { keywords: ['海鲜', '鱼', '虾', '蟹', '贝', '龙虾', '带子', '鲍鱼'],     flavorSignals: { seafood: 1 } },
  { keywords: ['不要海鲜', '不吃鱼', '不吃虾'],                             flavorSignals: { seafood: -1 } },
  { keywords: ['甜', '甜的', '甜一点'],                                      flavorSignals: { sweet: 1 } },

  // 健康目标
  { keywords: ['祛湿', '除湿', '去湿', '化湿'],                             healthSignals: { damp_clear: 1 } },
  { keywords: ['减肥', '低卡', '轻食', '少吃', '瘦身', '控制热量'],          healthSignals: { lose_weight: 1 } },
  { keywords: ['高蛋白', '增肌', '健身', '补蛋白'],                          healthSignals: { muscle_gain: 1 } },
  { keywords: ['养生', '滋补', '补身', '进补', '温补'],                      healthSignals: { maintain: 1 } },
  { keywords: ['排毒', '清肠', '清热', '降火'],                             healthSignals: { detox: 1 } },

  // 菜系
  { keywords: ['粤菜', '广东', '港式', '港粤', '白切', '清蒸'],             cuisineSignal: 'cantonese' },
  { keywords: ['川菜', '四川', '重庆', '麻辣烫', '火锅'],                   cuisineSignal: 'sichuan' },
  { keywords: ['江南', '苏浙', '上海', '杭州', '淮扬'],                     cuisineSignal: 'jiangnan' },
  { keywords: ['北方', '北京', '饺子', '炸酱面', '东北'],                   cuisineSignal: 'northern' },
  { keywords: ['日式', '寿司', '日本', '韩式', '韩国', '料理'],             cuisineSignal: 'japanese_korean' },
  { keywords: ['西餐', '意大利', '法国', '西式'],                           cuisineSignal: 'western' },
  { keywords: ['东南亚', '泰国', '越南', '椰汁', '咖喱'],                   cuisineSignal: 'southeast_asian' },
];

export function parseTextToSignals(text: string): ParsedSignals {
  const lower = text.toLowerCase();
  const flavorSignals: Record<string, number> = {};
  const healthSignals: Record<string, number> = {};
  let cuisineSignal: string | null = null;
  let hitCount = 0;

  for (const rule of PARSE_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      hitCount++;
      if (rule.flavorSignals) {
        for (const [tag, val] of Object.entries(rule.flavorSignals)) {
          flavorSignals[tag] = (flavorSignals[tag] ?? 0) + val;
        }
      }
      if (rule.healthSignals) {
        for (const [tag, val] of Object.entries(rule.healthSignals)) {
          healthSignals[tag] = (healthSignals[tag] ?? 0) + val;
        }
      }
      if (rule.cuisineSignal) cuisineSignal = rule.cuisineSignal;
    }
  }

  // Clamp combined signals to [-1, +1]
  for (const k of Object.keys(flavorSignals)) flavorSignals[k] = Math.max(-1, Math.min(1, flavorSignals[k]));
  for (const k of Object.keys(healthSignals)) healthSignals[k] = Math.max(-1, Math.min(1, healthSignals[k]));

  return {
    flavorSignals,
    healthSignals,
    cuisineSignal,
    isDishRequest: hitCount === 0, // 完全无法解析 → 可能是新菜请求
  };
}

// ── Exponential moving average update ────────────────────────────────────
//
// new_score = old_score × DECAY + signal × RATE
// 设计意图：
//   5 次正向反馈后大约达到 +0.45（不至于完全压制5D画像）
//   1 次负向反馈可以快速将强偏好降回中位

const DECAY = 0.85;
const RATE  = 0.15;


async function updatePreferenceScores(
  userId: string,
  signals: ParsedSignals,
  currentScores: Record<string, number>,
): Promise<Record<string, number>> {
  const updated = { ...currentScores };

  const apply = (col: string, signal: number) => {
    const old = updated[col] ?? 0;
    updated[col] = Math.max(-1, Math.min(1, old * DECAY + signal * RATE));
  };

  // Apply decay to ALL existing scores first (aging out stale preferences)
  for (const col of [...Object.values(FLAVOR_COL), ...Object.values(HEALTH_COL), ...Object.values(CUISINE_COL)]) {
    updated[col] = (updated[col] ?? 0) * DECAY;
  }

  // Apply new signals
  for (const [tag, val] of Object.entries(signals.flavorSignals)) {
    if (FLAVOR_COL[tag]) apply(FLAVOR_COL[tag], val);
  }
  for (const [tag, val] of Object.entries(signals.healthSignals)) {
    if (HEALTH_COL[tag]) apply(HEALTH_COL[tag], val);
  }
  if (signals.cuisineSignal && CUISINE_COL[signals.cuisineSignal]) {
    apply(CUISINE_COL[signals.cuisineSignal], 1);
  }

  updated.feedback_count = (updated.feedback_count ?? 0) + 1;

  // Persist to Supabase (non-blocking, best effort)
  supabase
    .from('user_preference_scores')
    .upsert({ user_id: userId, ...updated, last_updated: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.warn('[Supabase] preference score upsert failed:', error.message);
    });

  return updated;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface FeedbackState {
  submitting: boolean;
  lastText: string | null;
  isDishRequest: boolean; // true → unknown dish, shown as "已记录，我们会考虑加入菜谱"
}

export function useFeedbackInput(options: {
  currentScores: Record<string, number>;
  onScoresUpdated: (newScores: Record<string, number>) => void;
}) {
  const [state, setState] = useState<FeedbackState>({
    submitting: false,
    lastText: null,
    isDishRequest: false,
  });

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setState(s => ({ ...s, submitting: true }));

    const userId = getUserId() ?? 'guest';
    const signals = parseTextToSignals(trimmed);

    // 1. Save raw feedback
    supabase.from('user_feedback').insert({
      user_id:        userId,
      feedback_text:  trimmed,
      flavor_signals: signals.flavorSignals,
      health_signals: signals.healthSignals,
      cuisine_signal: signals.cuisineSignal,
      is_dish_request: signals.isDishRequest,
    }).then(({ error }) => {
      if (error) console.warn('[Supabase] feedback insert failed:', error.message);
    });

    // 2. If unknown dish request → also log to dish_requests for product team
    if (signals.isDishRequest) {
      supabase.from('dish_requests').insert({
        request_text: trimmed,
        inferred_cuisine: signals.cuisineSignal,
      }).then(({ error }) => {
        if (error) console.warn('[Supabase] dish_request insert failed:', error.message);
      });
    }

    // 3. Update preference scores (EMA) and surface to parent
    const newScores = await updatePreferenceScores(userId, signals, options.currentScores);
    options.onScoresUpdated(newScores);

    setState({ submitting: false, lastText: trimmed, isDishRequest: signals.isDishRequest });
  };

  return { submit, ...state };
}
