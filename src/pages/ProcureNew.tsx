/**
 * ProcureNew — 采购页 6 模块 (Warm Hearth 大改版, 老板 5/31 拍板"重新做新页")
 *
 * 全新独立页, 挂 /procure-v2。旧 VerifyIngredients.tsx 原封不动, 老板最后挑用哪个。
 *
 * 老板拍板 6 模块 (跟点菜五篮子对齐 + 多一个"辅料"):
 *   肉 / 海鲜 / 蔬菜 / 水果 / 主食 / 辅料(油盐酱醋葱姜蒜)
 *   → 用户脑子里分类 = 点菜分类 = 买菜分类, 三处一致。
 *
 * 下单态 (两态同布局, 永不返工):
 *   - 肉 + 海鲜: 预留"可下单"位 (Inalca 等供应商签约前仍灰标"需自行购买",
 *     签约后只把这块换成 ✅ 一键下单按钮, 版面/分类/动线一字不改)。
 *   - 蔬菜/水果/主食/辅料: 列出买什么 + 用量, 标"需自行购买"。
 *
 * 数据: loadEmployerTodayMenu(uid, dayOffset) 拿当日菜 → dishToIngredients
 *   (复用现成聚合引擎, 按 prep_steps_json 真实备料 + 人数缩放) → aggregateIngredients
 *   (规范化合并同名) → 按 category 映射到 6 模块。零改算法。
 *   今天/明天切换: 明天 = 提前采购的主场景。
 *
 * 雇主端页, 中文 OK (非菲佣端)。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../lib/userId';
import { loadEmployerTodayMenu, type EmployerDishLite } from '../lib/helperEmployerMenu';
import {
  dishToIngredients, aggregateIngredients,
  type ShoppingIngredient, type AggregatedIngredient,
} from '../lib/dishIngredients';

const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

// ── 6 模块定义 (老板拍板顺序) ────────────────────────────────────────────────
// category 真值 (来自 dishIngredients): pork/beef/poultry/egg/seafood/veggie/tofu/other/carb/condiment
type ModuleKey = 'meat' | 'seafood' | 'veg' | 'fruit' | 'staple' | 'aux';
const MODULES: {
  key: ModuleKey; emoji: string; zh: string;
  cats: string[];          // 命中哪些 ingredient category
  orderable: boolean;      // 是否预留"可下单"位 (肉+海鲜)
}[] = [
  { key: 'meat',    emoji: '🥩', zh: '肉',   cats: ['pork', 'beef', 'poultry', 'egg'], orderable: true },
  { key: 'seafood', emoji: '🐟', zh: '海鲜', cats: ['seafood'],                         orderable: true },
  { key: 'veg',     emoji: '🥬', zh: '蔬菜', cats: ['veggie', 'tofu', 'other'],         orderable: false },
  { key: 'fruit',   emoji: '🍎', zh: '水果', cats: [],                                  orderable: false }, // 走 course_type=fruit
  { key: 'staple',  emoji: '🌾', zh: '主食', cats: ['carb'],                            orderable: false },
  { key: 'aux',     emoji: '🧂', zh: '辅料', cats: ['condiment'],                       orderable: false },
];

function unwrapPrep(raw: unknown): any[] {
  if (!raw) return [];
  let arr: any = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((e: any) => (typeof e === 'string' ? (() => { try { return JSON.parse(e); } catch { return e; } })() : e));
}

function formatAmt(ing: AggregatedIngredient): string {
  if (ing.unit === 'piece') return `${Math.max(1, Math.round(ing.weightGrams / 60))} 个`;
  const g = ing.weightGrams;
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg`;
  return `${Math.round(g)} ${ing.unit}`;
}

function readHeadcount(): { adults: number; kids: number } {
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '2', 10);
  const kids = parseInt(localStorage.getItem('nutri_kids') ?? '0', 10);
  return { adults: Math.max(1, adults), kids: Math.max(0, kids) };
}

export default function ProcureNew() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'today' | 'tomorrow'>('tomorrow'); // 采购主场景=明天
  const [dishesToday, setDishesToday] = useState<EmployerDishLite[]>([]);
  const [dishesTomorrow, setDishesTomorrow] = useState<EmployerDishLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const uid = getUserId();
      const [td, tmr] = await Promise.all([
        loadEmployerTodayMenu(uid, 0),
        loadEmployerTodayMenu(uid, 1),
      ]);
      if (!cancelled) {
        setDishesToday(td.dishes);
        setDishesTomorrow(tmr.dishes);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dishes = tab === 'today' ? dishesToday : dishesTomorrow;
  const { adults, kids } = readHeadcount();
  const effPeople = Math.max(1, adults + kids * 0.5);

  // 聚合: 每道菜 → 食材 → 合并同名
  const aggregated = useMemo(() => {
    const all: ShoppingIngredient[] = [];
    for (const d of dishes) {
      const dishForEngine = { ...d, prep_steps_json: unwrapPrep(d.prep_steps_json) };
      all.push(...dishToIngredients(dishForEngine, adults, kids));
    }
    return aggregateIngredients(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes, adults, kids]);

  // 水果模块: 直接从菜单里 course_type=fruit 的菜列 (水果不走 prep_steps)
  const fruitItems = useMemo(
    () => dishes.filter(d => d.course_type === 'fruit'),
    [dishes],
  );

  // 按 6 模块分桶
  const byModule = useMemo(() => {
    const map: Record<ModuleKey, AggregatedIngredient[]> = {
      meat: [], seafood: [], veg: [], fruit: [], staple: [], aux: [],
    };
    for (const ing of aggregated) {
      const mod = MODULES.find(m => m.cats.includes(ing.category));
      if (mod) map[mod.key].push(ing);
      else map.veg.push(ing); // 未知 category 兜底进蔬菜
    }
    return map;
  }, [aggregated]);

  const hasAny = dishes.length > 0;
  const totalItems = aggregated.length + fruitItems.length;

  function toggle(key: string) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 40 }}>
      {/* Header */}
      <header className="sticky top-0 z-20" style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3 px-4 pt-5 pb-2">
          <button onClick={() => navigate(-1)} className="rounded-full flex items-center justify-center active:scale-95 shrink-0"
            style={{ width: 40, height: 40, background: ALT }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="font-black" style={{ fontSize: 22 }}>采购清单</h1>
            {hasAny && <p style={{ fontSize: 12, color: SUB }}>{totalItems} 样 · {effPeople} 人份</p>}
          </div>
        </div>
        {/* 今天 / 明天 */}
        <div className="px-4 pb-2">
          <div className="inline-flex p-1 rounded-2xl gap-0.5 w-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
            {(['tomorrow', 'today'] as const).map(k => {
              const on = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)}
                  className="flex-1 py-2 rounded-xl font-bold transition-all active:scale-95"
                  style={{ fontSize: 13.5, background: on ? '#FFFFFF' : 'transparent', color: on ? INK : SUB, boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                  {k === 'tomorrow' ? '明天买菜' : '今天补货'}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="px-4 py-3 space-y-5">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="rounded-2xl" style={{ height: 100, background: ALT, opacity: 0.6 }} />)}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center text-center pt-20 px-6">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#CFCFC8' }}>shopping_basket</span>
            <p className="font-bold mt-4" style={{ fontSize: 17 }}>
              {tab === 'tomorrow' ? '明天还没排菜' : '今天还没排菜'}
            </p>
            <p className="mt-1" style={{ fontSize: 14, color: SUB }}>先排好菜单，这里自动生成采购清单</p>
            <button onClick={() => navigate('/chef')}
              className="mt-6 px-7 py-3 rounded-full font-bold text-white active:scale-95"
              style={{ background: BRAND, fontSize: 15 }}>去排菜</button>
          </div>
        ) : (
          MODULES.map(mod => {
            const items = mod.key === 'fruit' ? fruitItems : byModule[mod.key];
            if (!items || items.length === 0) return null;
            return (
              <section key={mod.key} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {/* 模块头 */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 20 }}>{mod.emoji}</span>
                    <h2 className="font-bold" style={{ fontSize: 16 }}>{mod.zh}</h2>
                    <span style={{ fontSize: 12, color: SUB }}>{items.length}</span>
                  </div>
                  {mod.orderable ? (
                    <span className="px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(255,90,31,0.10)', color: BRAND, fontSize: 11 }}>
                      即将支持一键下单
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full" style={{ background: ALT, color: SUB, fontSize: 11 }}>
                      需自行购买
                    </span>
                  )}
                </div>
                {/* 食材行 */}
                <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                  {mod.key === 'fruit'
                    ? fruitItems.map((f, i) => {
                        const key = `fruit-${f.id}`;
                        const on = checked.has(key);
                        return (
                          <button key={key} onClick={() => toggle(key)}
                            className="w-full flex items-center gap-3 px-4 py-3 active:bg-black/[0.02] text-left">
                            <CheckDot on={on} />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold" style={{ fontSize: 15, textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.5 : 1 }}>{f.title_zh}</p>
                            </div>
                            <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: BRAND, fontWeight: 700 }}>{Math.ceil(effPeople)} 份</span>
                          </button>
                        );
                      })
                    : (byModule[mod.key]).map((ing, i) => {
                        const key = `${mod.key}-${ing.nameZh}-${i}`;
                        const on = checked.has(key);
                        const showVariants = (ing.variants?.length ?? 0) >= 2;
                        return (
                          <button key={key} onClick={() => toggle(key)}
                            className="w-full flex items-center gap-3 px-4 py-3 active:bg-black/[0.02] text-left">
                            <CheckDot on={on} />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold" style={{ fontSize: 15, textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.5 : 1 }}>
                                {ing.nameZh}
                              </p>
                              {showVariants && (
                                <p style={{ fontSize: 11, color: SUB, marginTop: 1 }}>（{ing.variants!.join(' + ')}）</p>
                              )}
                              {ing.substitutes && ing.substitutes.length > 0 && (
                                <p style={{ fontSize: 11, color: '#A855F7', marginTop: 1 }}>↔ 缺货可换：{ing.substitutes.join('、')}</p>
                              )}
                            </div>
                            <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: BRAND, fontWeight: 700 }}>{formatAmt(ing)}</span>
                          </button>
                        );
                      })}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

function CheckDot({ on }: { on: boolean }) {
  return (
    <span className="flex items-center justify-center rounded-full shrink-0 transition-all"
      style={{ width: 22, height: 22, border: on ? 'none' : '2px solid rgba(0,0,0,0.18)', background: on ? GREEN : 'transparent' }}>
      {on && <span className="material-symbols-outlined text-white" style={{ fontSize: 15 }}>check</span>}
    </span>
  );
}
