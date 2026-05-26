/**
 * HelperFamilyPrefsCard — TICKET-094 雇主菲佣双向打通
 *
 * 菲佣端 HelperHome 顶部显示雇主家偏好。读 user_chat_preferences 表的
 * household_id 维度（雇主在 chat 答的偏好通过 household_id 共享给菲佣）。
 *
 * 老板拍板 (5/26 晚): "一定是要打通雇主和菲佣的优化，不仅仅只是 UI".
 *
 * 设计:
 * - 菲佣绑定 household 后 mount → loadChatPreferences(_, _, householdId)
 * - 显示雇主答过的偏好（用餐风格 / 早餐主食 / 烹饪法 / 部位）
 * - 没偏好 → 隐藏整张卡 (新雇主还没答 chat 不应该让菲佣看到空)
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadChatPreferences, type ChatPreference } from '../lib/chatPreferenceExtractor';

interface Props {
  /** 必传 — 菲佣绑定的 household id */
  householdId: string;
  /** 菲佣 user_id (loadChatPreferences 需要; 雇主自己也可以查 chat prefs) */
  helperUserId: string;
}

// 中文 label 映射 (key → 显示)
const STAPLE_LABELS: Record<string, string> = {
  rice: '粥/米饭', wheat: '面食/包子', grain_misc: '杂粮',
  tuber: '薯类', bean: '杂豆', processed: '加工类',
};
const METHOD_LABELS: Record<string, string> = {
  steam: '清蒸', braise: '红烧炖煮', stirfry: '爆炒', bake: '烤煎', cold: '凉拌', boil: '白灼',
};
const PART_LABELS: Record<string, string> = {
  beef_steak: '牛排', beef_brisket: '牛腩', chicken_leg: '鸡腿', chicken_wing: '鸡翅',
  pork_rib: '排骨', fish_whole: '整条鱼', no_pref: '不挑',
};
const MEAL_STYLE_LABELS: Record<string, string> = {
  standard: '标准家常', low_staple: '少主食', high_protein: '高蛋白增肌', light: '清淡养胃',
};
const COMPLEXITY_LABELS: Record<string, string> = {
  weekday_quick: '工作日要快', always_quick: '都要快手', no_pref: '不在乎复杂度',
};

export default function HelperFamilyPrefsCard({ householdId, helperUserId }: Props) {
  const [prefs, setPrefs] = useState<Record<string, ChatPreference[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadChatPreferences(supabase, helperUserId, householdId)
      .then(p => { if (!cancelled) { setPrefs(p); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [householdId, helperUserId]);

  if (!loaded) return null;
  const hasAny = Object.values(prefs).some(arr => arr.length > 0);
  if (!hasAny) return null;

  // 提取每类显示文本
  const mealStyleText = (() => {
    const list = prefs['love_keyword'] ?? [];
    const ms = list.find(p => (p.preference_value as any)?.meal_style);
    if (!ms) return null;
    return MEAL_STYLE_LABELS[(ms.preference_value as any).meal_style] ?? null;
  })();
  const stapleText = (() => {
    const list = prefs['breakfast_staple_subtype'] ?? [];
    const subtypes: string[] = list.flatMap(p => (p.preference_value as any)?.subtypes ?? []);
    return subtypes.map(k => STAPLE_LABELS[k]).filter(Boolean).join(' · ');
  })();
  const methodText = (() => {
    const list = prefs['cook_method'] ?? [];
    const methods: string[] = list.flatMap(p => (p.preference_value as any)?.methods ?? []);
    return methods.map(k => METHOD_LABELS[k]).filter(Boolean).join(' · ');
  })();
  const partText = (() => {
    const list = prefs['meat_part'] ?? [];
    const parts: string[] = list.flatMap(p => (p.preference_value as any)?.parts ?? []);
    return parts.map(k => PART_LABELS[k]).filter(Boolean).join(' · ');
  })();
  const complexityText = (() => {
    const list = prefs['work_complexity'] ?? [];
    const c = list.find(p => (p.preference_value as any)?.choice);
    if (!c) return null;
    return COMPLEXITY_LABELS[(c.preference_value as any).choice] ?? null;
  })();

  return (
    <div className="relative z-10 mx-5 mb-3 px-4 py-3.5 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #FFFAF5 0%, #FFE9D2 100%)',
        border: '1.5px solid rgba(255,90,31,0.25)',
        boxShadow: '0 4px 14px rgba(255,140,80,0.10)',
      }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="material-symbols-outlined"
          style={{ fontSize: 18, color: '#FF5A1F', fontVariationSettings: "'FILL' 1" }}>
          family_restroom
        </span>
        <p className="font-bold" style={{ fontSize: 13, color: '#1a1a1a' }}>
          雇主家偏好 · Family Preferences
        </p>
      </div>
      <div className="space-y-1.5 text-[12px]" style={{ color: 'rgba(0,0,0,0.75)' }}>
        {mealStyleText && (
          <div className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.45)', minWidth: 56 }}>用餐风格</span>
            <span className="font-bold" style={{ color: '#FF5A1F' }}>{mealStyleText}</span>
          </div>
        )}
        {stapleText && (
          <div className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.45)', minWidth: 56 }}>早餐主食</span>
            <span>{stapleText}</span>
          </div>
        )}
        {methodText && (
          <div className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.45)', minWidth: 56 }}>烹饪法</span>
            <span>{methodText}</span>
          </div>
        )}
        {partText && (
          <div className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.45)', minWidth: 56 }}>爱吃部位</span>
            <span>{partText}</span>
          </div>
        )}
        {complexityText && (
          <div className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.45)', minWidth: 56 }}>复杂度</span>
            <span>{complexityText}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: 'rgba(0,0,0,0.40)', letterSpacing: '0.04em' }}>
        ✨ 雇主在 chat 告诉 AI 的偏好，会自动同步到你看到的菜单
      </p>
    </div>
  );
}
