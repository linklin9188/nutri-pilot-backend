import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import MembershipBenefits from "../components/MembershipBenefits";
import { useSubscription } from "../lib/subscription";
import { useLanguage, LANGUAGE_LABEL, type Language } from "../contexts/LanguageContext";
import { getUserId } from "../lib/userId";
import { syncProfileToDB } from "../lib/profileSync";

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
  const { proReason, plan, endsAt } = useSubscription();

  // Three visual states (promo retired 2026-05-16):
  //   1. helper → grey 「助理永久免费」
  //   2. paid   → white 「Pro 会员 · 套餐 + 到期」
  //   3. none   → orange CTA 「升级到 Pro」
  // proReason 'promo' is no longer emitted by effectiveProReason(), so we
  // collapse it into the 'none' (upgrade) bucket if anything stale leaks in.
  const variant: 'helper' | 'paid' | 'none' =
    proReason === 'helper' ? 'helper'
    : proReason === 'paid' ? 'paid'
    : 'none';

  const styleMap = {
    helper: { bg: "white", shadow: "0 4px 20px rgba(0,0,0,0.04)", textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)" },
    paid:   { bg: "white", shadow: "0 4px 20px rgba(255,90,31,0.08)", textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)" },
    none:   { bg: "linear-gradient(135deg, #FF5A1F, #FF8C54)", shadow: "0 8px 24px rgba(255,90,31,0.30)", textColor: "white", subColor: "rgba(255,255,255,0.85)", chevColor: "rgba(255,255,255,0.80)" },
  }[variant];

  const icon  = variant === 'helper' ? '🧑‍🍳'
              : variant === 'paid'   ? '✨'
              : '⭐';

  const title = variant === 'helper' ? '助理永久免费'
              : variant === 'paid'   ? '爱吃 Pro 会员'
              : '升级到 爱吃 Pro';

  const sub = variant === 'helper' ? '家政助理使用爱吃从不收费'
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

// ── Onboarding choice tables (sourced from QuickSetup) ───────────────────────
// Settings surfaces the same goal / spice / hometown questions so the user
// can change their global flavor without re-running onboarding. Copying the
// options inline (rather than importing from QuickSetup) keeps Settings
// independently editable and avoids a refactor of the question schema.
const TASTE_OPTIONS = {
  goal: [
    { id: "fatloss",   label: "减脂瘦身", icon: "🔥" },
    { id: "muscle",    label: "增肌健体", icon: "💪" },
    { id: "balanced",  label: "营养均衡", icon: "🥗" },
    { id: "nourish",   label: "养生调理", icon: "🍵" },
    { id: "pregnancy", label: "怀孕备孕", icon: "🤰" },
    { id: "growth",    label: "长高变壮", icon: "🌱" },
    { id: "low_carb",  label: "低碳生酮", icon: "🥑" },
    // TICKET-047 §A — special health goals (Algorithm 043 SPEC §5).
    // Forward-compatible: UI ships these now; dishes.is_pregnancy_friendly /
    // is_lactation_friendly / is_elderly_friendly columns land via Database
    // 部门下一棒。Until then the score branch is a no-op; selecting these
    // values does not crash the recommender (schema-check forward-compat).
    { id: "prenatal",  label: "孕期",     icon: "🤰" }, // 营养重点：叶酸 / 铁 / 钙 / DHA
    { id: "lactation", label: "哺乳",     icon: "🤱" }, // 营养重点：蛋白 / 催乳食材
    { id: "elderly",   label: "老人",     icon: "👴" }, // 营养重点：低钠 / 易消化 / 补钙
  ],
  spice: [
    { id: "none",   label: "完全不辣", icon: "🥛" },
    { id: "mild",   label: "微微辣",   icon: "🫑" },
    { id: "medium", label: "中辣",     icon: "🌶️" },
    { id: "hot",    label: "越辣越好", icon: "🔥" },
  ],
  hometown: [
    // 地域大区 — 跟 QuickSetup 同步。Legacy 八大菜系 id 在
    // hometownBuckets.ts 仍能识别，所以已注册的老用户的 chip 即使
    // 不亮起也不影响后端的家乡加分。
    { id: "south",       label: "华南",   icon: "🦞" },
    { id: "east",        label: "华东",   icon: "🍤" },
    { id: "north",       label: "华北",   icon: "🥟" },
    { id: "northeast",   label: "东北",   icon: "🍖" },
    { id: "northwest",   label: "西北",   icon: "🌾" },
    { id: "southwest",   label: "西南",   icon: "🌶️" },
    { id: "central",     label: "华中",   icon: "🍲" },
    { id: "hk_macau_tw", label: "港澳台", icon: "🍵" },
    { id: "no_preference", label: "都行", icon: "🤷" },
  ],
};

