/**
 * HelperOvernightPrepCard — TICKET-098 SPEC v2 Phase 2
 *
 * 菲佣端 HelperHome 显示"今晚要预制明早的菜". 老板 5/27 拍板:
 * "早餐可以吃昨晚做好拿出来热一下的东西".
 *
 * 逻辑:
 *  - 拉雇主**明天**的早餐菜单 (跟今天 cookSchedule 同链路, 改 day_index+1)
 *  - 过滤 overnight 类菜 (粥/包子/卤味 等)
 *  - 空 → return null (老板"不必要不显")
 *  - 仅 19:00 后显 (跟备菜推送同时机)
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { classifyBreakfastPrep } from '../lib/breakfastPrepPhase';

interface DishLite {
  id: string;
  title_zh: string;
  cook_time_min?: number | null;
}

interface Props {
  /** 必传 — 菲佣绑定的 household id */
  householdId: string;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getCurrentWeekStart(): string {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTomorrowDayIndex(): number {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (tomorrow.getDay() + 6) % 7;  // Mon=0 ... Sun=6
}

export default function HelperOvernightPrepCard({ householdId }: Props) {
  const [dishes, setDishes] = useState<DishLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. household → employer_id
        const { data: hh } = await supabase
          .from('households')
          .select('employer_id')
          .eq('id', householdId)
          .maybeSingle();
        const employerId = (hh as any)?.employer_id;
        if (!employerId) { if (!cancelled) setLoaded(true); return; }

        // 2. 雇主明天早餐
        const weekStart = getCurrentWeekStart();
        const dayIdx = getTomorrowDayIndex();
        // 周末 (dayIdx 5/6) 没菜单 → 跳过
        if (dayIdx > 4) { if (!cancelled) setLoaded(true); return; }

        const { data: menuRows } = await supabase
          .from('user_weekly_menus')
          .select('dish_ids, meal_type')
          .eq('user_id', employerId)
          .eq('week_start', weekStart)
          .eq('day_index', dayIdx)
          .eq('meal_type', 'breakfast');

        const dishIds: string[] = [];
        for (const row of menuRows ?? []) {
          const ids = (row as any).dish_ids as string[] | null;
          if (Array.isArray(ids)) dishIds.push(...ids);
        }
        if (dishIds.length === 0) { if (!cancelled) setLoaded(true); return; }

        // 3. 拉菜数据 + classify
        const { data: dishRows } = await supabase
          .from('dishes')
          .select('id, title_zh, cook_time_min')
          .in('id', dishIds);

        const overnight = (dishRows ?? []).filter(d =>
          classifyBreakfastPrep(d as any) === 'overnight'
        ) as DishLite[];

        if (!cancelled) {
          setDishes(overnight);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [householdId]);

  // 只 19:00 后显示 (避免白天打扰; 老板 5/27 "不必要不显")
  const hour = new Date().getHours();
  const showByTime = hour >= 19 || hour < 6;  // 晚餐时段 + 凌晨 (跨夜场景)

  if (!loaded || dishes.length === 0 || !showByTime) return null;

  // 估总预制时间 (sum cook_time_min, 缺失按 30 分钟 default 粥的常见时长)
  const totalMin = dishes.reduce((sum, d) => sum + (d.cook_time_min ?? 30), 0);

  return (
    <div className="relative z-10 mx-5 mb-3 px-4 py-3.5 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #E8EBFB 0%, #D4DAF4 100%)',
        border: '1.5px solid rgba(74,108,247,0.25)',
        boxShadow: '0 4px 14px rgba(74,108,247,0.12)',
      }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span style={{ fontSize: 18 }}>🌙</span>
        <p className="font-bold" style={{ fontSize: 13, color: '#1a1a1a' }}>
          今晚预制明早 · Prep for tomorrow
        </p>
        <span className="ml-auto rounded-full px-2 py-0.5 font-bold"
          style={{ background: 'rgba(74,108,247,0.15)', color: '#4A6CF7', fontSize: 10 }}>
          ~{totalMin} 分钟
        </span>
      </div>
      <div className="space-y-1.5">
        {dishes.map(d => (
          <div key={d.id} className="flex items-center gap-2 text-[12.5px]"
            style={{ color: 'rgba(0,0,0,0.78)' }}>
            <span style={{ fontSize: 11, color: '#4A6CF7' }}>•</span>
            <span className="font-bold">{d.title_zh}</span>
            {d.cook_time_min && (
              <span style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.45)' }}>
                · {d.cook_time_min} 分钟
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-center" style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', letterSpacing: '0.04em' }}>
        ✨ 这些菜需要提前一晚做好, 明早加热 5 分钟即可
      </p>
    </div>
  );
}
