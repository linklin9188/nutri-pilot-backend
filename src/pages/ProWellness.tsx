/**
 * ProWellness — HK climate-aware 祛湿 / 养生 menu
 *
 * 大陆来港用户 1–2 年内最容易"湿气重 / 喉咙痛 / 上火"，因为香港全年湿度
 * 高（年均 80%+）+ 空调环境干燥。该页按当下节气推荐 6–9 道港式调理菜
 * （冬瓜薏米汤、五指毛桃、土茯苓汤、薏米水…），让用户一键加入本周菜单。
 *
 * 数据来源：本地 WELLNESS_RECIPES 数组（短期方案），后续替换为 dishes 表
 * 上 health_benefit_tag 包含 'damp_relief' / 'detox' / 'nourish' 的菜。
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useSubscription } from "../lib/subscription";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
type Symptom = 'damp' | 'heat' | 'cold' | 'tired' | 'sore_throat';

interface WellnessRecipe {
  id:        string;
  name_zh:   string;
  name_yue:  string;        // 港式叫法 / 粤语
  category:  '汤水' | '糖水' | '凉茶' | '汤面' | '主菜';
  emoji:     string;
  seasons:   Season[];      // 适合季节
  symptoms:  Symptom[];     // 针对症状
  ingredients: string[];    // 主料
  effect:    string;        // 一句话功效
}

// Curated HK home-cooking 调理 recipes. Long-term these should come from the
// dishes table with the proper health tags.
const WELLNESS_RECIPES: WellnessRecipe[] = [
  { id: 'r1', name_zh: '冬瓜薏米排骨汤', name_yue: '冬瓜薏米排骨汤',
    category: '汤水', emoji: '🍲',
    seasons: ['summer', 'autumn'], symptoms: ['damp', 'heat'],
    ingredients: ['冬瓜', '薏米', '排骨', '陈皮'],
    effect: '清热祛湿，最适合港式回南天 / 暑湿' },
  { id: 'r2', name_zh: '五指毛桃煲鸡', name_yue: '五指毛桃鸡',
    category: '汤水', emoji: '🍵',
    seasons: ['spring', 'summer'], symptoms: ['damp', 'tired'],
    ingredients: ['五指毛桃', '土鸡', '茯苓', '红枣'],
    effect: '健脾祛湿 + 补气，回南天经典' },
  { id: 'r3', name_zh: '土茯苓赤小豆汤', name_yue: '土茯苓赤豆汤',
    category: '汤水', emoji: '🥣',
    seasons: ['summer'], symptoms: ['damp', 'heat'],
    ingredients: ['土茯苓', '赤小豆', '猪骨', '生薑'],
    effect: '解毒祛湿，皮肤偏油 / 长湿疹时合用' },
  { id: 'r4', name_zh: '生熟薏米水', name_yue: '薏米水',
    category: '凉茶', emoji: '🧉',
    seasons: ['summer', 'autumn'], symptoms: ['damp'],
    ingredients: ['生薏米', '熟薏米'],
    effect: '日常代饮 — 利水祛湿，孕妇慎用' },
  { id: 'r5', name_zh: '绿豆百合糖水', name_yue: '绿豆沙百合',
    category: '糖水', emoji: '🍮',
    seasons: ['summer'], symptoms: ['heat', 'sore_throat'],
    ingredients: ['绿豆', '百合', '陈皮', '冰糖'],
    effect: '清热下火，喉咙痛 / 长痘时安抚' },
  { id: 'r6', name_zh: '霸王花猪骨汤', name_yue: '霸王花煲猪骨',
    category: '汤水', emoji: '🍜',
    seasons: ['autumn', 'winter'], symptoms: ['sore_throat', 'tired'],
    ingredients: ['霸王花', '猪骨', '蜜枣', '南北杏'],
    effect: '润肺止咳，秋燥 / 干冷天保养' },
  { id: 'r7', name_zh: '川贝雪梨炖瘦肉', name_yue: '川贝炖梨',
    category: '汤水', emoji: '🍐',
    seasons: ['autumn', 'winter'], symptoms: ['sore_throat', 'heat'],
    ingredients: ['川贝', '雪梨', '瘦肉', '蜜枣'],
    effect: '润燥润喉，反复咽痛时炖一盅' },
  { id: 'r8', name_zh: '罗汉果茅根竹蔗水', name_yue: '茅根竹蔗水',
    category: '凉茶', emoji: '🍵',
    seasons: ['summer', 'autumn'], symptoms: ['heat', 'sore_throat'],
    ingredients: ['罗汉果', '白茅根', '竹蔗', '马蹄'],
    effect: '清热生津，工作熬夜 / 喉咙紧时常备' },
  { id: 'r9', name_zh: '党参黄芪炖乌鸡', name_yue: '党参黄芪炖乌鸡',
    category: '汤水', emoji: '🥘',
    seasons: ['winter'], symptoms: ['cold', 'tired'],
    ingredients: ['党参', '黄芪', '乌鸡', '红枣', '枸杞'],
    effect: '补气养血，怕冷 / 易累 / 产后调理' },
];

const SEASONS: { id: Season; label: string; emoji: string; sub: string }[] = [
  { id: 'spring', label: '春',  emoji: '🌱', sub: '回南天，潮湿困倦' },
  { id: 'summer', label: '夏',  emoji: '☀️', sub: '暑湿，易上火' },
  { id: 'autumn', label: '秋',  emoji: '🍂', sub: '燥邪，喉干鼻痒' },
  { id: 'winter', label: '冬',  emoji: '❄️', sub: '寒凉，补气血' },
];

const SYMPTOMS: { id: Symptom; label: string; emoji: string }[] = [
  { id: 'damp',         label: '湿气重',   emoji: '💧' },
  { id: 'heat',         label: '上火',     emoji: '🔥' },
  { id: 'sore_throat',  label: '喉咙痛',   emoji: '😮‍💨' },
  { id: 'tired',        label: '疲累',     emoji: '😪' },
  { id: 'cold',         label: '怕冷',     emoji: '🧣' },
];

function currentSeason(): Season {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5)  return 'spring';
  if (m >= 6 && m <= 8)  return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export default function ProWellness() {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscription();

  const [season, setSeason]     = useState<Season>(currentSeason());
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [dbDishes, setDbDishes] = useState<any[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);

  // Pull real dishes that carry调理 tags from Supabase. We don't filter by
  // season at the query layer (no season tag in DB yet); the local season +
  // symptom filters apply on the result.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dishes')
        .select('id, title_zh, title_en, image_url, health_benefit_tags, flavor_tags, course_type, main_ingredient, origin_cuisine')
        // Tags that exist in this DB: damp_clear / detox / nourish / immunity / boost_immunity
        .or(
          'health_benefit_tags.cs.{damp_clear},' +
          'health_benefit_tags.cs.{detox},' +
          'health_benefit_tags.cs.{nourish},' +
          'health_benefit_tags.cs.{immunity},' +
          'health_benefit_tags.cs.{boost_immunity}'
        )
        .limit(80);
      if (cancelled) return;
      setDbDishes(data ?? []);
      setLoadingDb(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Season → preferred tags (heuristic until we add a real seasonal tag).
  const SEASON_TAGS: Record<Season, string[]> = {
    spring: ['damp_clear', 'detox'],
    summer: ['damp_clear', 'detox'],
    autumn: ['nourish', 'detox'],
    winter: ['nourish', 'immunity', 'boost_immunity'],
  };

  // Symptom → DB tag / keyword hints.
  const SYMPTOM_TAGS: Record<Symptom, string[]> = {
    damp:        ['damp_clear'],
    heat:        ['detox'],
    sore_throat: ['nourish', 'detox'],
    tired:       ['nourish', 'immunity', 'boost_immunity'],
    cold:        ['nourish', 'immunity'],
  };

  // All hooks must run unconditionally — early returns go *below* them.
  const recipes = useMemo(() => {
    // 1) Static curated list (always in the result, season-filtered).
    const curated = WELLNESS_RECIPES
      .filter(r => r.seasons.includes(season))
      .filter(r => symptoms.length === 0 || r.symptoms.some(s => symptoms.includes(s)));

    // 2) DB dishes that match the season's preferred tags + chosen symptoms.
    const seasonTags = SEASON_TAGS[season];
    const symptomTags = symptoms.flatMap(s => SYMPTOM_TAGS[s]);
    const wantedTags = [...new Set([...seasonTags, ...symptomTags])];
    const dbHits = dbDishes
      .filter(d => {
        const tags = (d.health_benefit_tags ?? []) as string[];
        return tags.some(t => wantedTags.includes(t));
      })
      .slice(0, 12);

    return { curated, db: dbHits };
  }, [season, symptoms, dbDishes]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#FF5A1F] rounded-full animate-spin" />
      </div>
    );
  }
  if (!isPro) return <Navigate to="/pricing" replace />;

  const toggleSymptom = (s: Symptom) =>
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold">港式祛湿调理</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">按节气 · 按身体感受推荐汤水</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full"
          style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "white" }}>
          ⭐ Pro
        </span>
      </header>

      <main className="flex-1 px-5 py-5 pb-32 space-y-5">

        {/* Hero */}
        <section
          className="rounded-3xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg, #2E7D32 0%, #66BB6A 70%, #A5D6A7 100%)",
            boxShadow: "0 12px 32px rgba(46,125,50,0.20)",
          }}
        >
          <p className="text-[12px] uppercase tracking-widest opacity-80">HK 气候调理</p>
          <h2 className="font-serif font-black text-[22px] leading-tight mt-1">
            港的湿气，从家里的汤碗解决
          </h2>
          <p className="mt-2 text-[12px] opacity-90 leading-relaxed">
            香港全年湿度 80%+，回南天、暑湿、秋燥各有节奏。我们按节气和你今天的
            身体感受筛选汤水，照着煲就行。
          </p>
        </section>

        {/* Season picker */}
        <section className="space-y-2">
          <p className="text-[13px] font-bold text-gray-500 px-1">当下节气</p>
          <div className="grid grid-cols-4 gap-2">
            {SEASONS.map(s => {
              const active = season === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSeason(s.id)}
                  className="rounded-2xl p-3 text-center transition-all active:scale-[0.97]"
                  style={{
                    background: "white",
                    border: active ? "2px solid #2E7D32" : "2px solid transparent",
                    boxShadow: active ? "0 6px 18px rgba(46,125,50,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <p className="text-[22px] mb-0.5">{s.emoji}</p>
                  <p className="font-bold text-[12px]">{s.label}</p>
                  <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{s.sub}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Symptom multi-select */}
        <section className="space-y-2">
          <p className="text-[13px] font-bold text-gray-500 px-1">今天的身体感受（可多选）</p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map(s => {
              const active = symptoms.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSymptom(s.id)}
                  className="rounded-full px-3 py-1.5 transition-all active:scale-95 inline-flex items-center gap-1"
                  style={{
                    background: active ? "#2E7D32" : "white",
                    border: active ? "1px solid #2E7D32" : "1px solid rgba(0,0,0,0.10)",
                    color: active ? "white" : "#444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span>{s.emoji}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Curated recipe list (the 9 hand-picked汤水) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] font-bold text-gray-700">
              主厨精选 · {recipes.curated.length} 道
            </p>
            {recipes.curated.length === 0 && (
              <p className="text-[11px] text-gray-400">本季没匹配，看下方菜谱库</p>
            )}
          </div>
          <div className="space-y-2">
            {recipes.curated.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
                <span className="text-[28px] flex-shrink-0">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-[14px]">{r.name_zh}</p>
                    {r.name_yue !== r.name_zh && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32' }}>
                        港: {r.name_yue}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: 'rgba(0,0,0,0.05)', color: '#666' }}>
                      {r.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{r.effect}</p>
                  <p className="text-[10px] text-gray-400 mt-1">料：{r.ingredients.join('、')}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DB-backed dishes — pulled live from the dishes table by health tag.
            These are real recipes the menu engine already knows, so users can
            re-cook them through the regular cook flow later. */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] font-bold text-gray-700">
              菜谱库匹配 · {loadingDb ? '…' : recipes.db.length} 道
            </p>
            <span className="text-[10px] text-gray-400">来自菜库的调理菜</span>
          </div>
          {loadingDb && (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-[#2E7D32] rounded-full animate-spin" />
            </div>
          )}
          {!loadingDb && recipes.db.length === 0 && (
            <div className="bg-white rounded-2xl p-4 text-[12px] text-gray-400 text-center">
              库里没有匹配这个季节+症状的调理菜，先按上面的主厨精选煲一道
            </div>
          )}
          <div className="space-y-2">
            {recipes.db.map(d => (
              <div key={d.id} className="bg-white rounded-2xl p-3 flex gap-3 shadow-sm">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ background: "rgba(0,0,0,0.05)" }}>
                  {d.image_url ? (
                    <img src={d.image_url} alt={d.title_zh}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : <div className="w-full h-full flex items-center justify-center text-[18px]">🍵</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-[14px]">{d.title_zh}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: 'rgba(0,0,0,0.05)', color: '#666' }}>
                      {d.origin_cuisine ?? '家常'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(d.health_benefit_tags ?? []).slice(0, 3).map((t: string) => (
                      <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32' }}>
                        {t === 'damp_clear' ? '祛湿' :
                         t === 'detox'      ? '清热排毒' :
                         t === 'nourish'    ? '滋补' :
                         t === 'immunity' || t === 'boost_immunity' ? '提升免疫' :
                         t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="text-[10px] text-gray-400 text-center px-4 leading-relaxed pt-3">
          注：以上为家常调理参考，不构成医疗建议。孕期、长期病患请遵医嘱。
        </p>
      </main>

      <BottomTabBar />
    </div>
  );
}
