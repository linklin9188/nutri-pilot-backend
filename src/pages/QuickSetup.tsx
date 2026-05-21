import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import { hometownToDbBucket } from "../lib/hometownBuckets";
import { syncProfileToDB } from "../lib/profileSync";

// Quick 5-question onboarding — no login required
// Saves to localStorage as "quickPrefs"

const QUESTIONS = [
  {
    // 用餐人数 first — drives dishCount + portion scaling for every
    // recommendation downstream. The phrasing is "今天几位用餐" not
    // "家里几口人" because the same number is editable inline on Home
    // every day (用户周三 vs 周日 人数可以不同). Onboarding answer
    // becomes the default; daily override lives on Home.
    id: "household",
    step: 1,
    emoji: "🍽",
    question: "今天几位用餐？",
    sub: "我按这个安排菜量，孩子算半位。之后随时能改。",
    // No options — rendered as a 2-stepper (adults / kids) in the page.
    // Kept here so progress bar + question header reuse the same metadata.
    custom: "household" as const,
    options: [] as const,
  },
  {
    id: "goal",
    step: 2,
    emoji: "🎯",
    question: "这阵子，您想怎么吃？",
    sub: "可多选，至少选 1 个（不强制选'营养均衡'）。",
    multi: true,
    options: [
      { id: "kid_growth",  label: "给孩子长高",        desc: "钙 + 蛋白 + DHA",           icon: "🌱" },
      { id: "elder_care",  label: "给老人养护",        desc: "养胃 / 三高管理",            icon: "🍵" },
      { id: "fatloss",     label: "控制体重",          desc: "低卡 + 高饱腹",             icon: "🔥" },
      { id: "pregnancy",   label: "备孕 / 孕期 / 月子", desc: "叶酸 + 铁 + 钙",           icon: "🤰" },
      { id: "muscle",      label: "健身增肌",          desc: "高蛋白 + 促恢复",            icon: "💪" },
      { id: "chronic",     label: "三高管理",          desc: "低钠 + 低糖 + 低嘌呤",       icon: "❤️‍🩹" },
      { id: "anti_inflam", label: "抗炎 / 抗衰",       desc: "Omega-3 + 多酚",            icon: "🌿" },
      { id: "comfort",     label: "单纯吃舒服点",      desc: "无特别需求，按节气换样",     icon: "🥢" },
    ],
  },
  {
    id: "spice",
    step: 2,
    emoji: "🌶️",
    question: "您能吃多辣？",
    sub: "告诉我实在的口味，我照着挑。",
    options: [
      { id: "none",   label: "完全不辣", desc: "一点辣都不行", icon: "🥛" },
      { id: "mild",   label: "微微辣",   desc: "可以接受轻微辛辣", icon: "🫑" },
      { id: "medium", label: "中辣",     desc: "日常能吃辣", icon: "🌶️" },
      { id: "hot",    label: "越辣越好", desc: "无辣不欢", icon: "🔥" },
    ],
  },
  {
    // TICKET-004 §C step A — 不喜欢但勉强能吃。强制选 ≥2 ⇒ 让 prefs 必产生差异化。
    id: "mild_dislikes",
    step: 3,
    emoji: "🥢",
    question: "哪些食材你不喜欢，但勉强能吃？",
    sub: "至少选 2 个（每个家庭都有不爱吃的食材，这一步会让推荐更懂你）。",
    multi: true,
    minSelect: 2,
    options: [
      { id: 'bitter_melon', label: '苦瓜',     icon: '🥒' },
      { id: 'eggplant',     label: '茄子',     icon: '🍆' },
      { id: 'cilantro',     label: '香菜',     icon: '🌿' },
      { id: 'innards',      label: '内脏',     icon: '🫀' },
      { id: 'green_onion',  label: '大葱',     icon: '🧅' },
      { id: 'garlic',       label: '大蒜',     icon: '🧄' },
      { id: 'sea_cucumber', label: '海参',     icon: '🥢' },
      { id: 'chives',       label: '韭菜',     icon: '🌱' },
      { id: 'wood_ear',     label: '木耳',     icon: '🍄' },
      { id: 'mutton_smell', label: '羊肉膻味', icon: '🐑' },
      { id: 'celery',       label: '香芹',     icon: '🥬' },
      { id: 'fish_smell',   label: '鱼腥味',   icon: '🐟' },
    ],
  },
  {
    // TICKET-004 §C step B — 完全不能吃（真过敏 / 宗教，可空）。去掉默认 'none'。
    id: "avoid",
    step: 3,
    emoji: "🚫",
    question: "完全不能吃（过敏 / 宗教，可空）",
    sub: "可多选 — 真过敏 / 戒口的才选。",
    multi: true,
    minSelect: 0,
    options: [
      { id: "seafood",   label: "不吃海鲜",  icon: "🦐" },
      { id: "veggie",    label: "素食",      icon: "🥦" },
      { id: "cilantro",  label: "不吃香菜",  icon: "🌿" },
      { id: "onion",     label: "不吃葱蒜",  icon: "🧄" },
      { id: "beef",      label: "忌牛羊肉",  icon: "🐄" },
      { id: "peanut",    label: "花生过敏",  icon: "🥜" },
      { id: "dairy",     label: "忌乳制品",  icon: "🥛" },
    ],
  },
  {
    id: "health",
    step: 4,
    emoji: "🩺",
    question: "身子有什么要照顾的？",
    sub: "我挑合适的食材，温温和和地养着。",
    multi: true,
    options: [
      { id: "none",          label: "没有特殊情况", icon: "✅" },
      { id: "hypertension",  label: "高血压",       icon: "❤️‍🩹" },
      { id: "diabetes",      label: "糖尿病",       icon: "🩸" },
      { id: "gout",          label: "痛风",         icon: "🦵" },
      { id: "low_blood_pressure", label: "低血压",  icon: "💙" },
      { id: "anemia",        label: "贫血/补气血",  icon: "🩷" },
    ],
  },
  {
    // TICKET-004 §D — 生活习惯 1：谁做饭。单选。
    id: "cook_role",
    step: 4,
    emoji: "🧑‍🍳",
    question: "家里主要是谁做饭？",
    sub: "我按真实做饭的人调难度。",
    options: [
      { id: 'self',   label: '我自己',      desc: '默认',                icon: '👩' },
      { id: 'helper', label: '家政工人',    desc: '走 helper 菜谱',       icon: '🧑‍🍳' },
      { id: 'family', label: '家人 / 长辈', desc: '熟练度高',             icon: '👨‍👩‍👦' },
      { id: 'shared', label: '多人轮换',    desc: '不同人做不同顿',       icon: '🔄' },
    ],
  },
  {
    // TICKET-004 §D — 生活习惯 2：做饭时间。单选。
    id: "cook_complexity",
    step: 4,
    emoji: "⏱",
    question: "每天能花多少时间做饭？",
    sub: "时间紧就推快手，余裕就慢炖。",
    options: [
      { id: 'quick',     label: '30 分钟以内', desc: '简单为主',         icon: '⏱' },
      { id: 'normal',    label: '30-60 分钟',  desc: '有时炒有时煲',     icon: '🍳' },
      { id: 'unlimited', label: '不限',        desc: '喜欢慢炖 / 煲汤',  icon: '🍲' },
    ],
  },
  {
    // Hometown cuisine — contributes 30% to scoreDish; without it the
    // hometown axis is a no-op for every dish.
    id: "hometown",
    step: 5,
    emoji: "🏠",
    question: "您最惦记哪一方水土的味道？",
    sub: "可多选 — 混合背景的家庭都能照顾到。",
    multi: true,
    options: [
      // 地域大区 — 用户决策 2026-05-17：八大菜系覆盖率不足（北方人没选项），
      // 改成 7 大区 + 港澳台 + 都行。每个大区的认知摩擦接近 0，且跟 DB
      // 4 bucket 自然 N:1 对应（见 hometownBuckets.ts）。
      { id: "south",       label: "华南",   desc: "粤 · 闽 · 桂 · 琼 — 清淡靓汤、海味为主",      icon: "🦞" },
      { id: "east",        label: "华东",   desc: "沪 · 苏 · 浙 · 皖 — 江南本帮、鲜甜浓油",      icon: "🍤" },
      { id: "north",       label: "华北",   desc: "京 · 津 · 冀 · 晋 · 蒙 — 面食为主、咸鲜厚重", icon: "🥟" },
      { id: "northeast",   label: "东北",   desc: "辽 · 吉 · 黑 — 炖菜 · 锅包肉 · 酸菜",         icon: "🍖" },
      { id: "northwest",   label: "西北",   desc: "陕 · 甘 · 宁 · 青 · 新 — 面食 · 牛羊肉 · 香料", icon: "🌾" },
      { id: "southwest",   label: "西南",   desc: "川 · 渝 · 湘 · 黔 · 滇 — 麻辣鲜香",           icon: "🌶️" },
      { id: "central",     label: "华中",   desc: "鄂 · 赣 · 豫 — 偏南方家常",                    icon: "🍲" },
      { id: "hk_macau_tw", label: "港澳台", desc: "茶餐厅 · 烧腊 · 点心",                         icon: "🍵" },
      { id: "no_preference", label: "都行 / 没偏好", desc: "什么都吃", icon: "🤷" },
    ],
  },
] as const;
// Age question was previously here; removed at user's request because
// 主要做饭对象 is ambiguous in households with mixed ages. resolveAgeModifiers
// downstream is null-safe so age_group=NULL is fine. Family-member level
// life-stage in family_members still drives per-member adjustments.

