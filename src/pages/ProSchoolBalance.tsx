/**
 * ProSchoolBalance — 学校营养补全
 *
 * 大陆来港的家庭多数把小孩送国际学校或本地直资，午餐多西式 + 沙拉；
 * 家长担心营养结构和大陆校餐不同，回家想"补"。这页让家长输入孩子今天
 * 在学校吃了什么（自由文本 + 已有营养复选），然后给晚餐推荐 3 道能填
 * 上缺口的家常菜。
 *
 * 数据流：本地启发式（先打通流程）→ 后续接 Gemini AI 做更细的营养差距
 * 分析。这里我们只用规则：缺什么 → 给对应高营养食材的菜。
 */

import { useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useSubscription } from "../lib/subscription";
import { analyzeSchoolLunch, type BalanceAnalysis } from "../lib/geminiSchoolBalance";
import BottomTabBar from "../components/BottomTabBar";

type Nutrient = 'protein' | 'veggie' | 'carb' | 'calcium' | 'iron' | 'omega3';

interface SchoolBalanceRecipe {
  name_zh:  string;
  name_en:  string;
  emoji:    string;
  covers:   Nutrient[];      // 补的营养
  time_min: number;
  blurb:    string;
}

const RECIPES: SchoolBalanceRecipe[] = [
  { name_zh: '番茄牛肉炖土豆', name_en: 'Tomato beef stew', emoji: '🥩',
    covers: ['protein', 'iron', 'veggie'], time_min: 35,
    blurb: '补铁补蛋白，番茄维 C 助吸收' },
  { name_zh: '三文鱼炒牛油果',  name_en: 'Salmon avocado bowl', emoji: '🐟',
    covers: ['protein', 'omega3'], time_min: 15,
    blurb: 'Omega-3 + 优质蛋白，孩子专注力' },
  { name_zh: '虾仁炒蛋', name_en: 'Shrimp scrambled egg', emoji: '🍳',
    covers: ['protein', 'omega3'], time_min: 10,
    blurb: '快手补蛋白 + 海洋微量元素' },
  { name_zh: '芝士焗西兰花',  name_en: 'Cheesy broccoli bake', emoji: '🥦',
    covers: ['veggie', 'calcium', 'protein'], time_min: 20,
    blurb: '钙 + 维生素 K，孩子骨骼发育' },
  { name_zh: '菠菜豆腐汤',  name_en: 'Spinach tofu soup', emoji: '🍲',
    covers: ['iron', 'calcium', 'veggie'], time_min: 15,
    blurb: '植物铁 + 钙，菠菜搭豆腐互补' },
  { name_zh: '紫菜蛋花汤',  name_en: 'Seaweed egg drop soup', emoji: '🥣',
    covers: ['protein', 'iron'], time_min: 8,
    blurb: '快手碘 + 铁，校餐后补微量元素' },
  { name_zh: '糙米饭 + 烤鸡腿', name_en: 'Brown rice + roast chicken thigh',
    emoji: '🍗', covers: ['protein', 'carb'], time_min: 40,
    blurb: '复合碳水 + 优质蛋白，运动后晚餐' },
  { name_zh: '芝麻奶昔', name_en: 'Sesame milk smoothie', emoji: '🥛',
    covers: ['calcium'], time_min: 5,
    blurb: '钙吸收率高，乳糖不耐版用豆奶代' },
];

const NUTRIENT_META: Record<Nutrient, { label: string; emoji: string }> = {
  protein: { label: '蛋白',   emoji: '💪' },
  veggie:  { label: '蔬菜',   emoji: '🥗' },
  carb:    { label: '主食',   emoji: '🍚' },
  calcium: { label: '钙',     emoji: '🦴' },
  iron:    { label: '铁',     emoji: '🩸' },
  omega3:  { label: 'Omega-3', emoji: '🐟' },
};

// Heuristic: keywords in the lunch description → which nutrients are likely
// already covered. Mixes English and Chinese to match HK school menu wording.
const LUNCH_KEYWORDS: { kw: RegExp; covers: Nutrient[] }[] = [
  { kw: /chicken|beef|fish|tofu|egg|pork|tuna|肉|鱼|蛋|豆腐/i, covers: ['protein'] },
  { kw: /salad|broccoli|carrot|spinach|veg|蔬菜|沙拉/i,         covers: ['veggie'] },
  { kw: /rice|pasta|bread|noodle|sandwich|米饭|意面|面条|三明治/i, covers: ['carb'] },
  { kw: /milk|cheese|yogurt|奶|芝士|酸奶/i,                       covers: ['calcium'] },
  { kw: /spinach|liver|beef|菠菜|肝/i,                            covers: ['iron'] },
  { kw: /salmon|tuna|sardine|三文鱼|金枪鱼/i,                      covers: ['omega3'] },
];

