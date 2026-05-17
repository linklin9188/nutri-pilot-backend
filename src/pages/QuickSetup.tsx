import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";

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
    question: "今天几位围桌？",
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
    sub: "我按这个调每天的菜。",
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
    id: "avoid",
    step: 3,
    emoji: "🚫",
    question: "有什么忌口的吗？",
    sub: "可多选，我帮您一一绕开。",
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
    // Hometown cuisine — contributes 30% to scoreDish; without it the
    // hometown axis is a no-op for every dish.
    id: "hometown",
    step: 5,
    emoji: "🏠",
    question: "您最惦记哪一方水土的味道？",
    sub: "我多做家乡口味，让饭桌有点念想。",
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
] as const;
// Age question was previously here; removed at user's request because
// 主要做饭对象 is ambiguous in households with mixed ages. resolveAgeModifiers
// downstream is null-safe so age_group=NULL is fine. Family-member level
// life-stage in family_members still drives per-member adjustments.

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
// AGE_TO_GROUP removed with the age question. resolveAgeModifiers
// gracefully no-ops when age_group is null on user_profiles.

async function persistProfileToDb(prefs: Record<string, unknown>): Promise<void> {
  // Persist low-carb flag for the lunch / breakfast templates and hardFilter
  // to read at score time. Skip the staple slot when this is on.
  localStorage.setItem('nutri_low_carb', (prefs.goal as string) === 'low_carb' ? '1' : '0');
  // Pregnancy override — QuickSetup goal='pregnancy' is the test-phase entry
  // for hasPregnant. familyPrefs.ts ORs this with member.lifeStage='孕期'.
  localStorage.setItem('nutri_has_pregnant_override', (prefs.goal as string) === 'pregnancy' ? '1' : '0');
  const userId = getUserId();
  if (!userId) return;

  const dietary_goal    = GOAL_TO_DIETARY_GOAL[(prefs.goal as string) ?? '']   ?? null;
  const taste_pref      = SPICE_TO_TASTE_PREF[(prefs.spice as string) ?? '']   ?? null;
  const hometown_cuisine = HOMETOWN_TO_CUISINE[(prefs.hometown as string) ?? ''] ?? null;
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
    // Picking "无忌口 / 没有特殊情况" is an end-of-question signal — auto-advance
    // immediately at the single-select cadence (320ms). User asked: 选完直接
    // 跳下一页，不需要点下一步.
    if (id === "none") {
      setMultiSel(["none"]);
      setTimeout(() => commitMulti(["none"]), 320);
      return;
    }
    setMultiSel(p =>
      p.includes("none") ? [id] :
      p.includes(id) ? p.filter(x => x !== id) : [...p, id]
    );
  };

  // Debounced auto-advance for multi-select pages: 1.8s after the user's last
  // tap, commit whatever's selected. Every new tap restarts the timer so they
  // can deselect / add without losing the page. "none" path short-circuits
  // through toggleMulti above and never hits this debounce.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!("multi" in q) || !q.multi) return;
    if (multiSel.length === 0) return;
    if (multiSel.includes("none")) return; // toggleMulti handles this path
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
                  the "none" chip. */}
              <div className="mt-6 flex items-center justify-between" style={{ minHeight: 36 }}>
                {multiSel.length > 0 && !multiSel.includes("none") ? (
                  <p className="text-white/55" style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                    已选 {multiSel.length} 项 · 稍等带您往下走
                  </p>
                ) : <span />}
                <button onClick={() => commitMulti(["none"])}
                  className="text-white/35 hover:text-white/65 transition-colors"
                  style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                  这题先放一放 →
                </button>
              </div>
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