// Map QuickSetup answers → valid user_profiles columns. Values are chosen
// to match the actual tags present in dishes (health_benefit_tags +
// flavor_tags) so scoreDish can hit them.
const GOAL_TO_DIETARY_GOAL: Record<string, string> = {
  // TICKET-004 — new 8-goal scheme (replaces fatloss/muscle/balanced/nourish/pregnancy/growth/low_carb).
  // schema single-value column so head [0] only; tail goals stay in localStorage.
  kid_growth:  'muscle_gain',
  elder_care:  'maintain',
  fatloss:     'lose_weight',
  pregnancy:   'maintain',
  muscle:      'muscle_gain',
  chronic:     'maintain',
  anti_inflam: 'maintain',
  comfort:     'maintain',
};
const SPICE_TO_TASTE_PREF: Record<string, string | null> = {
  none:   'light',
  mild:   'light',
  medium: null,
  hot:    'spicy',
};

// HOMETOWN_TO_CUISINE removed — onboarding now uses 八大菜系 IDs
// (guangdong/sichuan/shandong/jiangsu/zhejiang/fujian/hunan/anhui). The old
// map only knew legacy DB IDs (cantonese/jiangnan/...) so post-八大菜系
// rollout it returned undefined for 7/9 picks and silently wrote NULL,
// killing the 30% hometown axis. Use hometownToDbBucket() instead — it
// maps the new ID to the existing DB bucket (粤→cantonese / 鲁→northern /
// 苏→jiangnan / 浙→jiangnan / 闽→cantonese / 湘→sichuan / 徽→jiangnan).
// AGE_TO_GROUP removed with the age question. resolveAgeModifiers
// gracefully no-ops when age_group is null on user_profiles.

