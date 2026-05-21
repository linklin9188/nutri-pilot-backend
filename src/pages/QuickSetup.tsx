import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import { syncProfileToDB } from "../lib/profileSync";
import ImageGrid, { ImageGridOption } from "../components/ImageGrid";

// TICKET-005 v3 — 图片驱动 onboarding（11 题，条件渲染实际 8-9 步）。
// 文案铁律：所有标题都是问句 + "怎么吃 / 喜欢" 视角，绕过用户自我描述偏差。
// 收集 9 个 axis（Algorithm 073 axis 32-40），不动 schema，全 localStorage。

type Condition = 'has_red_or_white' | 'has_beef' | 'has_chicken' | 'has_seafood_class';

interface QuestionV3 {
  id: string;
  emoji: string;
  question: string;
  sub: string;
  multi: boolean;
  minSelect?: number;
  cols?: 2 | 3;
  chips?: boolean;
  condition?: Condition;
  options: ImageGridOption[];
}

const QUESTIONS_V3: QuestionV3[] = [
  // Q0 — 餐桌画面，一图三用：人数 + 中西餐 + 复杂度
  {
    id: 'table_style',
    emoji: '🍽',
    question: '你家餐桌更像哪个？',
    sub: '一眼挑出最像你家用餐的画面 — 我顺手算出人数、风格、复杂度。',
    multi: false,
    cols: 2,
    options: [
      { value: 'cozy_2',    label: '2 椅小桌',       desc: '1 主菜 1 汤 简单家常',   emoji: '🍽️' },
      { value: 'family_4',  label: '4 椅标准',       desc: '3 菜 1 汤 正经家常',     emoji: '🍱' },
      { value: 'big_round', label: '大圆桌',         desc: '8-10 椅 6 菜 2 汤 粤式', emoji: '🥘' },
      { value: 'western',   label: '西式长桌',       desc: '刀叉 沙拉 牛排 意面',    emoji: '🍴' },
      { value: 'hk_diner',  label: '港式茶餐厅',     desc: '菠萝包 奶茶 多士',       emoji: '🥯' },
      { value: 'solo',      label: '1 人小桌',       desc: '便当盒 简餐',            emoji: '🍙' },
    ],
  },

  // Q1 — 蛋白大类（多选 ≥1）
  {
    id: 'protein_main_class',
    emoji: '🥩',
    question: '平时你家更喜欢吃哪些类？',
    sub: '可多选，至少 1 个。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'red_meat',   label: '红肉拼盘', desc: '牛 · 羊 · 猪',     emoji: '🥩' },
      { value: 'white_meat', label: '白肉拼盘', desc: '鸡 · 鸭',          emoji: '🍗' },
      { value: 'seafood',    label: '海鲜拼盘', desc: '虾蟹 · 鱼 · 贝',   emoji: '🦐' },
      { value: 'veggie',     label: '素食拼盘', desc: '豆腐 · 蔬菜',      emoji: '🥦' },
    ],
  },

  // Q2 — 主食偏好（多选 ≥1）
  {
    id: 'staple_pref',
    emoji: '🍚',
    question: '你更喜欢吃哪种主食？',
    sub: '可多选。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'rice',   label: '米饭',     emoji: '🍚' },
      { value: 'noodle', label: '面条馒头', emoji: '🍜' },
      { value: 'congee', label: '粥',       emoji: '🥣' },
      { value: 'grain',  label: '杂粮',     desc: '红薯 · 玉米 · 燕麦', emoji: '🌽' },
    ],
  },

  // Q3 — 肉类（仅 Q1 含红/白显示）
  {
    id: 'protein_pref',
    emoji: '🐮',
    question: '平时你更喜欢吃哪些肉？',
    sub: '可多选，至少 1 个。',
    multi: true,
    minSelect: 1,
    condition: 'has_red_or_white',
    cols: 3,
    options: [
      { value: 'pork',    label: '猪', emoji: '🐷' },
      { value: 'chicken', label: '鸡', emoji: '🐔' },
      { value: 'duck',    label: '鸭', emoji: '🦆' },
      { value: 'lamb',    label: '羊', emoji: '🐑' },
      { value: 'beef',    label: '牛', emoji: '🐮' },
    ],
  },

  // Q4 — 牛肉做法（仅 Q3 含牛显示）
  {
    id: 'beef_style',
    emoji: '🥩',
    question: '牛肉你更喜欢怎么吃？',
    sub: '可多选 — 不同做法对应不同菜系。',
    multi: true,
    condition: 'has_beef',
    cols: 2,
    options: [
      { value: 'spicy_stirfry', label: '小炒黄牛肉', desc: '湘 · 川辣',     emoji: '🌶️' },
      { value: 'steak',         label: '煎牛排',     desc: '西 · 北',       emoji: '🥩' },
      { value: 'stewed',        label: '炖牛腩',     desc: '粤 · 港清',     emoji: '🍲' },
      { value: 'braised',       label: '红烧牛肉',   desc: '江浙 · 北家常', emoji: '🥘' },
    ],
  },

  // Q5 — 鸡肉做法（仅 Q3 含鸡显示）
  {
    id: 'chicken_style',
    emoji: '🍗',
    question: '鸡肉你更喜欢怎么吃？',
    sub: '可多选。',
    multi: true,
    condition: 'has_chicken',
    cols: 2,
    options: [
      { value: 'poached',     label: '白切鸡', desc: '粤式',     emoji: '🍗' },
      { value: 'spicy_diced', label: '辣子鸡', desc: '川式',     emoji: '🌶️' },
      { value: 'three_cup',   label: '三杯鸡', desc: '台式',     emoji: '🍶' },
      { value: 'yellow_braised', label: '黄焖鸡', desc: '北 · 江浙', emoji: '🍛' },
    ],
  },

  // Q6 — 海鲜做法（仅 Q1 含海鲜显示）
  {
    id: 'seafood_style',
    emoji: '🦐',
    question: '海鲜你更喜欢怎么做？',
    sub: '可多选。',
    multi: true,
    condition: 'has_seafood_class',
    cols: 2,
    options: [
      { value: 'steamed',  label: '清蒸', emoji: '♨️' },
      { value: 'braised',  label: '红烧', emoji: '🥘' },
      { value: 'salted',   label: '椒盐', emoji: '🧂' },
      { value: 'blanched', label: '白灼', emoji: '💧' },
    ],
  },

  // Q7 — 蔬菜做法（多选 ≥1）
  {
    id: 'veggie_method',
    emoji: '🥬',
    question: '蔬菜你更喜欢怎么做？',
    sub: '可多选。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'stirfry',   label: '清炒', emoji: '🥬' },
      { value: 'dry_fried', label: '干煸', emoji: '🔥' },
      { value: 'cold',      label: '凉拌', emoji: '🥗' },
      { value: 'soup',      label: '煲汤', emoji: '🍲' },
    ],
  },

  // Q8 — 浓淡（单选）
  {
    id: 'oil_level',
    emoji: '🥄',
    question: '你更喜欢清淡还是浓郁？',
    sub: '我按这个调味重轻。',
    multi: false,
    cols: 2,
    options: [
      { value: 'rich',   label: '浓郁',   desc: '重油红烧肉',  emoji: '🥘' },
      { value: 'medium', label: '中等',   desc: '日常家常',    emoji: '🍱' },
      { value: 'light',  label: '极清',   desc: '白灼 · 清蒸', emoji: '💧' },
    ],
  },

  // Q9 — 早餐风格（独立 axis，单选）
  {
    id: 'breakfast_cuisine',
    emoji: '🥯',
    question: '早餐你更喜欢吃什么？',
    sub: '早餐口味跟午晚常常不一样 — HK 妈妈早西午晚中很常见。',
    multi: false,
    cols: 2,
    options: [
      { value: 'chinese', label: '中式', desc: '包子 · 粥 · 油条 · 豆浆', emoji: '🥟' },
      { value: 'western', label: '西式', desc: '三明治 · 牛奶 · 麦片',    emoji: '🥪' },
      { value: 'hk',      label: '港式', desc: '菠萝包 · 奶茶 · 多士',    emoji: '🥯' },
      { value: 'simple',  label: '简单', desc: '鸡蛋 · 燕麦',             emoji: '🥚' },
    ],
  },

  // Q10 — 完全不能吃（chips 多选可空）
  {
    id: 'avoid',
    emoji: '🚫',
    question: '有什么是完全不能吃的吗？',
    sub: '可空 — 真过敏 / 戒口的才选。',
    multi: true,
    minSelect: 0,
    chips: true,
    cols: 2,
    options: [
      { value: 'seafood',   label: '海鲜过敏',   emoji: '🦐' },
      { value: 'pork',      label: '宗教不吃猪', emoji: '🐖' },
      { value: 'beef_lamb', label: '不吃牛羊',   emoji: '🐄' },
      { value: 'all_meat',  label: '全素',       emoji: '🥦' },
      { value: 'peanut',    label: '花生',       emoji: '🥜' },
      { value: 'dairy',     label: '乳制品',     emoji: '🥛' },
      { value: 'cilantro',  label: '香菜',       emoji: '🌿' },
      { value: 'innards',   label: '内脏',       emoji: '🫀' },
    ],
  },
];

