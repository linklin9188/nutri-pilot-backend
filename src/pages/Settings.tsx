import React, { useState, useCallback, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";

// ─── helpers ────────────────────────────────────────────────────────────────

function saveQuickPrefs(updates: Record<string, unknown>) {
  const existing = JSON.parse(localStorage.getItem("quickPrefs") || "{}");
  localStorage.setItem("quickPrefs", JSON.stringify({ ...existing, ...updates }));
  window.dispatchEvent(new Event("nutri-prefs-changed"));
}

async function upsertProfile(field: string, value: string) {
  const userId = localStorage.getItem("userId");
  if (!userId) return;
  await supabase
    .from("user_profiles")
    .upsert({ id: userId, [field]: value }, { onConflict: "id" });
}

// ─── types ───────────────────────────────────────────────────────────────────

type SectionId = "family" | "goal" | "spice" | "avoid" | "health" | "hometown" | "age" | "helper";

// ─── constants ───────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { value: "减脂", label: "减脂", sub: "低卡优先" },
  { value: "增肌", label: "增肌", sub: "高蛋白" },
  { value: "均衡", label: "均衡", sub: "均衡营养" },
  { value: "养生", label: "养生", sub: "食疗调理" },
];

const SPICE_OPTIONS = [
  { value: "不辣", label: "不辣", emoji: "🥛" },
  { value: "微辣", label: "微辣", emoji: "🌶️" },
  { value: "中辣", label: "中辣", emoji: "🌶️🌶️" },
  { value: "重辣", label: "重辣", emoji: "🌶️🌶️🌶️" },
];

const AVOID_OPTIONS = [
  { value: "none", label: "没有忌口" },
  { value: "no_seafood", label: "不吃海鲜" },
  { value: "vegetarian", label: "素食" },
  { value: "no_cilantro", label: "不吃香菜" },
  { value: "no_allium", label: "不吃葱蒜" },
  { value: "no_beef_lamb", label: "忌牛羊肉" },
  { value: "peanut_allergy", label: "花生过敏" },
  { value: "no_dairy", label: "忌乳制品" },
];

const HEALTH_OPTIONS = [
  { value: "none", label: "没有特殊情况" },
  { value: "hypertension", label: "高血压" },
  { value: "diabetes", label: "糖尿病" },
  { value: "gout", label: "痛风" },
];

const HOMETOWN_OPTIONS = [
  { value: "cantonese", label: "粤菜", emoji: "🇭🇰" },
  { value: "sichuan", label: "川菜", emoji: "🌶️" },
  { value: "jiangnan", label: "江南菜", emoji: "🫛" },
  { value: "northern", label: "北方菜", emoji: "🥟" },
  { value: "western", label: "西式", emoji: "🍝" },
  { value: "japanese_korean", label: "日韩", emoji: "🍱" },
  { value: "southeast_asian", label: "东南亚", emoji: "🥘" },
];

const AGE_OPTIONS = [
  { value: "genZ", label: "00后" },
  { value: "millennial", label: "90后" },
  { value: "genX", label: "80后" },
  { value: "boomer", label: "70后及之前" },
];

// ─── sub-components ──────────────────────────────────────────────────────────

function ChipLabel({ text }: { text: string }) {
  return (
    <span className="inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold bg-primary/10 text-primary">
      {text}
    </span>
  );
}

function UnsetLabel() {
  return (
    <span className="inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold bg-black/5 text-secondary">
      未设置
    </span>
  );
}

interface SectionCardProps {
  id: SectionId;
  title: string;
  icon: string;
  preview: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  isComplete: boolean;
  children: ReactNode;
}