async function persistProfileToDb(prefs: Record<string, unknown>): Promise<void> {
  // TICKET-075 §H — goal / hometown 可能是 string (legacy single-select)
  // 或 string[] (新版 multi-select)。统一拆 head + tail：head 进 schema 单值列
  // (dietary_goal / hometown_cuisine)，tail 存 localStorage 供 Algorithm 后续读。
  const goalArr = Array.isArray(prefs.goal) ? prefs.goal as string[]
                : prefs.goal ? [prefs.goal as string] : [];
  const hometownArr = Array.isArray(prefs.hometown) ? prefs.hometown as string[]
                    : prefs.hometown ? [prefs.hometown as string] : [];

  // Persist low-carb flag for the lunch / breakfast templates and hardFilter
  // to read at score time. Skip the staple slot when this is on. Multi-goal:
  // 任一目标含 low_carb 即触发。
  localStorage.setItem('nutri_low_carb', goalArr.includes('low_carb') ? '1' : '0');
  // Pregnancy override — multi-goal: 任一目标含 pregnancy 即触发。
  // familyPrefs.ts ORs this with member.lifeStage='孕期'.
  localStorage.setItem('nutri_has_pregnant_override', goalArr.includes('pregnancy') ? '1' : '0');
  // Secondary goals / hometowns — Algorithm 后续可读取做评分广度求和。
  localStorage.setItem('nutri_secondary_goals',
    JSON.stringify(goalArr.slice(1)));
  localStorage.setItem('nutri_secondary_hometowns',
    JSON.stringify(hometownArr.slice(1)));

  const userId = getUserId();
  if (!userId) return;

  const dietary_goal    = GOAL_TO_DIETARY_GOAL[goalArr[0] ?? ''] ?? null;
  const taste_pref      = SPICE_TO_TASTE_PREF[(prefs.spice as string) ?? '']   ?? null;
  const hometown_cuisine = hometownToDbBucket(hometownArr[0] ?? '');
  // Pass through avoid + health as taste/avoid hints. Only 'seafood' from
  // the avoid list maps cleanly to a flavor_tag; ingredient-level avoids
  // (cilantro/onion/beef/peanut/dairy) keep flowing through the
  // localStorage path consumed by getUserPrefs().
  const avoid_tags = ((prefs.avoid as string[]) ?? [])
    .filter(a => a !== 'none' && a !== 'veggie');

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
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [multiSel, setMultiSel] = useState<string[]>([]);
  // Household stepper state — defaults match nutri_adults / nutri_kids
  // localStorage to keep existing users' previously-set values across a
  // re-run of QuickSetup.
  const [householdAdults, setHouseholdAdults] = useState<number>(() =>
    Math.max(1, parseInt(localStorage.getItem('nutri_adults') ?? '2', 10)));
  const [householdKids, setHouseholdKids] = useState<number>(() =>
    Math.max(0, parseInt(localStorage.getItem('nutri_kids') ?? '0', 10)));

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const isHousehold = (q as any).custom === 'household';

  const commitHousehold = () => {
    localStorage.setItem('nutri_adults', String(householdAdults));
    localStorage.setItem('nutri_kids',   String(householdKids));
    const next = { ...answers, household: `${householdAdults}a${householdKids}k` };
    setAnswers(next);
    if (isLast) finish(next);
    else setStep(s => s + 1);
  };

  const handleSingle = (id: string) => {
    const next = { ...answers, [q.id]: id };
    setAnswers(next);
    setTimeout(() => {
      if (isLast) finish(next);
      else setStep(s => s + 1);
    }, 320);
  };

  // Commit a multi-select answer and advance. Extracted so both the explicit
  // "none → instant jump" path and the debounced "user paused after picking"
  // path land in the same place.
  const commitMulti = (sel: string[]) => {
    const next = { ...answers, [q.id]: sel.length ? sel : ["none"] };
    setAnswers(next);
    setMultiSel([]);
    if (isLast) finish(next);
    else setStep(s => s + 1);
  };

  const toggleMulti = (id: string) => {
    // Picking "无忌口 / 没有特殊情况 / 都行没偏好" is an end-of-question signal —
    // auto-advance immediately at the single-select cadence (320ms). TICKET-075 §H：
    // 'no_preference' (hometown 题独有) 跟 'none' 等价 — 一选就跳。
    if (id === "none" || id === "no_preference") {
      setMultiSel([id]);
      setTimeout(() => commitMulti([id]), 320);
      return;
    }
    setMultiSel(p =>
      (p.includes("none") || p.includes("no_preference")) ? [id] :
      p.includes(id) ? p.filter(x => x !== id) : [...p, id]
    );
  };

  // Debounced auto-advance for multi-select pages: 1.8s after the user's last
  // tap, commit whatever's selected. Every new tap restarts the timer so they
  // can deselect / add without losing the page. "none" path short-circuits
  // through toggleMulti above and never hits this debounce.
  // TICKET-004 §C — 若题目有 minSelect，必须 sel.length >= minSelect 才允许 auto-advance。
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!("multi" in q) || !q.multi) return;
    if (multiSel.length === 0) return;
    if (multiSel.includes("none") || multiSel.includes("no_preference")) return; // toggleMulti handles this path
    const minSel = (q as any).minSelect ?? 1;
    if (multiSel.length < minSel) return;
    debounceRef.current = setTimeout(() => commitMulti(multiSel), 1800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiSel, step]);

  const finish = (finalAnswers?: Record<string, string | string[]>) => {
    const merged = finalAnswers ?? answers;
    const prefs = {
      ...merged,
      avoid:  (merged.avoid  as string[] | undefined) ?? ["none"],
      health: (merged.health as string[] | undefined) ?? ["none"],
      setupAt: Date.now(),
    };
    localStorage.setItem("quickPrefs", JSON.stringify(prefs));
    // TICKET-075 §H — goal / hometown 可能是 string[] (multi-select)。
    // 主项 (index 0) 进 legacy single-string localStorage keys（保持下游
    // useWeeklyMenu / userPrefs.ts 读取兼容）；副项已由 persistProfileToDb
    // 存 nutri_secondary_goals / nutri_secondary_hometowns。
    const goalArr = Array.isArray(prefs.goal) ? prefs.goal as string[]
                  : prefs.goal ? [prefs.goal as string] : [];
    const hometownArr = Array.isArray(prefs.hometown) ? prefs.hometown as string[]
                      : prefs.hometown ? [prefs.hometown as string] : [];
    const primaryGoal = goalArr[0] ?? "comfort";
    const primaryHometown = hometownArr[0];

    // Map to existing taste system. comfort = 兜底 default。kid_growth / elder_care
    // / chronic / anti_inflam fall back to "default" via ??. fatloss / muscle 保持原映射。
    const goalToTaste: Record<string, string> = {
      fatloss: "veggie", muscle: "default", elder_care: "light", comfort: "default",
    };
    localStorage.setItem("userTaste", goalToTaste[primaryGoal] ?? "default");
    localStorage.setItem("userDiet", primaryGoal);
    localStorage.setItem("userSpice", prefs.spice as string);
    localStorage.setItem("userAvoid", (prefs.avoid as string[]).join(","));
    // TICKET-004 §C — 新字段 mild_dislikes（"不喜欢但勉强能吃"，强制 2+ 项）
    // 全存 localStorage 给 Algorithm 后续做差异化 scoring（不动 schema）。
    if (Array.isArray(prefs.mild_dislikes)) {
      localStorage.setItem("mild_dislikes", JSON.stringify(prefs.mild_dislikes));
    }
    // TICKET-004 §D — 生活习惯（谁做饭 / 做饭时间）— 单选 string。
    if (typeof prefs.cook_role === 'string')       localStorage.setItem("cook_role",       prefs.cook_role);
    if (typeof prefs.cook_complexity === 'string') localStorage.setItem("cook_complexity", prefs.cook_complexity);
    // userHometown drives readHometownCuisine() in userPrefs.ts which is the
    // fallback path when the DB upsert hasn't resolved yet (fire-and-forget
    // promise). Without this, anonymous QuickSetup users had a 30% dead
    // hometown axis until the upsert returned — often 1-2 weeks if they
    // never came back online.
    if (primaryHometown) localStorage.setItem("userHometown", primaryHometown);
    // Set family defaults if not already configured
    if (!localStorage.getItem("nutri_adults")) localStorage.setItem("nutri_adults", "2");
    if (!localStorage.getItem("nutri_kids"))   localStorage.setItem("nutri_kids",   "0");
    // Mark as logged in (test phase: completing setup = logged in)
    if (!localStorage.getItem("isLoggedIn")) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", crypto.randomUUID());
    }

    // Persist to user_profiles so the scoring algorithm's profile-side
    // signals (dietary_goal 40%, taste_pref 30%) actually have data. Before
    // this, only localStorage was written, leaving DB profile all NULL and
    // making 70% of the score collapse to 0.
    persistProfileToDb(prefs).catch(() => {/* non-blocking */});

    // §A (TICKET-039 Smell 2 阶段 2) — 走统一同步层让任何后续 sync←DB
    // 拉到一致结果（persistProfileToDb 是 QuickSetup 特化路径，syncProfileToDB
    // 是统一入口；两者写入同一 user_profiles 表字段一致，并存为无害冗余）。
    syncProfileToDB(getUserId()).catch(() => {/* non-blocking */});

    // Notify hooks that preferences changed
    window.dispatchEvent(new Event("nutri-prefs-changed"));
    navigate("/");
  };

  const progress = ((step) / QUESTIONS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#0a0a0a" }}>

      {/* Background gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.18) 0%, transparent 65%)",
          position: "absolute", inset: 0,
        }} />
      </div>

      {/* Progress bar */}
      <div className="relative z-10 px-6 pt-14 pb-2">
        <div className="flex items-center gap-3 mb-2">
          {QUESTIONS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.10)" }}>
              <motion.div className="h-full rounded-full"
                style={{ background: "#FF5A1F" }}
                animate={{ width: i < step ? "100%" : i === step ? "50%" : "0%" }}
                transition={{ duration: 0.4 }} />
            </div>
          ))}
        </div>
        <p className="text-white/30 text-[12px]" style={{ letterSpacing: "0.06em" }}>
          {step + 1} / {QUESTIONS.length}
        </p>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="flex-1 flex flex-col px-6 pt-6 pb-10 relative z-10">

          <div className="mb-8">
            <span className="text-[40px] leading-none">{q.emoji}</span>
            <h2 className="mt-3 font-serif font-black text-white leading-tight"
              style={{ fontSize: 28, letterSpacing: "0.01em" }}>
              {q.question}
            </h2>
            <p className="mt-2 text-white/40 font-light" style={{ fontSize: 13, letterSpacing: "0.04em" }}>
              {q.sub}
            </p>
          </div>

          {/* Options */}
          {isHousehold ? (
            <div className="flex flex-col gap-5 flex-1">
              {/* Adults stepper */}
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold" style={{ fontSize: 15 }}>大人</p>
                    <p className="text-white/45 font-light" style={{ fontSize: 12, marginTop: 2 }}>每位按 1 人计算</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setHouseholdAdults(n => Math.max(1, n - 1))}
                      className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>remove</span>
                    </button>
                    <span className="text-white font-black tabular-nums text-center" style={{ fontSize: 28, minWidth: 36 }}>
                      {householdAdults}
                    </span>
                    <button
                      onClick={() => setHouseholdAdults(n => Math.min(12, n + 1))}
                      className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                      style={{ background: '#FF5A1F' }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Kids stepper */}
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold" style={{ fontSize: 15 }}>孩子</p>
                    <p className="text-white/45 font-light" style={{ fontSize: 12, marginTop: 2 }}>按 0.5 人计算，会触发儿童菜 slot</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setHouseholdKids(n => Math.max(0, n - 1))}
                      className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>remove</span>
                    </button>
                    <span className="text-white font-black tabular-nums text-center" style={{ fontSize: 28, minWidth: 36 }}>
                      {householdKids}
                    </span>
                    <button
                      onClick={() => setHouseholdKids(n => Math.min(8, n + 1))}
                      className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                      style={{ background: '#FF5A1F' }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary chip */}
              <div className="text-center text-white/60" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                共 {householdAdults + householdKids} 人 · 等效 {(householdAdults + householdKids * 0.5).toFixed(1)} 人份
              </div>

              {/* Confirm button */}
              <button
                onClick={commitHousehold}
                className="mt-2 h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 15, boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
                下一步
                <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_forward_ios</span>
              </button>
            </div>
          ) : "multi" in q && q.multi ? (
            <>
              <div className="grid grid-cols-2 gap-3 flex-1">
                {q.options.map(opt => {
                  const sel = multiSel.includes(opt.id);
                  return (
                    <button key={opt.id} onClick={() => toggleMulti(opt.id)}
                      className="flex flex-col items-start p-4 rounded-2xl transition-all active:scale-95"
                      style={sel
                        ? { background: "rgba(255,90,31,0.20)", border: "1.5px solid #FF5A1F", boxShadow: "0 0 20px rgba(255,90,31,0.15)" }
                        : { background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.09)" }
                      }>
                      <span className="text-[24px] mb-2">{opt.icon}</span>
                      <span className="text-white font-semibold" style={{ fontSize: 14 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* No "下一步" button — multi-select auto-advances 1.8s after the
                  user's last tap (debounce in useEffect above). The hint line
                  below tells the user what's happening; the skip link is the
                  escape hatch when they want "no preference" without picking
                  the "none" chip.
                  TICKET-004 §C — 若 minSelect>0：hint 改"再选 N 项"；skip 链接隐藏
                  (强制差异化的题不能跳过)。 */}
              {(() => {
                const minSel = (q as any).minSelect ?? 1;
                const remaining = Math.max(0, minSel - multiSel.length);
                const allowSkip = minSel === 0;
                return (
                  <div className="mt-6 flex items-center justify-between" style={{ minHeight: 36 }}>
                    {multiSel.length > 0 && !multiSel.includes("none") && !multiSel.includes("no_preference") ? (
                      remaining > 0 ? (
                        <p className="text-[#FF9054]" style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                          再选 {remaining} 项继续
                        </p>
                      ) : (
                        <p className="text-white/55" style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                          已选 {multiSel.length} 项 · 稍等带您往下走
                        </p>
                      )
                    ) : <span />}
                    {allowSkip ? (
                      <button onClick={() => commitMulti([])}
                        className="text-white/35 hover:text-white/65 transition-colors"
                        style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                        这题先放一放 →
                      </button>
                    ) : <span />}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex flex-col gap-3 flex-1">
              {q.options.map(opt => (
                <button key={opt.id} onClick={() => handleSingle(opt.id)}
                  className="flex items-center gap-4 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                  style={{
                    background: answers[q.id] === opt.id
                      ? "rgba(255,90,31,0.20)" : "rgba(255,255,255,0.06)",
                    border: answers[q.id] === opt.id
                      ? "1.5px solid #FF5A1F" : "1.5px solid rgba(255,255,255,0.09)",
                  }}>
                  <span className="text-[28px] w-10 text-center">{opt.icon}</span>
                  <div>
                    <p className="text-white font-semibold" style={{ fontSize: 15 }}>{opt.label}</p>
                    {"desc" in opt && (
                      <p className="text-white/40 font-light" style={{ fontSize: 12 }}>{opt.desc}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Skip */}
          {step === 0 && (
            <button onClick={() => {
              localStorage.setItem("quickPrefs", JSON.stringify({ goal: "balanced", spice: "mild", avoid: ["none"], setupAt: Date.now() }));
              if (!localStorage.getItem("isLoggedIn")) {
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("userId", crypto.randomUUID());
              }
              navigate("/");
            }}
              className="mt-4 text-center text-white/25 hover:text-white/50 transition-colors"
              style={{ fontSize: 12, letterSpacing: "0.06em" }}>
              先随便看看
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