// Q0 餐桌画面 → 人数 / 菜系 / 复杂度 三个维度的解析表。
// hometown_cuisine 只在能精准映射时给值（big_round/hk_diner 显然粤系），其余
// 留 null 让 Algorithm 通过其他 axis（protein_main_class / oil_level / breakfast_cuisine）
// 推断风格。
const TABLE_STYLE_MAP: Record<string, { adults: number; kids: number; elders: number; cuisine: string | null; complexity: string }> = {
  cozy_2:    { adults: 2, kids: 0, elders: 0, cuisine: null,        complexity: 'simple'   },
  family_4:  { adults: 3, kids: 1, elders: 0, cuisine: null,        complexity: 'standard' },
  big_round: { adults: 4, kids: 1, elders: 2, cuisine: 'cantonese', complexity: 'rich'     },
  western:   { adults: 2, kids: 0, elders: 0, cuisine: null,        complexity: 'standard' },
  hk_diner:  { adults: 2, kids: 0, elders: 0, cuisine: 'cantonese', complexity: 'simple'   },
  solo:      { adults: 1, kids: 0, elders: 0, cuisine: null,        complexity: 'simple'   },
};

// dietary_goal fallback — v3 没有显式 goal 题，统一 'maintain'。Algorithm
// 通过 9 个新 axis 推断个性化，不再依赖 goal 单值列做核心区分。
function deriveDietaryGoal(_answers: Record<string, any>): string | null {
  return 'maintain';
}