const TASTE_LABELS: Record<keyof typeof TASTE_OPTIONS, string> = {
  goal:     "近来想怎么吃",
  spice:    "能吃多辣",
  hometown: "惦记的家乡味",
};
const TASTE_ICONS: Record<keyof typeof TASTE_OPTIONS, string> = {
  goal: "🎯",
  spice: "🌶️",
  hometown: "🏠",
};

function readQuickPrefs(): Record<string, string | string[]> {
  try { return JSON.parse(localStorage.getItem("quickPrefs") || "{}"); }
  catch { return {}; }
}
// §A (TICKET-039 Smell 2 阶段 2) — debounce 500ms 把连续多字段修改合并成
// 一次 syncProfileToDB（避免用户连改 hometown + goal + spice 触发 3 次 DB
// upsert）。模块级 timer id；多次 writeQuickPref 调用累加到同一窗口。
let _profileSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSyncProfileToDB() {
  if (_profileSyncDebounceTimer) clearTimeout(_profileSyncDebounceTimer);
  _profileSyncDebounceTimer = setTimeout(() => {
    syncProfileToDB(getUserId()).catch(() => {});
    _profileSyncDebounceTimer = null;
  }, 500);
}

function writeQuickPref(key: string, value: string) {
  const prev = readQuickPrefs();
  prev[key] = value;
  localStorage.setItem("quickPrefs", JSON.stringify(prev));
  // Keep the legacy aliases scoreDish / breakfastCombos / WeeklyMenu read.
  if (key === "spice")    localStorage.setItem("userSpice", value);
  if (key === "goal")     localStorage.setItem("userDiet",  value);
  if (key === "hometown") localStorage.setItem("userHometown", value);
  window.dispatchEvent(new Event("nutri-prefs-changed"));
  // §A (TICKET-036 Smell 2 起步 + TICKET-039 阶段 2 升级) — profile 改完
  // debounce 500ms 同步到 DB user_profiles，让算法侧 SELECT 的 hometown_cuisine
  // / dietary_goal / taste_pref 跟随 UI。
  debouncedSyncProfileToDB();
}