function SectionCard({ title, icon, preview, isOpen, onToggle, isComplete, children }: SectionCardProps) {
  return (
    <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 active:bg-black/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${isComplete ? "bg-emerald-50" : "bg-black/5"}`}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: isComplete ? "#10b981" : "#9ca3af" }}>
              {icon}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-[14px] font-bold text-on-surface leading-none">{title}</span>
            <div className="mt-1">{preview}</div>
          </div>
        </div>
        <span className="material-symbols-outlined text-secondary text-xl transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-black/5">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function Stepper({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[14px] font-semibold text-on-surface">{label}</span>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center active:scale-95 transition-transform text-on-surface font-bold text-lg"
        >
          −
        </button>
        <span className="w-6 text-center text-[18px] font-bold text-primary">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center active:scale-95 transition-transform text-lg font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SaveBtn({ onSave }: { onSave: () => void }) {
  return (
    <button
      onClick={onSave}
      className="mt-4 w-full py-3 bg-primary text-white rounded-[14px] text-[14px] font-bold active:scale-[0.98] transition-transform shadow-[0_4px_16px_rgba(255,90,31,0.25)]"
    >
      保存
    </button>
  );
}

interface SingleChipProps {
  label: string;
  sub?: string;
  emoji?: string;
  selected: boolean;
  onSelect: () => void;
}

const SingleChip: React.FC<SingleChipProps> = ({ label, sub, emoji, selected, onSelect }) => (
  <button
    onClick={onSelect}
    className={`flex flex-col items-center justify-center px-3 py-3 rounded-[14px] text-[13px] font-bold border transition-all active:scale-[0.97] ${
      selected ? "bg-primary/10 text-primary border-primary/30 shadow-[0_0_12px_rgba(255,90,31,0.12)]" : "bg-black/[0.03] text-secondary border-transparent"
    }`}
  >
    {emoji && <span className="text-xl mb-1">{emoji}</span>}
    <span>{label}</span>
    {sub && <span className={`text-[11px] mt-0.5 font-medium ${selected ? "text-primary/70" : "text-secondary/70"}`}>{sub}</span>}
  </button>
);

interface MultiChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

const MultiChip: React.FC<MultiChipProps> = ({ label, selected, onToggle }) => (
  <button
    onClick={onToggle}
    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-[12px] text-[13px] font-semibold border transition-all active:scale-[0.97] ${
      selected ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
    }`}
  >
    {selected && <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
    {label}
  </button>
);

// ─── main page ───────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();

  // ── read initial state ─────────────────────────────────────────────────────
  const [adults, setAdults] = useState(() => parseInt(localStorage.getItem("nutri_adults") || "3"));
  const [kids, setKids] = useState(() => parseInt(localStorage.getItem("nutri_kids") || "0"));

  const existingPrefs = JSON.parse(localStorage.getItem("quickPrefs") || "{}");

  const [goal, setGoal] = useState<string>(() => existingPrefs.goal || "");
  const [spice, setSpice] = useState<string>(() => existingPrefs.spice || "");
  const [avoid, setAvoid] = useState<string[]>(() => existingPrefs.avoid || []);
  const [health, setHealth] = useState<string[]>(() => existingPrefs.health || []);
  const [hometown, setHometown] = useState<string>(() => localStorage.getItem("hometown_cuisine") || "");
  const [ageGroup, setAgeGroup] = useState<string>(() => localStorage.getItem("age_group") || "");

  // ── helper section ─────────────────────────────────────────────────────────
  const [helperName, setHelperName] = useState(() => localStorage.getItem("helperName") || "Maria Santos");
  const [helperLang, setHelperLang] = useState(() => localStorage.getItem("helperLang") || "tagalog");
  const [helperSaved, setHelperSaved] = useState(false);

  // ── open/close sections ────────────────────────────────────────────────────
  const [openSection, setOpenSection] = useState<SectionId | null>(null);

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  // ── completion ─────────────────────────────────────────────────────────────
  const completedSections = [
    adults > 0,
    !!goal,
    !!spice,
    avoid.length > 0,
    health.length > 0,
    !!hometown,
    !!ageGroup,
  ].filter(Boolean).length;

  const completionPct = Math.round((completedSections / 7) * 100);

  // ── save handlers ──────────────────────────────────────────────────────────
  const saveFamily = () => {
    localStorage.setItem("nutri_adults", String(adults));
    localStorage.setItem("nutri_kids", String(kids));
    window.dispatchEvent(new Event("nutri-prefs-changed"));
    setOpenSection(null);
  };

  const saveGoal = () => {
    localStorage.setItem("userDiet", goal);
    saveQuickPrefs({ goal });
    setOpenSection(null);
  };

  const saveSpice = () => {
    localStorage.setItem("userSpice", spice);
    saveQuickPrefs({ spice });
    setOpenSection(null);
  };

  const saveAvoid = () => {
    saveQuickPrefs({ avoid });
    setOpenSection(null);
  };

  const saveHealth = () => {
    saveQuickPrefs({ health });
    setOpenSection(null);
  };

  const saveHometown = async () => {
    localStorage.setItem("hometown_cuisine", hometown);
    await upsertProfile("hometown_cuisine", hometown);
    saveQuickPrefs({});
    setOpenSection(null);
  };

  const saveAgeGroup = async () => {
    localStorage.setItem("age_group", ageGroup);
    await upsertProfile("age_group", ageGroup);
    saveQuickPrefs({});
    setOpenSection(null);
  };

  const saveHelper = async () => {
    localStorage.setItem("helperName", helperName);
    localStorage.setItem("helperLang", helperLang);
    await upsertProfile("display_name", helperName);
    setHelperSaved(true);
    setTimeout(() => {
      setHelperSaved(false);
      setOpenSection(null);
    }, 1200);
  };

  // ── multi-select toggle ────────────────────────────────────────────────────
  const toggleAvoid = (val: string) => {
    if (val === "none") {
      setAvoid(["none"]);
      return;
    }
    setAvoid((prev) => {
      const without = prev.filter((v) => v !== "none");
      return without.includes(val) ? without.filter((v) => v !== val) : [...without, val];
    });
  };

  const toggleHealth = (val: string) => {
    if (val === "none") {
      setHealth(["none"]);
      return;
    }
    setHealth((prev) => {
      const without = prev.filter((v) => v !== "none");
      return without.includes(val) ? without.filter((v) => v !== val) : [...without, val];
    });
  };

  // ── label helpers ──────────────────────────────────────────────────────────
  const familyLabel = `${adults} 成人 · ${kids} 小孩`;
  const avoidLabel = avoid.length
    ? avoid.map((v) => AVOID_OPTIONS.find((o) => o.value === v)?.label).filter(Boolean).join("、")
    : "";
  const healthLabel = health.length
    ? health.map((v) => HEALTH_OPTIONS.find((o) => o.value === v)?.label).filter(Boolean).join("、")
    : "";
  const hometownLabel = HOMETOWN_OPTIONS.find((o) => o.value === hometown)?.label || "";
  const ageLabel = AGE_OPTIONS.find((o) => o.value === ageGroup)?.label || "";

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex justify-center items-start min-h-screen text-on-surface bg-[#f5f5f7]">
      <div className="w-full max-w-md min-h-screen relative overflow-x-hidden pb-24">

        {/* ── Header ── */}
        <header className="sticky top-0 w-full z-50 bg-[#f5f5f7]/90 backdrop-blur-md px-4 h-16 flex items-center gap-3 border-none">
          <button onClick={() => navigate("/")} className="active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-primary text-2xl">arrow_back</span>
          </button>
          <span className="font-bold text-[18px] text-on-surface">个人偏好设置</span>
        </header>

        {/* ── Completion card ── */}
        <div className="mx-4 mb-4 rounded-[22px] bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white/60 text-[12px] font-semibold uppercase tracking-wider mb-1">菜单个性化程度</p>
              <p className="text-white text-[28px] font-bold leading-none">{completionPct}%</p>
            </div>
            <div className="text-right">
              <span className="text-white/80 text-[13px] font-semibold">{completedSections}/7 已完善</span>
              <p className="text-white/40 text-[11px] mt-0.5">
                {completionPct < 50 ? "完善更多以获得精准推荐" : completionPct < 100 ? "继续完善，推荐更贴心" : "已完整设置！"}
              </p>
            </div>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${completionPct}%`,
                background: completionPct === 100 ? "#10b981" : "linear-gradient(90deg, #ff5a1f, #ff8c42)",
              }}
            />
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="px-4 space-y-3">

          {/* Section 1 — Family */}
          <SectionCard
            id="family"
            title="家庭人数"
            icon="group"
            preview={<ChipLabel text={familyLabel} />}
            isOpen={openSection === "family"}
            onToggle={() => toggleSection("family")}
            isComplete={true}
          >
            <Stepper value={adults} min={1} max={8} label="成人" onChange={setAdults} />
            <div className="border-t border-black/5" />
            <Stepper value={kids} min={0} max={5} label="小孩" onChange={setKids} />
            <SaveBtn onSave={saveFamily} />
          </SectionCard>

          {/* Section 2 — Goal */}
          <SectionCard
            id="goal"
            title="饮食目标"
            icon="flag"
            preview={goal ? <ChipLabel text={goal} /> : <UnsetLabel />}
            isOpen={openSection === "goal"}
            onToggle={() => toggleSection("goal")}
            isComplete={!!goal}
          >
            <div className="grid grid-cols-2 gap-2">
              {GOAL_OPTIONS.map((o) => (
                <SingleChip key={o.value} label={o.label} sub={o.sub} selected={goal === o.value} onSelect={() => setGoal(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveGoal} />
          </SectionCard>

          {/* Section 3 — Spice */}
          <SectionCard
            id="spice"
            title="辣度偏好"
            icon="local_fire_department"
            preview={spice ? <ChipLabel text={spice} /> : <UnsetLabel />}
            isOpen={openSection === "spice"}
            onToggle={() => toggleSection("spice")}
            isComplete={!!spice}
          >
            <div className="grid grid-cols-2 gap-2">
              {SPICE_OPTIONS.map((o) => (
                <SingleChip key={o.value} label={o.label} emoji={o.emoji} selected={spice === o.value} onSelect={() => setSpice(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveSpice} />
          </SectionCard>

          {/* Section 4 — Avoid */}
          <SectionCard
            id="avoid"
            title="忌口"
            icon="no_meals"
            preview={avoidLabel ? <ChipLabel text={avoidLabel} /> : <UnsetLabel />}
            isOpen={openSection === "avoid"}
            onToggle={() => toggleSection("avoid")}
            isComplete={avoid.length > 0}
          >
            <div className="flex flex-wrap gap-2">
              {AVOID_OPTIONS.map((o) => (
                <MultiChip key={o.value} label={o.label} selected={avoid.includes(o.value)} onToggle={() => toggleAvoid(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveAvoid} />
          </SectionCard>

          {/* Section 5 — Health */}
          <SectionCard
            id="health"
            title="健康状况"
            icon="health_and_safety"
            preview={healthLabel ? <ChipLabel text={healthLabel} /> : <UnsetLabel />}
            isOpen={openSection === "health"}
            onToggle={() => toggleSection("health")}
            isComplete={health.length > 0}
          >
            <div className="flex flex-wrap gap-2">
              {HEALTH_OPTIONS.map((o) => (
                <MultiChip key={o.value} label={o.label} selected={health.includes(o.value)} onToggle={() => toggleHealth(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveHealth} />
          </SectionCard>

          {/* Section 6 — Hometown cuisine */}
          <SectionCard
            id="hometown"
            title="籍贯菜系"
            icon="restaurant"
            preview={hometownLabel ? <ChipLabel text={hometownLabel} /> : <UnsetLabel />}
            isOpen={openSection === "hometown"}
            onToggle={() => toggleSection("hometown")}
            isComplete={!!hometown}
          >
            <div className="grid grid-cols-3 gap-2">
              {HOMETOWN_OPTIONS.map((o) => (
                <SingleChip key={o.value} label={o.label} emoji={o.emoji} selected={hometown === o.value} onSelect={() => setHometown(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveHometown} />
          </SectionCard>

          {/* Section 7 — Age group */}
          <SectionCard
            id="age"
            title="年龄段"
            icon="cake"
            preview={ageLabel ? <ChipLabel text={ageLabel} /> : <UnsetLabel />}
            isOpen={openSection === "age"}
            onToggle={() => toggleSection("age")}
            isComplete={!!ageGroup}
          >
            <div className="grid grid-cols-2 gap-2">
              {AGE_OPTIONS.map((o) => (
                <SingleChip key={o.value} label={o.label} selected={ageGroup === o.value} onSelect={() => setAgeGroup(o.value)} />
              ))}
            </div>
            <SaveBtn onSave={saveAgeGroup} />
          </SectionCard>

          {/* ── Helper / 菲佣设置 ── */}
          <div className="pt-2">
            <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider px-1 mb-2">菲佣设置</p>
            <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 active:bg-black/[0.02] transition-colors"
                onClick={() => toggleSection("helper")}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#F0F4E8] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px] text-[#5F6E40]">person</span>
                  </div>
                  <div>
                    <span className="text-[14px] font-bold text-on-surface">外佣助手设置</span>
                    {helperName && openSection !== "helper" && (
                      <p className="text-[12px] text-secondary mt-0.5">{helperName}</p>
                    )}
                  </div>
                </div>
                <span className="material-symbols-outlined text-secondary text-[20px] transition-transform"
                  style={{ transform: openSection === "helper" ? "rotate(180deg)" : "rotate(0deg)" }}>
                  expand_more
                </span>
              </button>

              {openSection === "helper" && (
                <div className="px-5 pb-5 border-t border-black/5">
                  <div className="pt-4 space-y-4">
                    <div>
                      <label className="block text-[12px] font-bold text-secondary mb-1.5 uppercase tracking-wide">外佣名字</label>
                      <input
                        type="text"
                        value={helperName}
                        onChange={(e) => setHelperName(e.target.value)}
                        className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-4 py-3 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-bold text-secondary mb-1.5 uppercase tracking-wide">下发指令语言</label>
                      <div className="flex p-1 bg-black/5 rounded-[12px]">
                        {[
                          { value: "english", label: "English" },
                          { value: "tagalog", label: "Tagalog" },
                          { value: "indonesian", label: "Indonesian" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setHelperLang(opt.value)}
                            className={`flex-1 py-2 text-[12px] rounded-[10px] transition-all ${helperLang === opt.value ? "font-bold text-on-surface bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]" : "font-medium text-secondary"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={saveHelper}
                      disabled={helperSaved}
                      className="w-full py-3 rounded-[14px] text-[14px] font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      style={{
                        background: helperSaved ? "#059669" : "#2D3748",
                        color: "white",
                      }}
                    >
                      {helperSaved ? (
                        <>
                          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          已保存
                        </>
                      ) : "保存设置"}
                    </button>

                    {/* Invite helper */}
                    <button
                      onClick={() => {
                        const userId = localStorage.getItem("userId") ?? "";
                        const link = `${window.location.origin}/signin?role=helper&employer=${userId}`;
                        const text = encodeURIComponent(`Hi ${helperName}! 我用爱吃Aieats管理家里的菜单，你可以直接在上面查看今天的采购和备菜任务。点击加入：${link}`);
                        window.open(`https://wa.me/?text=${text}`, "_blank");
                      }}
                      className="w-full py-3 rounded-[14px] text-[14px] font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white" }}
                    >
                      <span style={{ fontSize: 16 }}>📲</span>
                      邀请 {helperName || "工人姐姐"} 加入
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sign out ── */}
          <button
            onClick={() => {
              localStorage.clear();
              navigate("/login");
            }}
            className="w-full bg-white border border-black/5 rounded-[20px] py-4 text-secondary font-bold text-[14px] active:scale-[0.98] transition-transform shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          >
            退出登录
          </button>

        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
