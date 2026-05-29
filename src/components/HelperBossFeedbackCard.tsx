/**
 * HelperBossFeedbackCard — TICKET-109 (老板 5/29 第二核心 "让菲佣愿意做")
 *
 * 反馈闭环的菲佣端: 菲佣做过的菜 (helper_cook_logs status='done') 里, 雇主
 * 点了 👍 (user_feedback_helper rating_good) 的, 在 HelperHome 显示
 * "❤️ Boss loved your [dish]!" 正向激励卡.
 *
 * 产品逻辑 (老板原话 "且让他们愿意去实现"):
 *   - 菲佣天天做菜得不到反馈 → 没成就感 → 不愿做新菜. 这卡补上正反馈.
 *   - v1 只显示 rating_good (庆祝/激励), 不显示 bad (避免打击; 改进类反馈
 *     未来单独做).
 *
 * 不变量:
 *   - 菲佣端禁中文 — 全 EN + Tagalog (feedback_helper_ui_no_chinese)
 *   - 无数据隐藏整卡 (老板"不必要不显")
 *   - 菜名走 title_en (菲佣视角), 不显 title_zh
 *   - 不改 schema, 两表都已存在
 *
 * employer 解析: household_members(helper_id) → households.employer_id,
 *   查不到 (dev 切菲佣端 / 未绑) → fallback 当前 user 自己当 employer,
 *   跟 helperEmployerMenu.ts / HelperHome 一致.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';

interface PraisedDish {
  dish_id: string;
  title_en: string | null;
  image_url: string | null;
}

export default function HelperBossFeedbackCard() {
  const { t3 } = useLanguage();
  const [praised, setPraised] = useState<PraisedDish[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const helperId = getUserId();
      if (!helperId) return;

      // 1. resolve employer (helper → household → employer, fallback self)
      let employerId: string | undefined;
      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('helper_id', helperId)
        .eq('status', 'active')
        .order('joined_at', { ascending: false })
        .limit(1);
      const householdId = (member?.[0] as any)?.household_id as string | undefined;
      if (householdId) {
        const { data: hh } = await supabase
          .from('households')
          .select('employer_id')
          .eq('id', householdId)
          .maybeSingle();
        employerId = (hh as any)?.employer_id as string | undefined;
      }
      if (!employerId) employerId = helperId; // dev / unbound fallback

      // 2. dishes this helper has cooked (status='done', last 30 days)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: logs } = await supabase
        .from('helper_cook_logs')
        .select('dish_id')
        .eq('helper_id', helperId)
        .eq('status', 'done')
        .gte('served_date', since);
      const cookedIds = [...new Set((logs ?? []).map((l: any) => l.dish_id).filter(Boolean))];
      if (cookedIds.length === 0) { if (!cancelled) setPraised([]); return; }

      // 3. employer's 👍 ratings on those dishes
      const { data: ratings } = await supabase
        .from('user_feedback_helper')
        .select('dish_id')
        .eq('user_id', employerId)
        .eq('feedback_type', 'rating_good')
        .in('dish_id', cookedIds);
      const praisedIds = [...new Set((ratings ?? []).map((r: any) => r.dish_id).filter(Boolean))];
      if (praisedIds.length === 0) { if (!cancelled) setPraised([]); return; }

      // 4. dish details (EN title + image for helper view)
      const { data: dishes } = await supabase
        .from('dishes')
        .select('id, title_en, image_url')
        .in('id', praisedIds);
      const result: PraisedDish[] = (dishes ?? []).map((d: any) => ({
        dish_id: d.id, title_en: d.title_en, image_url: d.image_url,
      }));
      if (!cancelled) setPraised(result.slice(0, 8));
    })().catch(() => { /* silent — 没数据隐卡 */ });
    return () => { cancelled = true; };
  }, []);

  if (praised.length === 0) return null;

  return (
    <div className="relative z-10 px-5 mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span style={{ fontSize: 16 }}>❤️</span>
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.10em', fontWeight: 700 }}>
          {t3('BOSS LOVED YOUR COOKING', 'BOSS LOVED YOUR COOKING', 'GUSTONG-GUSTO NG BOSS')}
        </p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
        {praised.map(d => (
          <div
            key={d.dish_id}
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{ width: 150, background: '#FFFFFF', border: '1px solid rgba(37,211,102,0.25)', boxShadow: '0 2px 8px rgba(37,211,102,0.10)' }}
          >
            <div className="w-full relative" style={{ height: 95, background: 'rgba(0,0,0,0.04)' }}>
              {d.image_url ? (
                <img src={d.image_url} alt={d.title_en ?? ''} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><span style={{ fontSize: 28 }}>🍽</span></div>
              )}
              <div className="absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 flex items-center gap-0.5"
                style={{ background: 'rgba(37,211,102,0.92)' }}>
                <span style={{ fontSize: 11 }}>👍</span>
              </div>
            </div>
            <div className="px-2.5 py-2">
              <p className="font-bold leading-tight line-clamp-2" style={{ fontSize: 12, color: '#1a1a1a', minHeight: 30 }}>
                {d.title_en ?? '—'}
              </p>
              <p style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>
                {t3('Boss loved it!', 'Boss loved it!', 'Gustong-gusto ng boss!')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
