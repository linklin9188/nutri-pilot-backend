import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";

// Quick 4-question onboarding — no login required
// Saves to localStorage as "quickPrefs"

const QUESTIONS = [
  {
    id: "goal",
    step: 1,
    emoji: "🎯",
    question: "你现在最想要的是？",
    sub: "我们会根据这个定制你的每日菜单",
    options: [
      { id: "fatloss",   label: "减脂瘦身",   desc: "低卡、高饱腹感",         icon: "🔥" },
      { id: "muscle",    label: "增肌健体",   desc: "高蛋白、促恢复",         icon: "💪" },
      { id: "balanced",  label: "营养均衡",   desc: "荤素搭配、全面补充",     icon: "🥗" },
      { id: "nourish",   label: "养生调理",   desc: "温和滋补、顾脾胃",       icon: "🍵" },
      { id: "pregnancy", label: "怀孕备孕",   desc: "叶酸 · 铁 · 钙，避刺激",  icon: "🤰" },
      { id: "growth",    label: "长高变壮",   desc: "钙 · 蛋白 · DHA，骨骼发育", icon: "🌱" },
      { id: "low_carb",  label: "低碳生酮",   desc: "去主食 · 重蛋白 · 控糖",   icon: "🥑" },
    ],
  },
  {
    id: "spice",
    step: 2,
    emoji: "🌶️",
    question: "你能接受多辣？",
    sub: "诚实回答，AI 会严格按你的口味推荐",
    options: [
      { id: "none",   label: "完全不辣", desc: "一点辣都不行", icon: "🥛" },
      { id: "mild",   label: "微微辣",   desc: "可以接受轻微辛辣", icon: "🫑" },
      { id: "medium", label: "中辣",     desc: "日常能吃辣", icon: "🌶️" },
      { id: "hot",    label: "越辣越好", desc: "无辣不欢", icon: "🔥" },
    ],
  },
  {
    id: "avoid",
    step: 3,
    emoji: "🚫",
    question: "有什么忌口吗？",
    sub: "可多选，AI 会自动过滤这些食材",
    multi: true,
    options: [
      { id: "none",      label: "没有忌口",  icon: "✅" },
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
    question: "有需要注意的健康状况吗？",
    sub: "AI 会自动优化菜品选择，过滤不适合的食材",
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
    // Hometown cuisine — contributes 30% to scoreDish; without it the
    // hometown axis is a no-op for every dish.
    id: "hometown",
    step: 5,
    emoji: "🏠",
    question: "你最熟悉/最爱吃哪种菜系？",
    sub: "AI 会优先推荐你家乡口味的菜",
    options: [
      { id: "cantonese",        label: "粤菜 · 港式",  desc: "广式、港式、靓汤", icon: "🦞" },
      { id: "northern",         label: "北方菜",       desc: "鲁/京/东北/西北",  icon: "🥟" },
      { id: "jiangnan",         label: "江南菜",       desc: "苏沪杭、本帮、淮扬", icon: "🍤" },
      { id: "sichuan",          label: "川菜",         desc: "麻辣、香辣、家常",   icon: "🌶️" },
      { id: "japanese_korean",  label: "日韩料理",     desc: "和食、韩餐",         icon: "🍣" },
      { id: "southeast_asian",  label: "东南亚",       desc: "泰越、马新印",       icon: "🍛" },
      { id: "western",          label: "西餐",         desc: "意法、美式",         icon: "🍝" },
      { id: "no_preference",    label: "都行 / 没偏好", desc: "什么都吃", icon: "🤷" },
    ],
  },
  {
    // Age group — drives resolveAgeModifiers (boost/penalty by life stage).
    // Maps to user_profiles.age_group.
    id: "age",
    step: 6,
    emoji: "🎂",
    question: "主要做饭对象的年龄段？",
    sub: "孩子要清淡、老人要养生，AI 会按这个微调",
    options: [
      { id: "child",   label: "儿童 (0–12)",   desc: "口味温和、易咀嚼",     icon: "🧒" },
      { id: "teen",    label: "青少年 (13–18)", desc: "高蛋白、长身体",       icon: "🧑‍🎓" },
      { id: "youth",   label: "青年 (19–35)",  desc: "多元营养、看口味",     icon: "🧑" },
      { id: "middle",  label: "中年 (36–55)",  desc: "控油控盐、护心血管",   icon: "👨‍💼" },
      { id: "senior",  label: "老年 (56+)",    desc: "易消化、低嘌呤",       icon: "👴" },
    ],
  },
] as const;

// Map QuickSetup answers → valid user_profiles columns. Values are chosen
// to match the actual tags present in dishes (health_benefit_tags +
// flavor_tags) so scoreDish can hit them.
const GOAL_TO_DIETARY_GOAL: Record<string, string> = {
  fatloss:   'lose_weight',
  muscle:    'muscle_gain',
  balanced:  'maintain',
  nourish:   'detox',
  // 'pregnancy' / 'growth' didn't map before, so selecting either wrote
  // dietary_goal=null and the 40% goal score collapsed to 0. Map to the
  // closest existing health_benefit_tag so scoring isn't blind. Pregnancy
  // safety details (raw-seafood ban, high-mercury fish penalty, iron+folate
  // boost) are handled separately in applyPregnancyAdjustments via the
  // household member's hasPregnant flag.
  pregnancy: 'maintain',
  growth:    'muscle_gain',
  low_carb:  'lose_weight',
};
const SPICE_TO_TASTE_PREF: Record<string, string | null> = {
  none:   'light',
  mild:   'light',
  medium: null,
  hot:    'spicy',
};

// hometown id → user_profiles.hometown_cuisine value matches dish.origin_cuisine.
const HOMETOWN_TO_CUISINE: Record<string, string | null> = {
  cantonese:       'cantonese',
  northern:        'northern',
  jiangnan:        'jiangnan',
  sichuan:         'sichuan',
  japanese_korean: 'japanese_korean',
  southeast_asian: 'southeast_asian',
  western:         'western',
  no_preference:   null,
};
// age id → user_profiles.age_group. resolveAgeModifiers reads this.
const AGE_TO_GROUP: Record<string, string | null> = {
  child:  'child',
  teen:   'teen',
  youth:  'youth',
  middle: 'middle',
  senior: 'senior',
};

async function persistProfileToDb(prefs: Record<string, unknown>): Promise<void> {
  // Persist low-carb flag for the lunch / breakfast templates and hardFilter
  // to read at score time. Skip the staple slot when this is on.
  localStorage.setItem('nutri_low_carb', (prefs.goal as string) === 'low_carb' ? '1' : '0');
  const userId = getUserId();
  if (!userId) return;

  const dietary_goal    = GOAL_TO_DIETARY_GOAL[(prefs.goal as string) ?? '']   ?? null;
  const taste_pref      = SPICE_TO_TASTE_PREF[(prefs.spice as string) ?? '']   ?? null;
  const hometown_cuisine = HOMETOWN_TO_CUISINE[(prefs.hometown as string) ?? ''] ?? null;
  const age_group       = AGE_TO_GROUP[(prefs.age as string) ?? '']            ?? null;
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
      age_group,
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

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  const handleSingle = (id: string) => {
    const next = { ...answers, [q.id]: id };
    setAnswers(next);
    setTimeout(() => {
      if (isLast) finish(next);
      else setStep(s => s + 1);
    }, 320);
  };

  const toggleMulti = (id: string) => {
    if (id === "none") { setMultiSel(["none"]); return; }
    setMultiSel(p =>
      p.includes("none") ? [id] :
      p.includes(id) ? p.filter(x => x !== id) : [...p, id]
    );
  };

  // Advance from a multi-select step: save current selection into answers, reset for next
  const advanceMulti = () => {
    const sel = multiSel.length ? multiSel : ["none"];
    const next = { ...answers, [q.id]: sel };
    setAnswers(next);
    setMultiSel([]);
    if (isLast) {
      finish(next);
    } else {
      setStep(s => s + 1);
    }
  };

  const finish = (finalAnswers?: Record<string, string | string[]>) => {
    const merged = finalAnswers ?? answers;
    const prefs = {
      ...merged,
      avoid:  (merged.avoid  as string[] | undefined) ?? ["none"],
      health: (merged.health as string[] | undefined) ?? ["none"],
      setupAt: Date.now(),
    };
    localStorage.setItem("quickPrefs", JSON.stringify(prefs));
    // Map to existing taste system
    const goalToTaste: Record<string, string> = {
      fatloss: "veggie", muscle: "default", balanced: "default", nourish: "light",
    };
    localStorage.setItem("userTaste", goalToTaste[prefs.goal as string] ?? "default");
    localStorage.setItem("userDiet", prefs.goal as string);
    localStorage.setItem("userSpice", prefs.spice as string);
    localStorage.setItem("userAvoid", (prefs.avoid as string[]).join(","));
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
          {"multi" in q && q.multi ? (
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
              <button onClick={advanceMulti}
                disabled={multiSel.length === 0}
                className="mt-6 w-full h-[52px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                  boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                  fontSize: 15, color: "white",
                }}>
                {isLast ? "生成我的专属菜单 →" : "下一步 →"}
              </button>
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
              跳过，先看看菜单
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