function inferCovered(lunchText: string): Set<Nutrient> {
  const set = new Set<Nutrient>();
  for (const r of LUNCH_KEYWORDS) {
    if (r.kw.test(lunchText)) r.covers.forEach(c => set.add(c));
  }
  return set;
}

export default function ProSchoolBalance() {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscription();

  const [lunchText, setLunchText] = useState('');
  const [manualCovered, setManualCovered] = useState<Set<Nutrient>>(new Set());
  const [ageBracket, setAgeBracket] = useState<'幼儿园' | '小学低年级' | '小学高年级' | '初中'>('小学低年级');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult,    setAiResult]    = useState<BalanceAnalysis | null>(null);
  const [aiError,     setAiError]     = useState<string | null>(null);

  // All hooks must run unconditionally — early returns go below them.
  const covered = useMemo(() => {
    const fromText = inferCovered(lunchText);
    return new Set<Nutrient>([...fromText, ...manualCovered]);
  }, [lunchText, manualCovered]);

  const allNutrients: Nutrient[] = ['protein','veggie','carb','calcium','iron','omega3'];
  const missing = allNutrients.filter(n => !covered.has(n));

  // Pick 3 recipes that maximize coverage of the missing nutrients.
  const suggestions = useMemo(() => {
    if (missing.length === 0) return [];
    const scored = RECIPES.map(r => ({
      r,
      score: r.covers.filter(n => missing.includes(n)).length,
    })).filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score || a.r.time_min - b.r.time_min);
    return scored.slice(0, 3).map(s => s.r);
  }, [missing.join(',')]);

  async function runAI() {
    if (!lunchText.trim()) return;
    setAiAnalyzing(true);
    setAiError(null);
    try {
      const r = await analyzeSchoolLunch(lunchText, ageBracket);
      setAiResult(r);
    } catch (e: any) {
      setAiError(e?.message ?? 'AI 分析失败');
    } finally {
      setAiAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#FF5A1F] rounded-full animate-spin" />
      </div>
    );
  }
  if (!isPro) return <Navigate to="/pricing" replace />;

  const toggleCovered = (n: Nutrient) => {
    setManualCovered(prev => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold">学校营养补全</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">输入校餐 · 一键补晚餐</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full"
          style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "white" }}>
          ⭐ Pro
        </span>
      </header>

      <main className="flex-1 px-5 py-5 pb-32 space-y-5">

        <section
          className="rounded-3xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 70%, #90CAF9 100%)",
            boxShadow: "0 12px 32px rgba(25,118,210,0.20)",
          }}
        >
          <p className="text-[12px] uppercase tracking-widest opacity-80">School + Home</p>
          <h2 className="font-serif font-black text-[22px] leading-tight mt-1">
            国际学校吃啥，回家补啥
          </h2>
          <p className="mt-2 text-[12px] opacity-90 leading-relaxed">
            把今天孩子在学校午餐填进来，我们计算缺哪些营养，
            给晚餐 3 道家常补全菜。
          </p>
        </section>

        {/* Step 1: lunch input + age + AI trigger */}
        <section className="space-y-2">
          <p className="text-[13px] font-bold text-gray-700 px-1">① 今天学校吃了什么</p>
          <textarea
            value={lunchText}
            onChange={e => setLunchText(e.target.value)}
            placeholder="例如：grilled chicken, brown rice, broccoli, apple, milk"
            className="w-full min-h-[80px] rounded-2xl p-3 text-[13px] bg-white border border-black/10 focus:outline-none focus:border-[#1976D2]"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] text-gray-400 mr-1">孩子阶段</span>
            {(['幼儿园','小学低年级','小学高年级','初中'] as const).map(a => (
              <button
                key={a}
                onClick={() => setAgeBracket(a)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all"
                style={{
                  background: ageBracket === a ? '#1976D2' : 'white',
                  color: ageBracket === a ? 'white' : '#444',
                  border: ageBracket === a ? '1px solid #1976D2' : '1px solid rgba(0,0,0,0.10)',
                }}
              >
                {a}
              </button>
            ))}
          </div>
          <button
            onClick={runAI}
            disabled={!lunchText.trim() || aiAnalyzing}
            className="w-full mt-2 h-11 rounded-2xl font-bold text-white text-[13px] active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #1976D2, #42A5F5)',
              boxShadow: '0 6px 18px rgba(25,118,210,0.25)',
            }}
          >
            {aiAnalyzing ? (
              <><div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" /> AI 分析中…</>
            ) : (
              <>✨ 用 AI 分析营养差距</>
            )}
          </button>
          {aiError && (
            <p className="text-[11px] text-red-500">AI 不可用，回退到快速识别：{aiError}</p>
          )}
          <p className="text-[10px] text-gray-400">中英文都可以；可以直接抄学校 Parent Portal 上的菜单。</p>
        </section>

        {/* Step 2: covered / missing nutrients */}
        <section className="space-y-2">
          <p className="text-[13px] font-bold text-gray-700 px-1">② 已有营养（自动 + 手动补齐）</p>
          <div className="flex flex-wrap gap-2">
            {allNutrients.map(n => {
              const auto = inferCovered(lunchText).has(n);
              const manual = manualCovered.has(n);
              const active = auto || manual;
              return (
                <button
                  key={n}
                  onClick={() => toggleCovered(n)}
                  className="rounded-full px-3 py-1.5 transition-all active:scale-95 inline-flex items-center gap-1"
                  style={{
                    background: active ? "#1976D2" : "white",
                    border: active ? "1px solid #1976D2" : "1px solid rgba(0,0,0,0.10)",
                    color: active ? "white" : "#444",
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: auto && !manual ? 0.85 : 1,
                  }}
                  title={auto ? '从文本里识别到了' : '点击标记为已吃'}
                >
                  <span>{NUTRIENT_META[n].emoji}</span>
                  {NUTRIENT_META[n].label}
                  {auto && <span style={{ fontSize: 9 }}>· auto</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* AI summary banner — shown when we have a Gemini result */}
        {aiResult && (
          <section className="rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(25,118,210,0.10), rgba(66,165,245,0.05))",
              border: "1px solid rgba(25,118,210,0.30)",
            }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">✨</span>
              <p className="font-bold text-[13px]" style={{ color: "#0d47a1" }}>AI 营养分析</p>
            </div>
            <p className="text-[12px]" style={{ color: "#0d47a1" }}>{aiResult.reasoning}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] font-bold mr-1" style={{ color: "#0d47a1" }}>已覆盖：</span>
              {aiResult.covered.map(n => (
                <span key={n} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(25,118,210,0.12)', color: '#1976D2' }}>
                  {NUTRIENT_META[n]?.emoji} {NUTRIENT_META[n]?.label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[10px] font-bold mr-1" style={{ color: "#dc2626" }}>晚餐需补：</span>
              {aiResult.missing.map(n => (
                <span key={n} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>
                  {NUTRIENT_META[n]?.emoji} {NUTRIENT_META[n]?.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Step 3: missing summary (fallback heuristic) */}
        {!aiResult && missing.length > 0 && (
          <section className="rounded-2xl p-4 bg-white shadow-sm">
            <p className="text-[13px] font-bold text-gray-700">⚠️ 晚餐建议补 {missing.length} 类营养</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {missing.map(n => (
                <span key={n} className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626' }}>
                  {NUTRIENT_META[n].emoji} {NUTRIENT_META[n].label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Step 4: suggested dishes — prefer AI suggestions when available,
            fall back to the local heuristic-picked list. */}
        {(() => {
          const list = aiResult?.suggestions?.length ? aiResult.suggestions : suggestions;
          if (list.length === 0) return null;
          return (
            <section className="space-y-2">
              <p className="text-[13px] font-bold text-gray-700 px-1">
                ③ 推荐晚餐 · {list.length} 道 {aiResult ? '· AI 推荐' : ''}
              </p>
              {list.map((r, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
                  <span className="text-[28px] flex-shrink-0">{r.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[14px]">{r.name_zh}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: 'rgba(0,0,0,0.05)', color: '#666' }}>
                        {r.time_min} 分钟
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.name_en}</p>
                    <p className="text-[12px] text-gray-600 mt-1.5 leading-relaxed">{r.blurb}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.covers.map(n => (
                        <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: 'rgba(25,118,210,0.10)', color: '#1976D2' }}>
                          {NUTRIENT_META[n]?.emoji} 补{NUTRIENT_META[n]?.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          );
        })()}

        {missing.length === 0 && lunchText && (
          <section className="rounded-2xl p-4 bg-white shadow-sm text-center">
            <span className="text-[40px]">✅</span>
            <p className="font-bold text-[14px] mt-2">校餐营养看起来很全</p>
            <p className="text-[11px] text-gray-400 mt-1">
              晚餐做点孩子爱吃的轻量菜就好，不用刻意补。
            </p>
          </section>
        )}

        <p className="text-[10px] text-gray-400 text-center px-4 leading-relaxed pt-3">
          注：当前为关键词启发式判断，营养评估非医学诊断。后续会接 AI
          做更准确的营养结构分析。
        </p>
      </main>

      <BottomTabBar />
    </div>
  );
}
