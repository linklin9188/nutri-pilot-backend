import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";

// Quick 3-question onboarding — no login required
// Saves to localStorage as "quickPrefs"

const QUESTIONS = [
  {
    id: "goal",
    step: 1,
    emoji: "🎯",
    question: "你现在最想要的是？",
    sub: "我们会根据这个定制你的每日菜单",
    options: [
      { id: "fatloss",  label: "减脂瘦身", desc: "低卡、高饱腹感", icon: "🔥" },
      { id: "muscle",   label: "增肌健体", desc: "高蛋白、促恢复", icon: "💪" },
      { id: "balanced", label: "营养均衡", desc: "荤素搭配、全面补充", icon: "🥗" },
      { id: "nourish",  label: "养生调理", desc: "温和滋补、顾脾胃", icon: "🍵" },
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
] as const;

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

  const finish = (finalAnswers?: Record<string, string | string[]>) => {
    const prefs = {
      ...(finalAnswers ?? answers),
      avoid: multiSel.length ? multiSel : ["none"],
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
              <button onClick={() => finish()}
                disabled={multiSel.length === 0}
                className="mt-6 w-full h-[52px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                  boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                  fontSize: 15, color: "white",
                }}>
                生成我的专属菜单 →
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
            <button onClick={() => { localStorage.setItem("quickPrefs", JSON.stringify({ goal: "balanced", spice: "mild", avoid: ["none"], setupAt: Date.now() })); navigate("/"); }}
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