export default function Settings() {
  const navigate = useNavigate();
  const { proReason } = useSubscription();
  // TICKET-040 §A — add useLanguage to main Settings function (sub-components
  // already use it). Lets the header subtitle + Pro toolbox section title
  // follow the global language picker.
  const { t4 } = useLanguage();

  const [members,   setMembers]   = useState<FamilyMember[]>(loadMembers);
  const [openId,    setOpenId]    = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FamilyMember | null>(null);

  // 我的口味 — surface onboarding answers, inline editable.
  const [quickPrefs, setQuickPrefs] = useState<Record<string, string | string[]>>(readQuickPrefs);
  const [openTaste,  setOpenTaste]  = useState<keyof typeof TASTE_OPTIONS | null>(null);
  const pickTaste = (key: keyof typeof TASTE_OPTIONS, value: string) => {
    writeQuickPref(key, value);
    setQuickPrefs(p => ({ ...p, [key]: value }));
    setOpenTaste(null);
  };
  const currentTasteLabel = (key: keyof typeof TASTE_OPTIONS): string => {
    const id = quickPrefs[key];
    const opt = TASTE_OPTIONS[key].find(o => o.id === id);
    return opt ? `${opt.icon} ${opt.label}` : "未设置";
  };

  const [helperName, setHelperName] = useState(() => localStorage.getItem("helperName") || "Maria Santos");
  const [helperLang, setHelperLang] = useState(() => localStorage.getItem("helperLang") || "tagalog");
  const [helperSaved, setHelperSaved] = useState(false);
  const [helperOpen,  setHelperOpen]  = useState(false);
  const [hasHelper, setHasHelper] = useState(() => localStorage.getItem("nutri_has_helper") === "true");

  // 6-digit invite code the helper enters on /helper. Generated by a Postgres
  // BEFORE INSERT trigger on `households`. We load the newest household per
  // employer (order + limit 1) to dodge legacy duplicates. If the user has
  // never had a household row before, auto-create one so the code surface
  // never goes empty (user-reported 2026-05-17 — they were seeing no code
  // because their account never went through the legacy create path).
  const [inviteCode, setInviteCode] = useState<string>("");
  const [codeCopied, setCodeCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getUserId();
      if (!userId) return;
      const { data } = await supabase
        .from("households")
        .select("invite_code")
        .eq("employer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      let code = (data?.[0] as any)?.invite_code as string | undefined;
      if (!code) {
        // Trigger BEFORE INSERT generates a fresh 6-digit code. Surface insert
        // errors instead of silently dropping (B-2 §A2): if RLS or a constraint
        // rejects the row, the user sees a blank invite-code field but we
        // leave a console trail for triage.
        const { data: newRow, error: insertErr } = await supabase
          .from("households")
          .insert({ employer_id: userId })
          .select("invite_code")
          .single();
        if (insertErr) console.error("households insert failed", insertErr);
        code = (newRow as any)?.invite_code;
      }
      if (!cancelled && code) setInviteCode(code);
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleHasHelper() {
    const next = !hasHelper;
    setHasHelper(next);
    localStorage.setItem("nutri_has_helper", String(next));
    // Invalidate menu cache so it regenerates with new setting
    window.dispatchEvent(new Event("nutri-prefs-changed"));
  }

  // 小美 / cooking-robot toggle. Reads + writes the same key the recommend
  // hook consults so the next menu refresh boosts robot-doable dishes
  // by +0.15 score.
  const [hasXiaomei, setHasXiaomei] = useState<boolean>(
    () => localStorage.getItem("has_xiaomei_robot") === "true"
  );
  function toggleHasXiaomei() {
    const next = !hasXiaomei;
    setHasXiaomei(next);
    localStorage.setItem("has_xiaomei_robot", String(next));
    window.dispatchEvent(new Event("nutri-prefs-changed"));
  }

  // TICKET-061 §A — 联系客服 sheet (β 上线用户反馈通道)
  const [supportSheetOpen, setSupportSheetOpen] = useState(false);
  const [wxCopied, setWxCopied] = useState(false);
  const SUPPORT_WX = "jianjiaolin9";
  const SUPPORT_EMAIL = "support@nothinkeats.com";

  // TICKET-063 §A — 个人头像 + 昵称 + role + 家庭成员卡
  const myRole = (typeof window !== "undefined" ? localStorage.getItem("nutri_role") : null) || "employer";
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  interface HouseholdHelper { helper_id: string; name: string | null; avatar_b64: string | null; }
  const [householdHelpers, setHouseholdHelpers] = useState<HouseholdHelper[]>([]);

  // Initial fetch — 自己 profile + 家里已加入的 helpers (employer only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      // 自己 profile
      const { data: me } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_b64")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (me) {
        setMyAvatar((me as { avatar_b64?: string | null }).avatar_b64 ?? null);
        setMyDisplayName((me as { display_name?: string | null }).display_name ?? null);
      }
      // 家里 helpers — 仅雇主拉
      if (myRole === "employer") {
        const { data: hhs } = await supabase
          .from("households")
          .select("id, household_members(helper_id, user_profiles!helper_id(display_name, avatar_b64))")
          .eq("employer_id", uid);
        if (cancelled) return;
        const list: HouseholdHelper[] = [];
        (hhs ?? []).forEach((hh: any) => {
          (hh.household_members ?? []).forEach((hm: any) => {
            if (!hm.helper_id) return;
            const up = hm.user_profiles;
            list.push({
              helper_id: hm.helper_id,
              name: up?.display_name ?? null,
              avatar_b64: up?.avatar_b64 ?? null,
            });
          });
        });
        setHouseholdHelpers(list);
      }
    })();
    return () => { cancelled = true; };
  }, [myRole]);

  // Resize selected image → 256×256 JPEG base64 (~30-80KB typically)
  function resizeImageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("canvas ctx")); return; }
          // Cover-fit crop center
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 256, 256);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => reject(new Error("image load"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("file read"));
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarFile(file: File) {
    setAvatarMsg(null);
    if (!file.type.startsWith("image/")) { setAvatarMsg("仅支持图片格式"); return; }
    setUploadingAvatar(true);
    try {
      const b64 = await resizeImageToBase64(file);
      if (b64.length > 220 * 1024) {
        setAvatarMsg("图片仍过大，请选小一点的");
        setUploadingAvatar(false);
        return;
      }
      const uid = getUserId();
      if (!uid) { setAvatarMsg("未登录"); setUploadingAvatar(false); return; }
      const { error } = await supabase
        .from("user_profiles")
        .update({ avatar_b64: b64 })
        .eq("id", uid);
      if (error) {
        setAvatarMsg("保存失败，稍后重试");
      } else {
        setMyAvatar(b64);
        setAvatarMsg("✓ 头像已更新");
        setTimeout(() => setAvatarMsg(null), 1800);
      }
    } catch {
      setAvatarMsg("处理失败，请换一张图片");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function kickHelper(helper_id: string, name: string | null) {
    if (!window.confirm(`确定踢出 ${name || "此成员"}？踢出后对方将看不到家里菜单。`)) return;
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("helper_id", helper_id);
    if (error) {
      setAvatarMsg("踢出失败，稍后重试");
      setTimeout(() => setAvatarMsg(null), 1800);
      return;
    }
    setHouseholdHelpers(prev => prev.filter(h => h.helper_id !== helper_id));
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
            <p className="font-bold text-[18px] text-on-surface leading-tight">
              {t4('Family Profile', '家庭成员档案', 'Pamilya Profile', 'Profil Keluarga')}
            </p>
            <p className="text-[12px] text-secondary">
              {members.length} {t4('members', '位成员', 'miyembro', 'anggota')}
            </p>
          </div>
        </header>

        <div className="px-4 space-y-3">

          {/* TICKET-063 §A — 个人头像 + 昵称 + role 卡片 (Settings 顶部最显眼位置)
              点头像触发 file input → canvas 256×256 resize → base64 → supabase.user_profiles.avatar_b64
              avatar_b64 列 supabase migration 045 已加。 */}
          <div className="bg-white rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3 mt-1">
            <label className="relative cursor-pointer active:scale-95 transition-transform" title="点击更换头像">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatarFile(f);
                  e.target.value = "";
                }}
              />
              {myAvatar ? (
                <img
                  src={myAvatar}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border-2 border-white"
                  style={{ boxShadow: "0 4px 14px rgba(255,90,31,0.30)" }}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF8C54, #FF5A1F)", boxShadow: "0 4px 14px rgba(255,90,31,0.30)" }}
                >
                  <span className="text-white font-black" style={{ fontSize: 24 }}>
                    {(myDisplayName?.[0] ?? "你").toUpperCase()}
                  </span>
                </div>
              )}
              {uploadingAvatar ? (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <div
                  className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-white flex items-center justify-center"
                  style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#FF5A1F" }}>
                    photo_camera
                  </span>
                </div>
              )}
            </label>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[16px] truncate">
                {myDisplayName || (getUserId()?.slice(0, 8) ?? "你")}
              </p>
              <div className="mt-1 inline-flex items-center gap-1.5">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: myRole === "employer" ? "rgba(255,90,31,0.10)" : "rgba(37,211,102,0.12)",
                    color: myRole === "employer" ? "#FF5A1F" : "#16A34A",
                  }}
                >
                  {myRole === "employer" ? "雇主" : "助理"}
                </span>
                {avatarMsg && (
                  <span className="text-[10px] font-bold" style={{ color: avatarMsg.startsWith("✓") ? "#16A34A" : "#B84A0F" }}>
                    {avatarMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── 我的口味 ── inline editor for the three global onboarding
              answers (目标 / 辣度 / 家乡味). 忌口 + 健康状况 live on the
              family member cards below — kept distinct so per-member needs
              don't get conflated with the household default. */}
          <div className="pt-1">
            <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2">我的口味</p>
            <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
              {(Object.keys(TASTE_OPTIONS) as (keyof typeof TASTE_OPTIONS)[]).map((key, idx) => {
                const isOpen = openTaste === key;
                const isLast = idx === Object.keys(TASTE_OPTIONS).length - 1;
                return (
                  <div key={key} className={isLast ? "" : "border-b border-black/5"}>
                    <button
                      onClick={() => setOpenTaste(isOpen ? null : key)}
                      className="w-full flex items-center gap-3 px-5 py-4 active:bg-black/[0.02] transition-colors text-left">
                      <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center text-[18px]">
                        {TASTE_ICONS[key]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-on-surface">{TASTE_LABELS[key]}</p>
                        <p className="text-[12px] text-secondary mt-0.5 truncate">{currentTasteLabel(key)}</p>
                      </div>
                      <span className="material-symbols-outlined text-secondary/60 text-[20px] transition-transform duration-200 flex-shrink-0"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                        expand_more
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 border-t border-black/5 bg-black/[0.015]">
                        <div className="grid grid-cols-3 gap-2 pt-3">
                          {TASTE_OPTIONS[key].map(opt => {
                            const sel = quickPrefs[key] === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => pickTaste(key, opt.id)}
                                className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[1.5px] border-[#FF5A1F]" : "bg-white border-[1.5px] border-black/5"
                                }`}>
                                <span className="text-[20px]">{opt.icon}</span>
                                <span className={`text-[11px] font-semibold ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2 pt-3">家庭成员档案</p>

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

          {/* ── Helper section — single consolidated card ──
              User direction 2026-05-17: 菲佣相关的设置全集中在一个框，
              不再 toggle / expander 拆分。开关在最上，名字/语言/邀请码/
              一键邀请按钮全部直接可见。邀请码用 households.invite_code
              （Postgres BEFORE INSERT trigger 自动生成），上面 useEffect
              如果用户没 household 会自动 insert 一行让 trigger 生码。 */}
          <div className="pt-2">
            <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2">家政工人</p>

            <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] px-5 py-5 space-y-5">

              {/* Row 1 — toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px] text-[#FF8C54]">cooking</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-on-surface">家中有工人做饭</p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {hasHelper ? '菜单优先推易执行菜（每天最多 1 道高难度）' : '关闭时按正常算法生成'}
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

              {/* Divider — visual separator inside the same frame */}
              <div className="h-px bg-black/5" />

              {/* Row 2 — 名字 */}
              <div>
                <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">工人名字</label>
                <input
                  type="text"
                  value={helperName}
                  onChange={e => setHelperName(e.target.value)}
                  className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-4 py-3 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
                />
              </div>

              {/* Row 3 — 语言 */}
              <div>
                <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">下发指令语言</label>
                <div className="flex p-1 bg-black/5 rounded-[12px]">
                  {[
                    { value: "english",    label: "English"    },
                    { value: "tagalog",    label: "Tagalog"    },
                    { value: "indonesian", label: "Indonesian" },
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

              {/* Row 4 — 邀请码 (always visible; auto-creates household if missing) */}
              <div>
                <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">
                  工人加入码 (6 位)
                </label>
                {inviteCode ? (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteCode);
                        setCodeCopied(true);
                        setTimeout(() => setCodeCopied(false), 1800);
                      } catch { /* clipboard blocked — user can still read */ }
                    }}
                    className="w-full bg-[#FFF7E6] border-2 border-dashed border-[#FF8C54]/40 rounded-[14px] py-3 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                    title="点击复制"
                  >
                    {inviteCode.split("").map((d, i) => (
                      <span
                        key={i}
                        className="font-mono font-black text-[#FF5A1F]"
                        style={{ fontSize: 26, letterSpacing: "0.04em", minWidth: 22, textAlign: "center" }}
                      >
                        {d}
                      </span>
                    ))}
                    <span
                      className="material-symbols-outlined text-[#FF8C54] ml-2"
                      style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
                    >
                      {codeCopied ? "check_circle" : "content_copy"}
                    </span>
                  </button>
                ) : (
                  <div className="w-full bg-black/[0.03] border border-black/5 rounded-[14px] py-4 flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-[#FF8C54]/40 border-t-[#FF5A1F] rounded-full animate-spin" />
                    <span className="text-[12px] text-secondary">正在生成加入码…</span>
                  </div>
                )}
                <p className="text-[11px] text-secondary mt-1.5 leading-snug">
                  告诉工人在「我的任务」页输入此码即可看到今天的菜单。
                </p>
              </div>

              {/* Row 5 — WhatsApp 邀请按钮 */}
              <button
                onClick={() => {
                  const link = `${window.location.origin}/login?role=helper`;
                  const codeLine = inviteCode ? `\n\n加入码 / Code: *${inviteCode}*` : "";
                  const text = encodeURIComponent(
                    `Hi ${helperName}! 我用爱吃 Aieats 管理家里的菜单，你可以直接在上面查看今天的采购和备菜任务。${codeLine}\n\n${link}`
                  );
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

          {/* Role switcher removed — identity is picked once at /login.
              Keeping it here was confusing (one user shouldn't be both
              employer and helper on the same account). */}

          {/* TICKET-063 §A — 家里已加入的助理 (employer only). 通过 invite_code
              加入家庭的 helper 列表 + 头像 + 踢出 (DELETE household_members)。 */}
          {myRole === "employer" && householdHelpers.length > 0 && (
            <div className="bg-white rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-2.5">
                家里已加入的助理 · {householdHelpers.length}
              </p>
              <div className="space-y-2.5">
                {householdHelpers.map((h, i) => {
                  const fallbackColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <div key={h.helper_id} className="flex items-center gap-3">
                      {h.avatar_b64 ? (
                        <img src={h.avatar_b64} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full ${fallbackColor} flex items-center justify-center text-white font-bold`}>
                          {(h.name?.[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[13px] truncate">
                          {h.name || h.helper_id.slice(0, 8)}
                        </p>
                        <span
                          className="inline-block text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(37,211,102,0.12)", color: "#16A34A" }}
                        >
                          菲佣
                        </span>
                      </div>
                      <button
                        onClick={() => kickHelper(h.helper_id, h.name)}
                        className="px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-95 transition-all"
                        style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}
                        title={`踢出 ${h.name || "此成员"}`}
                      >
                        踢出
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Detailed benefits block — sits below the card so non-members
              who tapped the upgrade gradient land on a concrete list of
              what they're paying for. Members see the same list as a
              record of unlocked features. The block carries its own
              legal disclaimer (health-advice scope, coming-soon timing,
              cancellation terms) so we don't make promises we can't keep. */}
          <MembershipBenefits isPro={proReason === 'paid' || proReason === 'helper'} />

          {/* ── 小美 / cooking robot toggle ──
              When ON, the recommend algo boosts robot-doable dishes by
              +0.15 so they float to the top, and each dish card shows a
              🤖 chip telling the user / helper "this one can go straight
              to the robot tonight". */}
          <button
            onClick={toggleHasXiaomei}
            className="w-full bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <span className="text-[24px]">🤖</span>
            <div className="flex-1 text-left">
              <p className="font-bold text-[14px]">我有小美料理机</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                打开后，小美能做的菜会被优先推荐，菜单也会标记 🤖
              </p>
            </div>
            <div
              className="w-11 h-6 rounded-full relative transition-colors"
              style={{ background: hasXiaomei ? "#FF5A1F" : "rgba(0,0,0,0.12)" }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all"
                style={{ left: hasXiaomei ? "22px" : "2px" }}
              />
            </div>
          </button>

          {/* ── Pro toolbox (家宴 / 祛湿 / 学校营养) ── */}
          <ProToolbox />

          {/* ── Sign out ── */}
          <button
            onClick={() => { localStorage.clear(); navigate("/login"); }}
            className="w-full bg-white border border-black/5 rounded-[22px] py-4 text-secondary font-bold text-[14px] active:scale-[0.98] transition-transform shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          >
            退出登录
          </button>

          {/* TICKET-056 §C — 反馈记录（透明 + 撤销）— embedded as a collapsible
              section, not a separate page, to stay surgical. */}
          <FeedbackHistorySection />

          {/* TICKET-061 §A — 联系客服 (β 反馈通道) */}
          <button
            onClick={() => setSupportSheetOpen(true)}
            className="w-full bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <span className="text-[24px]">📩</span>
            <div className="flex-1 text-left">
              <p className="font-bold text-[14px]">联系客服</p>
              <p className="text-[11px] text-gray-400 mt-0.5">用 app 遇问题 / 反馈 / 报 bug</p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
              chevron_right
            </span>
          </button>

          {/* ── Legal / contact — links to /privacy and /terms ─────────────
              Required by WeChat 小程序 提审 (审核员要在 app 内能找到这两
              页). Also surfaces them to the雇主, who otherwise only ever
              sees them at first-time onboarding via Login footer. */}
          <div className="flex items-center justify-center gap-3 pt-2 pb-1 text-[12px] text-gray-400">
            <button onClick={() => navigate("/terms")}
              className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
              服务条款
            </button>
            <span>·</span>
            <button onClick={() => navigate("/privacy")}
              className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
              隐私政策
            </button>
            <span>·</span>
            <a href={`mailto:${SUPPORT_EMAIL}`}
              className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
              联系我们
            </a>
          </div>

        </div>
      </div>

      {/* TICKET-061 §A — 联系客服 sheet */}
      {supportSheetOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setSupportSheetOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[28px] p-5 pb-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 24px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-black/10 rounded-full mx-auto mb-4" />
            <h3 className="text-[16px] font-bold mb-1">联系客服</h3>
            <p className="text-[12px] text-gray-500 mb-4">用 app 遇到问题？告诉我们，我们 24h 内回复你。</p>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Aieats 反馈")}`}
              className="w-full bg-gray-50 border border-black/5 rounded-[16px] p-4 flex items-center gap-3 active:scale-[0.98] transition-all mb-2.5"
            >
              <span className="text-[22px]">📧</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-[13px]">发邮件反馈</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{SUPPORT_EMAIL}</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
                arrow_forward_ios
              </span>
            </a>

            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(SUPPORT_WX);
                  setWxCopied(true);
                  setTimeout(() => setWxCopied(false), 1800);
                } catch {/* clipboard blocked — 用户仍可读 */}
              }}
              className="w-full bg-gray-50 border border-black/5 rounded-[16px] p-4 flex items-center gap-3 active:scale-[0.98] transition-all mb-2.5"
            >
              <span className="text-[22px]">💬</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-[13px]">微信 (点击复制)</p>
                <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{SUPPORT_WX}</p>
              </div>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: wxCopied ? "#16A34A" : "rgba(0,0,0,0.30)" }}
              >
                {wxCopied ? "check_circle" : "content_copy"}
              </span>
            </button>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Aieats Bug")}`}
              className="w-full bg-gray-50 border border-black/5 rounded-[16px] p-4 flex items-center gap-3 active:scale-[0.98] transition-all mb-4"
            >
              <span className="text-[22px]">🐛</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-[13px]">报 bug</p>
                <p className="text-[11px] text-gray-400 mt-0.5">附上截图 / 步骤更快定位</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
                arrow_forward_ios
              </span>
            </a>

            <p className="text-[11px] text-gray-400 text-center">我们 24h 内回复你</p>

            <button
              onClick={() => setSupportSheetOpen(false)}
              className="w-full mt-4 py-3 rounded-[16px] bg-black/5 text-[13px] font-bold text-gray-600 active:scale-[0.98] transition-transform"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <BottomTabBar />
    </div>
  );
}

// ── TICKET-056 §C — Feedback history (transparent + undo) ─────────────────
interface FeedbackRow {
  id:            string;
  dish_id:       string | null;
  dish_title:    string | null;  // joined from dishes if available
  feedback_type: string;
  locale:        string | null;
  created_at:    string;         // ISO timestamp from PG
}

const FEEDBACK_LABEL: Record<string, string> = {
  rating_good:         '😋 好吃',
  rating_okay:         '😐 一般',
  rating_bad:          '😞 不喜欢',
  cant_understand:     '❓ 看不懂',
  too_hard:            '🥵 太难了',
  missing_ingredient:  '🛒 没材料',
};

function relativeTimeShort(iso: string): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return iso.slice(0, 10);
}

function FeedbackHistorySection() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const uid = getUserId();
        if (!uid) return;
        const { data } = await supabase
          .from('user_feedback_helper')
          .select('id, dish_id, feedback_type, locale, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(50);
        const fbRows = (data ?? []) as Omit<FeedbackRow, 'dish_title'>[];
        // Best-effort dish title join — schema-tolerant. Silent on error.
        const dishIds = Array.from(new Set(fbRows.map(r => r.dish_id).filter(Boolean) as string[]));
        const titleMap = new Map<string, string>();
        if (dishIds.length > 0) {
          try {
            const { data: dishes } = await supabase
              .from('dishes').select('id, title_zh').in('id', dishIds);
            (dishes ?? []).forEach((d: any) => { if (d?.id) titleMap.set(d.id, d.title_zh ?? ''); });
          } catch { /* silent — show '—' for title */ }
        }
        if (!cancelled) {
          setRows(fbRows.map(r => ({ ...r, dish_title: r.dish_id ? (titleMap.get(r.dish_id) ?? '') : null })));
        }
      } catch { /* table missing → empty list */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function handleUndo(rowId: string) {
    try {
      await supabase.from('user_feedback_helper').delete().eq('id', rowId);
      setRows(prev => prev.filter(r => r.id !== rowId));
      setToast('已撤销');
      setTimeout(() => setToast(null), 1800);
    } catch {
      setToast('撤销失败，请稍后再试');
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="bg-white border border-black/5 rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-black/[0.02]">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#FF5A1F' }}>history</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>反馈记录</span>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.40)' }}>透明 · 可撤销</span>
        </div>
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'rgba(0,0,0,0.40)',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>expand_more</span>
      </button>
      {open && (
        <div className="border-t border-black/[0.05] px-3 py-2 max-h-[360px] overflow-y-auto">
          {loading && (
            <p className="text-center py-4" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.40)' }}>加载中…</p>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-center py-4" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.40)' }}>暂无反馈记录</p>
          )}
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-2 border-b border-black/[0.04] last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a1a' }}>
                  {r.dish_title || '(无菜名)'}
                </p>
                <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.45)', marginTop: 1 }}>
                  {FEEDBACK_LABEL[r.feedback_type] ?? r.feedback_type} · {relativeTimeShort(r.created_at)}
                  {r.locale ? ` · ${r.locale}` : ''}
                </p>
              </div>
              <button onClick={() => handleUndo(r.id)}
                className="px-2.5 py-1 rounded-full font-bold active:scale-95"
                style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626', fontSize: 11 }}>
                撤销
              </button>
            </div>
          ))}
          {toast && (
            <p className="text-center py-2" style={{ fontSize: 11, color: '#15803D', fontWeight: 600 }}>
              ✓ {toast}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