// taste_pref fallback — 从 oil_level 推。light→light, rich→null (default), medium→null。
function deriveTastePref(answers: Record<string, any>): string | null {
  if (answers.oil_level === 'light') return 'light';
  return null;
}

function shouldShow(q: QuestionV3, answers: Record<string, any>): boolean {
  if (!q.condition) return true;
  const pmc = (answers.protein_main_class ?? []) as string[];
  const pp  = (answers.protein_pref ?? []) as string[];
  if (q.condition === 'has_red_or_white')  return pmc.includes('red_meat') || pmc.includes('white_meat');
  if (q.condition === 'has_beef')          return pp.includes('beef');
  if (q.condition === 'has_chicken')       return pp.includes('chicken');
  if (q.condition === 'has_seafood_class') return pmc.includes('seafood');
  return true;
}

async function persistProfileToDb(answers: Record<string, any>): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  const dietary_goal     = deriveDietaryGoal(answers);
  const taste_pref       = deriveTastePref(answers);
  const tableStyle       = answers.table_style as string | undefined;
  const hometown_cuisine = (tableStyle && TABLE_STYLE_MAP[tableStyle]?.cuisine) ?? null;
  // avoid_tags — schema 期望 flavor_tag 兼容值，过滤掉 v3 新 id（pork/beef_lamb/all_meat）
  // 这些通过 localStorage avoid 走 ingredient-level 过滤路径。
  const avoidArr = (answers.avoid ?? []) as string[];
  const avoid_tags = avoidArr.filter(a => a === 'seafood' || a === 'peanut' || a === 'dairy' || a === 'cilantro' || a === 'innards');
  await supabase.from('user_profiles').upsert(
    {
      id:               userId,
      dietary_goal,
      taste_pref,
      hometown_cuisine,
      avoid_tags,
      updated_at:       new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
}

export default function QuickSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [multiSel, setMultiSel] = useState<string[]>([]);

  // visibleIndices 根据当前 answers 动态计算 — 比如 Q1 没选海鲜，Q6 不会出现。
  // step 索引是 QUESTIONS_V3 绝对 index，但 progress / navigation 用 visible 序。
  const visibleIndices = QUESTIONS_V3
    .map((_, i) => (shouldShow(QUESTIONS_V3[i], answers) ? i : -1))
    .filter(i => i !== -1);
  const totalVisible = visibleIndices.length;
  const currentVisiblePos = Math.max(0, visibleIndices.indexOf(step));

  const q = QUESTIONS_V3[step];

  const goToNext = (latestAnswers: Record<string, any>) => {
    // Recompute visible list with latest answers — Q1/Q3 多选可能新增或删除
    // 后续条件题。
    const fresh = QUESTIONS_V3
      .map((_, i) => (shouldShow(QUESTIONS_V3[i], latestAnswers) ? i : -1))
      .filter(i => i !== -1);
    const pos = fresh.indexOf(step);
    if (pos < 0 || pos === fresh.length - 1) {
      finish(latestAnswers);
      return;
    }
    setStep(fresh[pos + 1]);
    setMultiSel([]);
  };

  const handleSingle = (id: string) => {
    const next = { ...answers, [q.id]: id };
    setAnswers(next);
    setTimeout(() => goToNext(next), 320);
  };

  const commitMulti = (sel: string[]) => {
    const next = { ...answers, [q.id]: sel };
    setAnswers(next);
    setMultiSel([]);
    goToNext(next);
  };

  const toggleMulti = (id: string) => {
    setMultiSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Debounced auto-advance (1.8s after last tap) for multi-select.
  // minSelect>0 时必须达到才允许 debounce（minSelect:0 的 Q10 也走 debounce
  // 但首选时间窗会被 commit timer 走 — 如果用户什么都不选，下方"完成 →" 链接
  // 是出口）。
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.multi) return;
    if (multiSel.length === 0) return;
    const minSel = q.minSelect ?? 1;
    if (multiSel.length < minSel) return;
    debounceRef.current = setTimeout(() => commitMulti(multiSel), 1800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiSel, step]);

  const finish = (finalAnswers: Record<string, any>) => {
    const prefs = { ...finalAnswers, setupAt: Date.now() };

    // Legacy quickPrefs — downstream useWeeklyMenu / userPrefs.ts 仍读这个 key。
    localStorage.setItem('quickPrefs', JSON.stringify(prefs));

    // ── v3 9 个 axis localStorage（Algorithm 073 axis 32-40） ──────────
    const v3Axes: Array<[string, any]> = [
      ['table_style',         finalAnswers.table_style],
      ['protein_main_class',  finalAnswers.protein_main_class],
      ['staple_pref',         finalAnswers.staple_pref],
      ['protein_pref',        finalAnswers.protein_pref],
      ['beef_style',          finalAnswers.beef_style],
      ['chicken_style',       finalAnswers.chicken_style],
      ['seafood_style',       finalAnswers.seafood_style],
      ['veggie_method',       finalAnswers.veggie_method],
      ['oil_level',           finalAnswers.oil_level],
      ['breakfast_cuisine',   finalAnswers.breakfast_cuisine],
    ];
    v3Axes.forEach(([k, v]) => {
      if (v === undefined) return;
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });

    // ── Q0 table_style → 派生 household composition ──────────────────
    const tableStyle = (finalAnswers.table_style as string) ?? 'family_4';
    const tsMap = TABLE_STYLE_MAP[tableStyle] ?? TABLE_STYLE_MAP.family_4;
    localStorage.setItem('nutri_adults', String(tsMap.adults));
    localStorage.setItem('nutri_kids',   String(tsMap.kids));
    const familyComp = {
      adults: tsMap.adults,
      elders: { count: tsMap.elders, conditions: [] as string[] },
      kids:   Array.from({ length: tsMap.kids }, () => ({ age: '7-12' })),
    };
    localStorage.setItem('family_composition', JSON.stringify(familyComp));

    // ── Legacy compat keys（下游 readers expect these） ──────────────
    const oilLevel  = finalAnswers.oil_level as string | undefined;
    const tastePref = deriveTastePref(finalAnswers);
    localStorage.setItem('userTaste', tastePref === 'light' ? 'light' : 'default');
    localStorage.setItem('userDiet',  'comfort');  // v3 没显式 goal 题
    localStorage.setItem('userSpice', oilLevel === 'rich' ? 'medium' : 'mild');
    const avoidArr = (finalAnswers.avoid ?? []) as string[];
    localStorage.setItem('userAvoid', avoidArr.length ? avoidArr.join(',') : 'none');

    // 匿名 userId
    if (!localStorage.getItem('isLoggedIn')) {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userId', crypto.randomUUID());
    }
    if (!localStorage.getItem('nutri_user_id')) {
      const uid = localStorage.getItem('userId');
      if (uid) localStorage.setItem('nutri_user_id', uid);
    }

    // upsert user_profiles + 全局同步（fire-and-forget）
    persistProfileToDb(finalAnswers).catch(() => {/* offline-tolerant */});
    syncProfileToDB(getUserId()).catch(() => {/* offline-tolerant */});

    // mark v3 done + 清所有升级标记（v3 是 v2 的超集，v3 done 隐含 v2 done）
    localStorage.setItem('onboarding_v3_done', 'true');
    localStorage.setItem('onboarding_v2_done', 'true');
    localStorage.removeItem('needs_v3_onboarding');
    localStorage.removeItem('needs_v2_onboarding');

    window.dispatchEvent(new Event('nutri-prefs-changed'));
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: '#0a0a0a' }}>

      {/* Background gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.18) 0%, transparent 65%)',
          position: 'absolute', inset: 0,
        }} />
      </div>

      {/* TICKET-005 §E — v3 upgrade banner（needs_v3_onboarding 标记由 App.tsx
          RootRedirect 在检测到旧 quickPrefs 且没 onboarding_v3_done 时写入；
          QuickSetup.finish() 完工后清除）。 */}
      {localStorage.getItem('needs_v3_onboarding') === 'true' && (
        <div className="relative z-10 px-6 pt-14 pb-2">
          <div className="rounded-r p-4"
            style={{ background: 'rgba(255,90,31,0.10)', borderLeft: '4px solid #FF9054' }}>
            <p className="font-bold text-[#FF9054]" style={{ fontSize: 14 }}>🎨 升级了！我们用图片代替文字</p>
            <p className="mt-1 text-white/65 font-light" style={{ fontSize: 12, lineHeight: 1.5 }}>
              请用 3 分钟看图选你喜欢的 — 比读字快 10 倍，让推荐更懂你。
            </p>
          </div>
        </div>
      )}

      {/* Progress bar — 基于 visible step 数（不是 QUESTIONS_V3 总长） */}
      <div className="relative z-10 px-6 pt-14 pb-2">
        <div className="flex items-center gap-2 mb-2">
          {visibleIndices.map((vi, i) => (
            <div key={vi} className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: '#FF5A1F' }}
                animate={{ width: i < currentVisiblePos ? '100%' : i === currentVisiblePos ? '50%' : '0%' }}
                transition={{ duration: 0.4 }} />
            </div>
          ))}
        </div>
        <p className="text-white/30 text-[12px]" style={{ letterSpacing: '0.06em' }}>
          {currentVisiblePos + 1} / {totalVisible}
        </p>
      </div>

      {/* Question body */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex-1 flex flex-col px-6 pt-6 pb-10 relative z-10">

          <div className="mb-6">
            <span className="text-[40px] leading-none">{q.emoji}</span>
            <h2 className="mt-3 font-serif font-black text-white leading-tight"
              style={{ fontSize: 26, letterSpacing: '0.01em' }}>
              {q.question}
            </h2>
            <p className="mt-2 text-white/40 font-light" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
              {q.sub}
            </p>
          </div>

          {q.chips ? (
            // Q10 — chips 风格（avoid 更紧凑）
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {q.options.map(opt => {
                  const sel = multiSel.includes(opt.value);
                  return (
                    <button key={opt.value} onClick={() => toggleMulti(opt.value)}
                      className="px-4 py-2.5 rounded-full active:scale-95 transition-transform flex items-center gap-2"
                      style={sel
                        ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F', fontSize: 13, color: '#fff' }
                        : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)', fontSize: 13, color: 'rgba(255,255,255,0.75)' }
                      }>
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : q.multi ? (
            <ImageGrid options={q.options} multi selected={multiSel} onToggle={toggleMulti} cols={q.cols} />
          ) : (
            <ImageGrid options={q.options} multi={false}
              selected={answers[q.id] ? [answers[q.id]] : []}
              onToggle={handleSingle} cols={q.cols} />
          )}

          {/* multi-select hint + skip 链接 */}
          {q.multi && (() => {
            const minSel = q.minSelect ?? 1;
            const remaining = Math.max(0, minSel - multiSel.length);
            const allowSkip = minSel === 0;
            return (
              <div className="mt-6 flex items-center justify-between" style={{ minHeight: 36 }}>
                {multiSel.length > 0 ? (
                  remaining > 0 ? (
                    <p className="text-[#FF9054]" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
                      再选 {remaining} 项继续
                    </p>
                  ) : (
                    <p className="text-white/55" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
                      已选 {multiSel.length} 项 · 稍等带您往下走
                    </p>
                  )
                ) : <span />}
                {allowSkip ? (
                  <button onClick={() => commitMulti(multiSel)}
                    className="text-white/45 hover:text-white/75 transition-colors"
                    style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                    {multiSel.length > 0 ? '完成' : '这题先放一放'} →
                  </button>
                ) : <span />}
              </div>
            );
          })()}

          {/* Skip 整个 onboarding（只在 Q0 出现） */}
          {currentVisiblePos === 0 && (
            <button onClick={() => {
              const skipPrefs = { table_style: 'family_4', oil_level: 'medium', breakfast_cuisine: 'chinese', setupAt: Date.now() };
              localStorage.setItem('quickPrefs', JSON.stringify(skipPrefs));
              localStorage.setItem('onboarding_v3_done', 'true');
              localStorage.setItem('onboarding_v2_done', 'true');
              localStorage.removeItem('needs_v3_onboarding');
              localStorage.removeItem('needs_v2_onboarding');
              localStorage.setItem('table_style', 'family_4');
              localStorage.setItem('oil_level', 'medium');
              localStorage.setItem('breakfast_cuisine', 'chinese');
              localStorage.setItem('nutri_adults', '3');
              localStorage.setItem('nutri_kids', '1');
              localStorage.setItem('family_composition', JSON.stringify({ adults: 3, elders: { count: 0, conditions: [] }, kids: [{ age: '7-12' }] }));
              if (!localStorage.getItem('isLoggedIn')) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userId', crypto.randomUUID());
              }
              navigate('/');
            }}
              className="mt-4 text-center text-white/25 hover:text-white/50 transition-colors"
              style={{ fontSize: 12, letterSpacing: '0.06em' }}>
              先随便看看
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
