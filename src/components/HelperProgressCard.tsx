/**
 * HelperProgressCard — TICKET-098 SPEC v2 Phase 1
 *
 * 雇主 Home 显示菲佣今日做菜进度. 解雇主真测痛点 #1: "我下班路上想知道
 * 菲佣今天做没做".
 *
 * 读 helper_cook_logs by household_id + today, 按 meal_type 分组渲染:
 *  - 早餐 ✓ 08:30 完成
 *  - 午餐 ⏳ 进行中
 *  - 晚餐 ⏰ 待做
 *
 * 没绑 household / 没记录 → 显示骨架/隐藏 (不渲染空卡污染主页).
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadTodayCookLogs, type CookLog } from '../lib/helperCookLog';

interface Props {
  householdId?: string | null;
}

interface CantCookItem {
  dish_id: string;
  title: string;
}

const MEAL_ORDER: Array<'breakfast' | 'lunch' | 'dinner'> = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' } as const;
const MEAL_EMOJI = { breakfast: '🥐', lunch: '🍱', dinner: '🍲' } as const;

function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function HelperProgressCard({ householdId }: Props) {
  const [logs, setLogs] = useState<CookLog[]>([]);
  const [cantCook, setCantCook] = useState<CantCookItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    Promise.all([
      loadTodayCookLogs(householdId),
      // TICKET-098 Phase 5 — 拉菲佣 "不会做" 反馈 (近 7 天 reason='helper_cant_cook')
      supabase
        .from('user_chat_preferences')
        .select('preference_value, created_at')
        .eq('household_id', householdId)
        .eq('source', 'didnt_eat')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .then(({ data }) => {
          const items: CantCookItem[] = [];
          for (const r of (data ?? []) as any[]) {
            const v = r.preference_value;
            if (v?.reason === 'helper_cant_cook' && v?.dish_id && v?.title) {
              items.push({ dish_id: v.dish_id, title: v.title });
            }
          }
          // 去重 by dish_id
          const seen = new Set<string>();
          return items.filter(i => seen.has(i.dish_id) ? false : (seen.add(i.dish_id), true));
        })
        .then((items: CantCookItem[]) => items)
        .then(items => Promise.resolve(items))
        .catch(() => [] as CantCookItem[]),
    ]).then(([lg, cc]) => {
      if (cancelled) return;
      setLogs(lg);
      setCantCook(cc as CantCookItem[]);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });

    // 5 分钟自动刷一次 (菲佣 toggle 后雇主端能看到新进度)
    const interval = setInterval(() => {
      loadTodayCookLogs(householdId).then(d => { if (!cancelled) setLogs(d); });
    }, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [householdId]);

  // 没绑 household 或都没数据 → 不渲染 (主页保持干净, 老板"不必要不显")
  if (!householdId || !loaded || (logs.length === 0 && cantCook.length === 0)) return null;

  // 按 meal_type 分组聚合状态
  const byMeal: Record<string, { done: CookLog[]; cooking: CookLog[]; pending: CookLog[] }> = {
    breakfast: { done: [], cooking: [], pending: [] },
    lunch:     { done: [], cooking: [], pending: [] },
    dinner:    { done: [], cooking: [], pending: [] },
  };
  for (const log of logs) {
    const meal = log.meal_type;
    const status = log.status;
    if (!byMeal[meal]) continue;
    if (status === 'done') byMeal[meal].done.push(log);
    else if (status === 'cooking') byMeal[meal].cooking.push(log);
    else byMeal[meal].pending.push(log);
  }

  return (
    <div className="rounded-2xl p-4"
      style={{
        background: 'linear-gradient(135deg, #FFFAF5 0%, #FFE9D2 100%)',
        border: '1.5px solid rgba(255,90,31,0.20)',
        boxShadow: '0 4px 14px rgba(255,140,80,0.10)',
      }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: 18 }}>👩‍🍳</span>
        <p className="font-bold" style={{ fontSize: 13, color: '#1a1a1a' }}>
          菲佣今日进度
        </p>
      </div>
      <div className="space-y-1.5">
        {MEAL_ORDER.map(meal => {
          const m = byMeal[meal];
          const total = m.done.length + m.cooking.length + m.pending.length;
          if (total === 0) return null;  // 该餐没记录 → 跳过

          // 状态判定: 全 done → 绿色完成 / 任一 cooking → 进行中 / 否则 pending
          let statusEmoji = '⏰';
          let statusText = '待做';
          let statusColor = 'rgba(0,0,0,0.45)';
          let timeText = '';

          if (m.done.length === total) {
            statusEmoji = '✅';
            statusText = '完成';
            statusColor = '#25D366';
            // 取最晚完成时间
            const lastDone = m.done.reduce<string | null>((acc, l) =>
              !acc || (l.completed_at ?? '') > acc ? (l.completed_at ?? acc) : acc
            , null);
            timeText = lastDone ? fmtTime(lastDone) : '';
          } else if (m.cooking.length > 0) {
            statusEmoji = '⏳';
            statusText = '进行中';
            statusColor = '#FF5A1F';
          } else if (m.done.length > 0) {
            statusEmoji = '🟡';
            statusText = `${m.done.length}/${total} 完成`;
            statusColor = '#FF9500';
          }

          return (
            <div key={meal} className="flex items-center gap-2 text-[13px]"
              style={{ color: 'rgba(0,0,0,0.78)' }}>
              <span style={{ fontSize: 16, minWidth: 22 }}>{MEAL_EMOJI[meal]}</span>
              <span className="font-bold" style={{ minWidth: 32 }}>{MEAL_LABEL[meal]}</span>
              <span style={{ fontSize: 14, marginLeft: 4 }}>{statusEmoji}</span>
              <span className="font-bold" style={{ color: statusColor, fontSize: 12 }}>{statusText}</span>
              {timeText && (
                <span className="tabular-nums" style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>· {timeText}</span>
              )}
            </div>
          );
        })}
      </div>
      {/* TICKET-098 Phase 5 — 菲佣 "不会做" 反馈 (近 7 天). 触发雇主下次菜单
          要决定是否换菜. 只有 cantCook 非空才显. */}
      {cantCook.length > 0 && (
        <div className="mt-3 pt-3 border-t border-black/[0.08]">
          <p className="font-bold mb-1.5" style={{ fontSize: 11.5, color: '#FF5A1F' }}>
            🆘 菲佣反馈不会做
          </p>
          <div className="space-y-1">
            {cantCook.slice(0, 3).map(c => (
              <div key={c.dish_id} className="flex items-center gap-2 text-[12px]"
                style={{ color: 'rgba(0,0,0,0.70)' }}>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.30)' }}>•</span>
                <span className="font-bold">{c.title}</span>
              </div>
            ))}
          </div>
          {cantCook.length > 3 && (
            <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', marginTop: 4 }}>
              还有 {cantCook.length - 3} 道...
            </p>
          )}
        </div>
      )}

      <p className="mt-2.5 text-center" style={{ fontSize: 10, color: 'rgba(0,0,0,0.40)', letterSpacing: '0.04em' }}>
        ✨ 菲佣在菲佣端勾"做完了"，这里实时显示
      </p>
    </div>
  );
}
