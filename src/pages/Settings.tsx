import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import { useSubscription } from "../lib/subscription";
import { promoDaysLeft } from "../lib/promo";
import { useLanguage, LANGUAGE_LABEL, type Language } from "../contexts/LanguageContext";
import { getUserId } from "../lib/userId";

// 4-language picker (简 / 繁 / EN / Tagalog).
function LanguageCard() {
  const { language, setLanguage } = useLanguage();
  const langs: { id: Language; flag: string }[] = [
    { id: 'zh',        flag: '🇨🇳' },
    { id: 'zh-Hant',   flag: '🇭🇰' },
    { id: 'en',        flag: '🇬🇧' },
    { id: 'tl',        flag: '🇵🇭' },
  ];
  return (
    <div className="bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[12px] text-secondary font-semibold mb-3 uppercase tracking-wider">
        语言 · Language
      </p>
      <div className="grid grid-cols-4 gap-2">
        {langs.map(l => (
          <button
            key={l.id}
            onClick={() => setLanguage(l.id)}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-2xl border-2 transition-all active:scale-95 ${
              language === l.id ? "border-primary bg-primary/5" : "border-black/[0.08] bg-gray-50"
            }`}
          >
            <span className="text-[20px]">{l.flag}</span>
            <span className={`text-[11px] font-bold ${language === l.id ? "text-primary" : "text-gray-700"}`}>
              {LANGUAGE_LABEL[l.id]}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2 leading-snug">
        繁體適合香港 / 台灣本地用户；Tagalog 给菲律宾家务助理使用。
      </p>
    </div>
  );
}

// ── Pro toolbox: 3 Pro feature shortcuts beneath the membership card ──────
// Free users tapping any of these still land on the feature page first;
// each page's internal ProGate redirects to /pricing.
function ProToolbox() {
  const navigate = useNavigate();
  const { isPro } = useSubscription();
  const tools = [
    { path: '/banquet',           emoji: '🎉', title: '家宴菜单',     desc: '10–20 人聚餐 / 寿宴 / 儿童派对排菜',
      tint: 'rgba(255,193,7,0.10)', border: 'rgba(255,193,7,0.25)' },
    { path: '/pro/wellness',      emoji: '🌿', title: '港式祛湿调理', desc: '按节气推汤水 / 凉茶',
      tint: 'rgba(46,125,50,0.08)', border: 'rgba(46,125,50,0.22)' },
    { path: '/pro/school-balance', emoji: '🎒', title: '学校营养补全', desc: '输入校餐 → 3 道补全晚餐',
      tint: 'rgba(25,118,210,0.08)', border: 'rgba(25,118,210,0.22)' },
  ];
  return (
    <div className="bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <p className="text-[12px] text-secondary font-semibold uppercase tracking-wider">
          {isPro ? '会员 Pro · 工具箱' : '会员 Pro · 解锁后可用'}
        </p>
        {isPro && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "white" }}>
            ✨ 已开通
          </span>
        )}
      </div>
      {tools.map(t => (
        <button
          key={t.path}
          onClick={() => navigate(isPro ? t.path : '/pricing')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all active:scale-[0.98]"
          style={{ background: t.tint, border: `1px solid ${t.border}` }}
        >
          <span className="text-[22px]">{t.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px]">{t.title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{t.desc}</p>
          </div>
          {!isPro && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "white" }}>
              Pro
            </span>
          )}
          <span className="material-symbols-outlined shrink-0"
            style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
            chevron_right
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Membership entry shown above 退出登录 ──────────────────────────────────────
function MembershipCard() {
  const navigate = useNavigate();
  const { isPro, proReason, plan, endsAt } = useSubscription();
  const daysLeft = promoDaysLeft();

  // Four visual states, ordered most-specific first:
  //   1. promo   → green "拓客期免费"
  //   2. helper  → grey "助理永久免费"
  //   3. paid    → white "Pro 会员 · 套餐 + 到期"
  //   4. none    → orange CTA "升级到 Pro"
  const variant = proReason; // 'promo' | 'helper' | 'paid' | 'none'

  const styleMap = {
    promo:  { bg: "linear-gradient(135deg, #16a34a, #22c55e)", shadow: "0 8px 24px rgba(34,197,94,0.30)", textColor: "white", subColor: "rgba(255,255,255,0.85)", chevColor: "rgba(255,255,255,0.80)" },
    helper: { bg: "white", shadow: "0 4px 20px rgba(0,0,0,0.04)", textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)" },
    paid:   { bg: "white", shadow: "0 4px 20px rgba(255,90,31,0.08)", textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)" },
    none:   { bg: "linear-gradient(135deg, #FF5A1F, #FF8C54)", shadow: "0 8px 24px rgba(255,90,31,0.30)", textColor: "white", subColor: "rgba(255,255,255,0.85)", chevColor: "rgba(255,255,255,0.80)" },
  }[variant];

  const icon  = variant === 'promo' ? '🎉'
             : variant === 'helper' ? '🧑‍🍳'
             : variant === 'paid'   ? '✨'
             : '⭐';

  const title = variant === 'promo' ? '拓客期免费 · 全功能解锁'
              : variant === 'helper' ? '助理永久免费'
              : variant === 'paid'   ? '爱吃 Pro 会员'
              : '升级到 爱吃 Pro';

  const sub = variant === 'promo' ? (daysLeft > 0 ? `剩余 ${daysLeft} 天 · 期满前不会扣款` : '拓客期已结束')
            : variant === 'helper' ? '家政助理使用爱吃从不收费'
            : variant === 'paid'   ? `${plan === 'pro_yearly' ? '年度' : plan === 'pro_halfyear' ? '半年' : '月度'}${endsAt ? ` · 到期 ${endsAt.toISOString().slice(0,10)}` : ''}`
            : '解锁米其林菜单 + 高端食材采购';

  const border = variant === 'paid' ? '1px solid rgba(255,90,31,0.20)' : 'none';

  return (
    <button
      onClick={() => navigate("/pricing")}
      className="w-full rounded-[22px] p-4 text-left transition-all active:scale-[0.98] flex items-center gap-3"
      style={{ background: styleMap.bg, border, boxShadow: styleMap.shadow }}
    >
      <span className="text-[28px]">{icon}</span>
      <div className="flex-1">
        <p className="font-bold text-[15px]" style={{ color: styleMap.textColor }}>{title}</p>
        <p className="text-[12px]" style={{ color: styleMap.subColor }}>{sub}</p>
      </div>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 20, color: styleMap.chevColor }}
      >
        chevron_right
      </span>
    </button>
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

type LifeStage = "普通成人" | "孕期" | "哺乳期" | "备孕" | "老人" | "儿童";

interface FamilyMember {
  id: string;
  name: string;
  lifeStage: LifeStage;
  needs: string[];
}

// ─── constants ────────────────────────────────────────────────────────────────

const LIFE_STAGES: { value: LifeStage; emoji: string; color: string; bg: string }[] = [
  { value: "普通成人", emoji: "👤", color: "text-slate-600",  bg: "bg-slate-100" },
  { value: "孕期",    emoji: "🤰", color: "text-pink-600",   bg: "bg-pink-50"   },
  { value: "哺乳期",  emoji: "🤱", color: "text-purple-600", bg: "bg-purple-50" },
  { value: "备孕",    emoji: "🌸", color: "text-rose-600",   bg: "bg-rose-50"   },
  { value: "老人",    emoji: "👴", color: "text-amber-700",  bg: "bg-amber-50"  },
  { value: "儿童",    emoji: "🧒", color: "text-blue-600",   bg: "bg-blue-50"   },
];

const NEED_GROUPS = [
  {
    group: "目标",
    tags: ["减脂", "增肌", "均衡营养", "养生"],
  },
  {
    group: "忌口",
    tags: ["素食", "不吃海鲜", "不辣", "花生过敏", "忌乳制品", "忌牛羊肉", "不吃香菜"],
  },
  {
    group: "健康",
    tags: ["高血压", "糖尿病", "痛风", "贫血", "低血压"],
  },
];

const AVATAR_COLORS = [
  "bg-orange-400", "bg-blue-400", "bg-emerald-400", "bg-violet-400",
  "bg-rose-400", "bg-amber-400", "bg-teal-400", "bg-indigo-400",
];

function getStageStyle(stage: LifeStage) {
  return LIFE_STAGES.find(s => s.value === stage) ?? LIFE_STAGES[0];
}

// ── Migrate old localStorage prefs → first member needs ──────────────────────
function migrateOldPrefs(): string[] {
  const prefs = JSON.parse(localStorage.getItem("quickPrefs") || "{}");
  const needs: string[] = [];
  if (prefs.goal === "减脂") needs.push("减脂");
  if (prefs.goal === "增肌") needs.push("增肌");
  if (prefs.goal === "养生") needs.push("养生");
  const avoidMap: Record<string, string> = {
    vegetarian: "素食", no_seafood: "不吃海鲜", peanut_allergy: "花生过敏",
    no_dairy: "忌乳制品", no_beef_lamb: "忌牛羊肉", no_cilantro: "不吃香菜",
  };
  if (Array.isArray(prefs.avoid)) prefs.avoid.forEach((v: string) => { if (avoidMap[v]) needs.push(avoidMap[v]); });
  const healthMap: Record<string, string> = {
    hypertension: "高血压", diabetes: "糖尿病", gout: "痛风",
    anemia: "贫血", low_blood_pressure: "低血压",
  };
  if (Array.isArray(prefs.health)) prefs.health.forEach((v: string) => { if (healthMap[v]) needs.push(healthMap[v]); });
  if (prefs.spice === "不辣") needs.push("不辣");
  return needs;
}

function loadMembers(): FamilyMember[] {
  try {
    const raw = localStorage.getItem("nutri_family_members");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: "1", name: "我", lifeStage: "普通成人", needs: migrateOldPrefs() }];
}

function persistMembers(members: FamilyMember[]) {
  localStorage.setItem("nutri_family_members", JSON.stringify(members));
  const adults = members.filter(m => m.lifeStage !== "儿童").length;
  const kids   = members.filter(m => m.lifeStage === "儿童").length;
  localStorage.setItem("nutri_adults", String(Math.max(1, adults)));
  localStorage.setItem("nutri_kids",   String(kids));

  // NOTE: We intentionally do NOT overwrite quickPrefs here.
  // quickPrefs holds the QuickSetup answers (english id format like 'fatloss'/'seafood'),
  // which userPrefs.ts/getUserPrefs uses as the authoritative source.
  // The menu algorithm (useWeeklyMenu.ts → getEatingMembers) reads nutri_family_members
  // directly and unions every member's chinese needs ("不吃海鲜", etc) on top of basePrefs.
  // Earlier this code wrote chinese goal ("增肌") and aliased avoid ids ("no_seafood")
  // back into quickPrefs, which broke GOAL_MAP/AVOID_OPTION_MAP lookup.
  window.dispatchEvent(new Event("nutri-prefs-changed"));
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();

  const [members,   setMembers]   = useState<FamilyMember[]>(loadMembers);
  const [openId,    setOpenId]    = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FamilyMember | null>(null);

  const [helperName, setHelperName] = useState(() => localStorage.getItem("helperName") || "Maria Santos");
  const [helperLang, setHelperLang] = useState(() => localStorage.getItem("helperLang") || "tagalog");
  const [helperSaved, setHelperSaved] = useState(false);
  const [helperOpen,  setHelperOpen]  = useState(false);
  const [hasHelper, setHasHelper] = useState(() => localStorage.getItem("nutri_has_helper") === "true");

  function toggleHasHelper() {
    const next = !hasHelper;
    setHasHelper(next);
    localStorage.setItem("nutri_has_helper", String(next));
    // Invalidate menu cache so it regenerates with new setting
    window.dispatchEvent(new Event("nutri-prefs-changed"));
  }

  function openMember(m: FamilyMember) {
    if (openId === m.id) {
      setOpenId(null);
      setEditDraft(null);
    } else {
      setOpenId(m.id);
      setEditDraft({ ...m });
    }
  }

  function addMember() {
    const m: FamilyMember = { id: Date.now().toString(), name: "", lifeStage: "普通成人", needs: [] };
    const next = [...members, m];
    setMembers(next);
    setOpenId(m.id);
    setEditDraft({ ...m });
  }

  function saveMember() {
    if (!editDraft) return;
    const next = members.map(m => m.id === editDraft.id ? editDraft : m);
    setMembers(next);
    persistMembers(next);
    setOpenId(null);
    setEditDraft(null);
  }

  function removeMember(id: string) {
    const next = members.filter(m => m.id !== id);
    setMembers(next);
    persistMembers(next);
    setOpenId(null);
    setEditDraft(null);
  }

  function toggleNeed(need: string) {
    setEditDraft(prev => {
      if (!prev) return prev;
      const needs = prev.needs.includes(need)
        ? prev.needs.filter(n => n !== need)
        : [...prev.needs, need];
      return { ...prev, needs };
    });
  }

  async function saveHelper() {
    localStorage.setItem("helperName", helperName);
    localStorage.setItem("helperLang", helperLang);
    const userId = getUserId();
    if (userId) await supabase.from("user_profiles").upsert({ id: userId, display_name: helperName }, { onConflict: "id" });
    setHelperSaved(true);
    setTimeout(() => { setHelperSaved(false); setHelperOpen(false); }, 1200);
  }


  return (
    <div className="flex justify-center items-start min-h-screen text-on-surface bg-[#f5f5f7]">
      <div className="w-full max-w-md min-h-screen relative overflow-x-hidden pb-28">

        {/* ── Header ── */}
        <header className="sticky top-0 w-full z-50 bg-[#f5f5f7]/90 backdrop-blur-md px-4 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-primary text-2xl">arrow_back</span>
          </button>
          <div>
            <p className="font-bold text-[18px] text-on-surface leading-tight">家庭成员档案</p>
            <p className="text-[12px] text-secondary">{members.length} 位成员</p>
          </div>
        </header>

        <div className="px-4 space-y-3">

          {/* ── Member cards ── */}
          {members.map((m, idx) => {
            const isOpen = openId === m.id;
            const stage  = getStageStyle(m.lifeStage);
            const draft  = isOpen ? editDraft : null;

            return (
              <div key={m.id} className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden">

                {/* Card header row */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 active:bg-black/[0.02] transition-colors text-left"
                  onClick={() => openMember(m)}
                >
                  <div className={`w-12 h-12 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <span className="text-white text-[20px] font-black select-none">
                      {m.name ? m.name[0] : "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[16px] font-black text-on-surface">{m.name || "新成员"}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                        {stage.emoji} {m.lifeStage}
                      </span>
                    </div>
                    {m.needs.length > 0
                      ? <p className="text-[12px] text-secondary truncate">{m.needs.join(" · ")}</p>
                      : <p className="text-[12px] text-secondary/40">点击完善需求</p>
                    }
                  </div>
                  <span
                    className="material-symbols-outlined text-secondary/60 text-xl flex-shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  >
                    expand_more
                  </span>
                </button>

                {/* Inline editor */}
                {isOpen && draft && (
                  <div className="border-t border-black/5 px-5 pb-5">
                    <div className="pt-4 space-y-5">

                      {/* Name */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">叫什么</label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={e => setEditDraft(prev => prev ? { ...prev, name: e.target.value } : prev)}
                          placeholder="妈妈 / 爸爸 / 小明…"
                          className="w-full bg-[#f5f5f7] border border-black/5 rounded-[14px] px-4 py-3 text-[15px] font-bold text-on-surface outline-none focus:border-primary transition-colors"
                        />
                      </div>

                      {/* Life stage */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">生命阶段</label>
                        <div className="grid grid-cols-3 gap-2">
                          {LIFE_STAGES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => setEditDraft(prev => prev ? { ...prev, lifeStage: s.value } : prev)}
                              className={`flex flex-col items-center py-3 rounded-[14px] border-2 transition-all active:scale-95 ${
                                draft.lifeStage === s.value
                                  ? `border-primary ${s.bg}`
                                  : "border-black/[0.08] bg-black/[0.02]"
                              }`}
                            >
                              <span className="text-2xl mb-0.5">{s.emoji}</span>
                              <span className={`text-[12px] font-bold ${draft.lifeStage === s.value ? "text-primary" : "text-secondary"}`}>
                                {s.value}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Need tags */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-3">特殊需求</label>
                        {NEED_GROUPS.map(({ group, tags }) => (
                          <div key={group} className="mb-4">
                            <p className="text-[11px] text-secondary/50 font-semibold mb-2">{group}</p>
                            <div className="flex flex-wrap gap-2">
                              {tags.map(tag => {
                                const sel = draft.needs.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    onClick={() => toggleNeed(tag)}
                                    className={`px-3.5 py-2 rounded-[10px] text-[13px] font-semibold border transition-all active:scale-[0.96] ${
                                      sel
                                        ? "bg-primary/10 text-primary border-primary/30"
                                        : "bg-black/[0.03] text-secondary border-transparent"
                                    }`}
                                  >
                                    {sel && "✓ "}{tag}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Save */}
                      <button
                        onClick={saveMember}
                        className="w-full py-3 bg-primary text-white rounded-[14px] text-[14px] font-bold active:scale-[0.98] transition-transform shadow-[0_4px_16px_rgba(255,90,31,0.25)]"
                      >
                        保存
                      </button>

                      {/* Remove */}
                      {members.length > 1 && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="w-full py-2 text-[13px] font-semibold text-red-400 active:scale-[0.98] transition-transform"
                        >
                          移除此成员
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Add member ── */}
          <button
            onClick={addMember}
            className="w-full py-4 bg-white rounded-[22px] border-2 border-dashed border-black/10 flex items-center justify-center gap-2 text-secondary font-bold text-[14px] active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-xl">person_add</span>
            添加家庭成员
          </button>

          {/* ── Helper section ── */}
          <div className="pt-2">
            <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2">菲佣设置</p>

            {/* Has-helper toggle */}
            <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] px-5 py-4 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px] text-[#FF8C54]">cooking</span>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-on-surface">家中有菲佣做饭</p>
                  <p className="text-[11px] text-secondary mt-0.5">
                    {hasHelper ? '菜单优先推易执行菜（每天最多1道高难度）' : '关闭时按正常算法生成'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleHasHelper}
                className="relative w-12 h-6 rounded-full transition-all flex-shrink-0"
                style={{ background: hasHelper ? '#FF5A1F' : 'rgba(0,0,0,0.12)' }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: hasHelper ? '26px' : '2px' }}
                />
              </button>
            </div>
            <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 active:bg-black/[0.02] transition-colors"
                onClick={() => setHelperOpen(v => !v)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#F0F4E8] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px] text-[#5F6E40]">person</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-on-surface">外佣助手设置</p>
                    {!helperOpen && <p className="text-[12px] text-secondary">{helperName}</p>}
                  </div>
                </div>
                <span className="material-symbols-outlined text-secondary/60 text-[20px] transition-transform duration-200"
                  style={{ transform: helperOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  expand_more
                </span>
              </button>

              {helperOpen && (
                <div className="px-5 pb-5 border-t border-black/5">
                  <div className="pt-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">外佣名字</label>
                      <input
                        type="text"
                        value={helperName}
                        onChange={e => setHelperName(e.target.value)}
                        className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-4 py-3 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">下发指令语言</label>
                      <div className="flex p-1 bg-black/5 rounded-[12px]">
                        {[
                          { value: "english",     label: "English"   },
                          { value: "tagalog",     label: "Tagalog"   },
                          { value: "indonesian",  label: "Indonesian"},
                        ].map(opt => (
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
                      style={{ background: helperSaved ? "#059669" : "#2D3748", color: "white" }}
                    >
                      {helperSaved
                        ? <><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>已保存</>
                        : "保存设置"}
                    </button>
                    <button
                      onClick={() => {
                        const userId = getUserId() ?? "";
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

          {/* Role switcher removed — identity is picked once at /signin.
              Keeping it here was confusing (one user shouldn't be both
              employer and helper on the same account). */}

          {/* ── Language picker ── */}
          <LanguageCard />

          {/* ── My Favorites quick-link ── */}
          <button
            onClick={() => navigate('/favorites')}
            className="w-full bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <span className="text-[24px]">❤️</span>
            <div className="flex-1 text-left">
              <p className="font-bold text-[14px]">我的收藏</p>
              <p className="text-[11px] text-gray-400 mt-0.5">家宴 / 祛湿 / 学校营养 / 周菜单里的爱菜</p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
              chevron_right
            </span>
          </button>

          {/* ── Membership ── */}
          <MembershipCard />

          {/* ── Pro toolbox (家宴 / 祛湿 / 学校营养) ── */}
          <ProToolbox />

          {/* ── Sign out ── */}
          <button
            onClick={() => { localStorage.clear(); navigate("/login"); }}
            className="w-full bg-white border border-black/5 rounded-[22px] py-4 text-secondary font-bold text-[14px] active:scale-[0.98] transition-transform shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          >
            退出登录
          </button>

        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
