import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import MembershipBenefits from "../components/MembershipBenefits";
import { useSubscription } from "../lib/subscription";
import { useLanguage } from "../contexts/LanguageContext";
import { getUserId } from "../lib/userId";
import { syncProfileToDB } from "../lib/profileSync";
import { isWithinTrial, trialDaysRemaining } from "../lib/userLifecycle";
import ShareCard from "../components/ShareCard";
import LanguageSwitcher from "../components/LanguageSwitcher";

// TICKET-071 §C — LanguageCard 已删除（Home 顶部 chip popover 已覆盖语言切换，
// 避免重复 UI）。Settings 「下发指令语言」section (line ~928) 是菲佣指令语言
// 独立功能，保留。

// ── TICKET-067 §B — ProToolbox removed (跟 /pricing 重复，点 Pro CTA 进去即可看)
//    保留的入口：MembershipCard 的"升级到 Pro"按钮 → /pricing 看详情
//    /banquet / /pro/wellness / /pro/school-balance 路由仍在 App.tsx 不动

// ── 会员中心 单入口卡 (TICKET-052 §G) ──────────────────────────────────────
// 老板拍板"Stripe 已放下"，现阶段不真链 Stripe / 不区分 trial 倒计时，
// 全部用户进 Settings 看见 1 个"💎 会员中心"入口，点开内嵌：
//   1. 大标语 "目前全部免费 · 30 天后再说"
//   2. MembershipBenefits 权限列表 (复用 Pricing 的同 source-of-truth)
//   3. 占位 "敬请期待 · 暂不开放充值"
// 原 MembershipCard (linkTo /pricing) + 同页下方独立 MembershipBenefits
// 块合并为这一个折叠卡。/pricing 路由仍存在 (其他位置仍可进)，本卡不再跳转。
function MembershipHub({ isPro }: { isPro: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 active:bg-black/[0.02] transition-colors text-left">
        <span className="text-[24px]">💎</span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-on-surface">会员中心</p>
          <p className="text-[12px] text-secondary mt-0.5">目前全部免费 · 30 天后再说</p>
        </div>
        <span className="material-symbols-outlined text-secondary/60 text-[20px] transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="border-t border-black/5 px-4 pt-4 pb-5 bg-black/[0.015] space-y-3">
          {/* 大标语 */}
          <div className="rounded-[16px] px-4 py-3 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,140,84,0.10))",
              border: "1px solid rgba(255,90,31,0.20)",
            }}>
            <p className="font-bold text-[15px]" style={{ color: "#B84A0F" }}>🎉 目前全部免费</p>
            <p className="text-[11px] text-secondary mt-1">30 天后再说 · 暂不开放充值</p>
          </div>
          {/* 权限列表 — 复用 source-of-truth；隐 disclaimer 防卡内套卡 disclaimer 重复 */}
          <MembershipBenefits isPro={isPro} hideDisclaimer />
          {/* 占位 — Stripe 放下后给用户一个明确"未来再说"信号 */}
          <p className="text-center text-[11px] text-secondary/60 pt-1">敬请期待 · 升级方案后续上线</p>
        </div>
      )}
    </div>
  );
}

// ── (legacy) Membership entry retained for now in case other pages still
// import it. 当前 Settings.tsx 已切到 MembershipHub，本 fn 不再渲染但保留导出
// 兼容（无外部 import 后可删，本 ticket 不动）。
// TICKET-074 §F — 精简为状态卡：
//   helper → 白色简洁「助理永久免费」
//   paid   → 白色简洁「✨ Pro 会员 · {plan} · 到期 {endsAt}」
//   trial  → 小橙色入口「免费试用 · 剩 X 天 · 看看 Pro →」（精简，非大块推广）
//   expired→ 橙色 CTA「免费版 · 升级 Pro 解锁全部 →」（精简）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MembershipCard() {
  const navigate = useNavigate();
  const { proReason, plan, endsAt } = useSubscription();

  const variant: 'helper' | 'paid' | 'trial' | 'expired' =
    proReason === 'helper' ? 'helper'
    : proReason === 'paid' ? 'paid'
    : isWithinTrial()      ? 'trial'
    :                        'expired';

  const styleMap = {
    helper:  { bg: "white",
               shadow: "0 4px 20px rgba(0,0,0,0.04)",
               textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)",
               border: 'none' },
    paid:    { bg: "white",
               shadow: "0 4px 20px rgba(255,90,31,0.08)",
               textColor: "#1a1a1a", subColor: "rgba(0,0,0,0.45)", chevColor: "rgba(0,0,0,0.30)",
               border: '1px solid rgba(255,90,31,0.20)' },
    trial:   { bg: "white",
               shadow: "0 4px 20px rgba(255,90,31,0.10)",
               textColor: "#1a1a1a", subColor: "#FF5A1F", chevColor: "#FF8C54",
               border: '1px solid rgba(255,90,31,0.25)' },
    expired: { bg: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
               shadow: "0 6px 18px rgba(255,90,31,0.22)",
               textColor: "white", subColor: "rgba(255,255,255,0.85)", chevColor: "rgba(255,255,255,0.80)",
               border: 'none' },
  }[variant];

  const icon  = variant === 'helper' ? '🧑‍🍳'
              : variant === 'paid'   ? '✨'
              : variant === 'trial'  ? '🎁'
              :                        '⭐';

  const title = variant === 'helper' ? '助理永久免费'
              : variant === 'paid'   ? '爱吃 Pro 会员'
              : variant === 'trial'  ? `免费试用中 · 剩 ${trialDaysRemaining()} 天`
              :                        '升级 Pro · 解锁全部';

  const sub = variant === 'helper' ? '家政助理使用爱吃从不收费'
            : variant === 'paid'   ? `${plan === 'pro_yearly' ? '年度' : plan === 'pro_halfyear' ? '半年' : '月度'}${endsAt ? ` · 到期 ${endsAt.toISOString().slice(0,10)}` : ''}`
            : variant === 'trial'  ? '看看 Pro 有什么 →'
            :                        '整周菜单 / 一键采购 / 米其林菜单';

  return (
    <button
      onClick={() => navigate("/pricing")}
      className="w-full rounded-[22px] p-4 text-left transition-all active:scale-[0.98] flex items-center gap-3"
      style={{ background: styleMap.bg, border: styleMap.border, boxShadow: styleMap.shadow }}
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

// TICKET TELEPOT-20260525-039 §3 — extend FamilyMember with spec §1.2's 12 fields.
// Storage still localStorage (`nutri_family_members`) — algo side reads from
// localStorage (see `familyPrefs.ts`); household_members DB has helper_id NOT NULL
// FK→user_profiles which forbids "non-helper family rows" without first inserting
// a synthetic user_profiles row. DB write deferred to a future棒 to keep this
// surgical. All new fields nullable/optional so old persisted entries decode fine.
interface FamilyMember {
  id: string;
  name: string;
  lifeStage: LifeStage;
  needs: string[];
  // ── spec §1.2 个人 12 字段 (除 name 已有, 全部 optional/nullable) ──
  relation?: string;          // self / spouse / son / daughter / father / mother / etc
  gender?: string;            // male / female
  age_years?: number;
  height_cm?: number;
  weight_kg?: number;
  dietary_goal?: string;      // muscle_gain / fat_loss / pregnancy_prep / child_growth / elder_wellness / general
  allergens?: string[];       // seafood / gluten / nuts / milk / eggs / pork / beef / lamb
  chronic_diseases?: string[];// hypertension / diabetes / gout / high_cholesterol
  dietary_mode?: string;      // omnivore / vegetarian / vegan / halal / kosher
  tcm_constitution?: string;  // balanced / qi_deficient / yang_deficient / yin_deficient / phlegm_damp / damp_heat / blood_stasis / special_diathesis
  pregnancy_status?: string;  // none / trying / early / mid / late / breastfeeding
}

// TICKET-039 §3 — spec §1.2 option tables. Single source of truth used by both
// the collapsed-3-info row and the expanded 12-field drawer.
const RELATION_OPTIONS = [
  { id: "self",     label: "我自己", icon: "👤" },
  { id: "spouse",   label: "配偶",   icon: "💑" },
  { id: "son",      label: "儿子",   icon: "👦" },
  { id: "daughter", label: "女儿",   icon: "👧" },
  { id: "father",   label: "父亲",   icon: "👨" },
  { id: "mother",   label: "母亲",   icon: "👩" },
  { id: "etc",      label: "其他",   icon: "👥" },
];
const GENDER_OPTIONS = [
  { id: "male",   label: "男", icon: "♂" },
  { id: "female", label: "女", icon: "♀" },
];
const DIETARY_GOAL_OPTIONS = [
  { id: "general",         label: "日常均衡", icon: "🥗" },
  { id: "muscle_gain",     label: "增肌",     icon: "💪" },
  { id: "fat_loss",        label: "减脂",     icon: "🔥" },
  { id: "pregnancy_prep",  label: "备孕",     icon: "🤰" },
  { id: "child_growth",    label: "学龄增长", icon: "🌱" },
  { id: "elder_wellness",  label: "老人养生", icon: "🍵" },
];
const ALLERGEN_OPTIONS = [
  { id: "seafood", label: "海鲜" },
  { id: "nuts",    label: "坚果" },
  { id: "gluten",  label: "麸质" },
  { id: "milk",    label: "奶" },
  { id: "eggs",    label: "蛋" },
  { id: "pork",    label: "猪" },
  { id: "beef",    label: "牛" },
  { id: "lamb",    label: "羊" },
];
const CHRONIC_OPTIONS = [
  { id: "hypertension",      label: "高血压" },
  { id: "diabetes",          label: "糖尿病" },
  { id: "gout",              label: "痛风" },
  { id: "high_cholesterol",  label: "高胆固醇" },
];
const DIETARY_MODE_OPTIONS = [
  { id: "omnivore",   label: "杂食",       icon: "🍽" },
  { id: "vegetarian", label: "素食(蛋奶)", icon: "🥦" },
  { id: "vegan",      label: "纯素",       icon: "🌱" },
  { id: "halal",      label: "清真",       icon: "🕌" },
  { id: "kosher",     label: "犹太洁食",   icon: "✡" },
];
const TCM_CONSTITUTION_OPTIONS = [
  { id: "balanced",          label: "平和" },
  { id: "qi_deficient",      label: "气虚" },
  { id: "yang_deficient",    label: "阳虚" },
  { id: "yin_deficient",     label: "阴虚" },
  { id: "phlegm_damp",       label: "痰湿" },
  { id: "damp_heat",         label: "湿热" },
  { id: "blood_stasis",      label: "血瘀" },
  { id: "special_diathesis", label: "特禀" },
];
const PREGNANCY_STATUS_OPTIONS = [
  { id: "none",          label: "无" },
  { id: "trying",        label: "备孕" },
  { id: "early",         label: "孕早期" },
  { id: "mid",           label: "孕中期" },
  { id: "late",          label: "孕晚期" },
  { id: "breastfeeding", label: "哺乳期" },
];
// Helper: human-readable label for the collapsed 3-info row
function labelOf<T extends { id: string; label: string }>(opts: T[], id?: string): string {
  if (!id) return "";
  return opts.find(o => o.id === id)?.label ?? id;
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
  const { t4, isChinese } = useLanguage();

  const [members,   setMembers]   = useState<FamilyMember[]>(loadMembers);
  const [openId,    setOpenId]    = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FamilyMember | null>(null);

  // 我的口味 — TICKET-052 §F: 单入口卡 + 多维度 + 200 字自由文本。
  // 原 3 个独立下拉折叠为 1 个 "🎯 我的口味偏好" 入口，展开后同屏显示
  // goal / spice / hometown 三组 chip + taste_pref_free_text textarea
  // (写 user_profiles.taste_pref_free_text，migration 081 已加列).
  const [quickPrefs, setQuickPrefs] = useState<Record<string, string | string[]>>(readQuickPrefs);
  const [tasteOpen, setTasteOpen] = useState(false);
  const pickTaste = (key: keyof typeof TASTE_OPTIONS, value: string) => {
    writeQuickPref(key, value);
    setQuickPrefs(p => ({ ...p, [key]: value }));
  };
  const currentTasteLabel = (key: keyof typeof TASTE_OPTIONS): string => {
    const id = quickPrefs[key];
    const opt = TASTE_OPTIONS[key].find(o => o.id === id);
    return opt ? `${opt.icon} ${opt.label}` : "未设置";
  };

  // 自由文本口味描述（≤ 200 字，写 user_profiles.taste_pref_free_text）
  const [tasteFreeText, setTasteFreeText] = useState<string>("");
  const [tasteFreeSaving, setTasteFreeSaving] = useState(false);
  const [tasteFreeMsg, setTasteFreeMsg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("taste_pref_free_text")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (data) setTasteFreeText(((data as { taste_pref_free_text?: string | null }).taste_pref_free_text) ?? "");
    })();
    return () => { cancelled = true; };
  }, []);
  async function saveTasteFreeText() {
    const uid = getUserId();
    if (!uid) { setTasteFreeMsg("未登录"); return; }
    setTasteFreeSaving(true);
    setTasteFreeMsg(null);
    const trimmed = tasteFreeText.slice(0, 200);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: uid, taste_pref_free_text: trimmed }, { onConflict: "id" });
    setTasteFreeSaving(false);
    if (error) {
      setTasteFreeMsg("保存失败");
      setTimeout(() => setTasteFreeMsg(null), 2000);
    } else {
      setTasteFreeMsg("✓ 已保存");
      setTimeout(() => setTasteFreeMsg(null), 1800);
    }
  }

  // ── TICKET-039 §2 — 算法反推 chip + 手动调抽屉 ────────────────────────────
  // 读 user_profiles 9 字段（spec §1.1 全家层面）显示为只读 chip group
  //   hometown_cuisine / cuisine_preference / spice_tolerance / taste_intensity
  //   cooking_methods_pref / excluded_meats / excluded_ingredients
  //   cooking_frequency_per_week / budget_level
  // 5 个 advanced 字段（cooking_methods_pref / excluded_meats / excluded_ingredients
  // / cooking_frequency_per_week / budget_level）放抽屉里让用户手动覆盖。
  // 前 4 个（hometown_cuisine / cuisine_preference / spice_tolerance /
  // taste_intensity）继续走 onboarding 图片 + intent + QuickSetup 入口写,
  // 这里只 readonly 展示。
  interface ProfileV2 {
    hometown_cuisine?: string | null;
    cuisine_preference?: string | null;
    spice_tolerance?: string | null;
    taste_intensity?: string | null;
    cooking_methods_pref?: string[] | null;
    excluded_meats?: string[] | null;
    excluded_ingredients?: string[] | null;
    cooking_frequency_per_week?: number | null;
    budget_level?: string | null;
  }
  const [profileV2, setProfileV2] = useState<ProfileV2>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedSaving, setAdvancedSaving] = useState(false);
  const [advancedMsg, setAdvancedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("hometown_cuisine, cuisine_preference, spice_tolerance, taste_intensity, cooking_methods_pref, excluded_meats, excluded_ingredients, cooking_frequency_per_week, budget_level")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled || !data) return;
      setProfileV2(data as ProfileV2);
    })();
    return () => { cancelled = true; };
  }, []);

  async function saveAdvancedPrefs(patch: Partial<ProfileV2>) {
    const uid = getUserId();
    if (!uid) { setAdvancedMsg("未登录"); return; }
    setAdvancedSaving(true);
    setAdvancedMsg(null);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: uid, ...patch }, { onConflict: "id" });
    setAdvancedSaving(false);
    if (error) {
      setAdvancedMsg("保存失败");
      setTimeout(() => setAdvancedMsg(null), 2000);
    } else {
      setProfileV2(p => ({ ...p, ...patch }));
      setAdvancedMsg("✓ 已保存");
      setTimeout(() => setAdvancedMsg(null), 1500);
    }
  }

  const [helperName, setHelperName] = useState(() => localStorage.getItem("helperName") || "菲佣");
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
  const [linkCopied, setLinkCopied] = useState(false);
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
  // TICKET-067 §A — 删微信号入口 (PII 隔离 β 阶段邮件兜底)
  const [supportSheetOpen, setSupportSheetOpen] = useState(false);
  // TICKET-066 §B — JS 拼接防爬虫 grep 字面 @nothinkeats.com
  const SUPPORT_EMAIL = ["support", "nothinkeats.com"].join("@");
  // TICKET-045 §D — VIP 专属客服邮箱 (中介推荐用户用)
  const VIP_EMAIL = ["vip", "nothinkeats.com"].join("@");

  // TICKET-063 §A — 个人头像 + 昵称 + role + 家庭成员卡
  // TICKET-039 §1 — 合并 UI-031c: 读 user_profiles.avatar_url + nickname (微信 OAuth fill).
  //   头像优先级: avatar_b64 (用户自传) > avatar_url (微信) > 橙渐变首字母圆
  //   昵称优先级: display_name (用户改) > nickname (微信原始) > userId.slice(0,8)
  const myRole = (typeof window !== "undefined" ? localStorage.getItem("nutri_role") : null) || "employer";
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [myNickname, setMyNickname] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  interface HouseholdHelper { helper_id: string; name: string | null; avatar_b64: string | null; }
  const [householdHelpers, setHouseholdHelpers] = useState<HouseholdHelper[]>([]);

  // TICKET-045 §A — 中介裂变 C+D: 拉用户被推荐的 agency
  //   - C: 头像下方显示 "由 {agency.name} 推荐" 小字 (PDPO 合规: 不展示中介 contact)
  //   - D: 头像右上挂 💎 VIP chip + 联系客服切到 vip@nothinkeats.com
  //   - agencies 表 RLS 已过滤 status='active' (migration 087), pending 自然为 null
  interface ReferringAgency { id: string; name: string; }
  const [agency, setAgency] = useState<ReferringAgency | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("referred_by_agency_id")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      const refId = (profile as { referred_by_agency_id?: string | null } | null)?.referred_by_agency_id;
      if (!refId) { setAgency(null); return; }
      const { data: ag } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", refId)
        .maybeSingle();
      if (cancelled) return;
      setAgency((ag as ReferringAgency | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  // Initial fetch — 自己 profile + 家里已加入的 helpers (employer only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      // 自己 profile — TICKET-039 §1: 加 avatar_url + nickname (微信 OAuth fill 来源).
      const { data: me } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_b64, avatar_url, nickname")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (me) {
        const m = me as { avatar_b64?: string | null; avatar_url?: string | null; display_name?: string | null; nickname?: string | null };
        setMyAvatar(m.avatar_b64 ?? null);
        setMyAvatarUrl(m.avatar_url ?? null);
        setMyDisplayName(m.display_name ?? null);
        setMyNickname(m.nickname ?? null);
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

  // TICKET-066 §D — 客户端限流防同一用户疯狂点客服邮箱 mailto。
  // 5 分钟内 ≥ 3 次 → alert + e.preventDefault 阻挡。仅防普通手滑 / 简单 bot；
  // 真正服务端限流靠 Cloudflare Email Routing destination quota + Gmail filter。
  function onClickSupportMail(e: React.MouseEvent<HTMLAnchorElement>) {
    const KEY = "support_mail_clicks";
    const NOW = Date.now();
    const WINDOW_MS = 5 * 60 * 1000;
    const MAX = 3;
    let arr: number[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) arr = JSON.parse(raw);
    } catch { arr = []; }
    const recent = arr.filter(t => NOW - t < WINDOW_MS);
    if (recent.length >= MAX) {
      e.preventDefault();
      alert("感谢反馈！您 5 分钟内已发起 3 次，请稍后再试。");
      return;
    }
    recent.push(NOW);
    localStorage.setItem(KEY, JSON.stringify(recent));
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

        {/* TICKET-045 §B — Settings 顶部加 LanguageSwitcher (老板拍板已登录用户改语言入口). */}
        <LanguageSwitcher className="fixed top-4 right-4 z-50" />

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
            <label className="relative cursor-pointer active:scale-95 transition-transform inline-block" title="点击更换头像">
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
              {/* TICKET-039 §1: avatar_b64 (用户自传) > avatar_url (微信 OAuth) > 橙渐变首字母 */}
              {(myAvatar || myAvatarUrl) ? (
                <img
                  src={myAvatar || myAvatarUrl || ""}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border-2 border-white"
                  style={{ boxShadow: "0 4px 14px rgba(255,90,31,0.30)" }}
                  onError={(e) => {
                    // 微信 avatar_url 跨域 / 防盗链失败 → 兜底橙圆
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF8C54, #FF5A1F)", boxShadow: "0 4px 14px rgba(255,90,31,0.30)" }}
                >
                  <span className="text-white font-black" style={{ fontSize: 24 }}>
                    {((myDisplayName || myNickname || getUserId() || "你")[0] ?? "你").toUpperCase()}
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
              {/* TICKET-045 §D — VIP chip (仅 referred_by_agency_id 有值时显示) */}
              {agency && (
                <span
                  className="absolute -top-1 -right-1 bg-yellow-400 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow"
                  style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}
                >
                  💎 VIP
                </span>
              )}
            </label>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[16px] truncate">
                {/* TICKET-039 §1: display_name > nickname (微信原始) > userId.slice(0,8) */}
                {myDisplayName || myNickname || (getUserId()?.slice(0, 8) ?? "你")}
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
              {/* TICKET-045 §C — 中介品牌挂名 (PDPO: 仅显示 name, 不展示 contact_whatsapp/email) */}
              {agency && (
                <p className="text-[11px] text-gray-500 mt-1 truncate">由 {agency.name} 推荐</p>
              )}
            </div>
          </div>

          {/* ── 我的口味（单入口） ── TICKET-052 §F
              原 3 个独立下拉折叠为单卡 "🎯 我的口味偏好"，展开后同屏显示
              goal/spice/hometown chip + 200 字自由描述 textarea。
              chip 选中即写 quickPrefs / localStorage / debounce 同步 DB；
              textarea 单独走 saveTasteFreeText 写 user_profiles.
              taste_pref_free_text. */}
          <div className="pt-1">
            <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2">我的口味</p>
            <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
              <button
                onClick={() => setTasteOpen(o => !o)}
                className="w-full flex items-center gap-3 px-5 py-4 active:bg-black/[0.02] transition-colors text-left">
                <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center text-[18px]">🎯</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-on-surface">我的口味偏好</p>
                  <p className="text-[12px] text-secondary mt-0.5 truncate">{(() => {
                    const dims = (["goal", "spice", "hometown"] as const).filter(k => quickPrefs[k]);
                    if (dims.length === 0) return "未设置 · 点开调整 3 项口味 + 自由描述";
                    return `已设置 ${dims.length}/3${tasteFreeText ? " · 有自由描述" : ""}`;
                  })()}</p>
                </div>
                <span className="material-symbols-outlined text-secondary/60 text-[20px] transition-transform duration-200 flex-shrink-0"
                  style={{ transform: tasteOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  expand_more
                </span>
              </button>
              {tasteOpen && (
                <div className="border-t border-black/5 bg-black/[0.015] px-4 pt-4 pb-4 space-y-4">
                  {/* TICKET-039 §2 — 算法反推 chip group (read-only 可视化).
                      数据源 user_profiles 9 字段，由 onboarding 图片选择 + intent +
                      用户行为反推填入。让用户先看到"算法理解了什么"再决定要不要手动调。 */}
                  {(() => {
                    const chips: { icon: string; label: string }[] = [];
                    const p = profileV2;
                    if (p.spice_tolerance) {
                      const m: Record<string, string> = { none: "完全不辣", mild: "微微辣", medium: "中辣", heavy: "重辣" };
                      chips.push({ icon: "🌶", label: m[p.spice_tolerance] ?? p.spice_tolerance });
                    }
                    if (p.taste_intensity) {
                      const m: Record<string, string> = { light: "清淡", medium: "适中", rich: "浓郁" };
                      chips.push({ icon: "🍵", label: m[p.taste_intensity] ?? p.taste_intensity });
                    }
                    if (p.cuisine_preference) {
                      const m: Record<string, string> = { chinese: "中餐", western: "西餐", japanese_korean: "日韩", mixed: "中西混搭" };
                      chips.push({ icon: "🍝", label: m[p.cuisine_preference] ?? p.cuisine_preference });
                    }
                    if (p.hometown_cuisine) {
                      const m: Record<string, string> = {
                        cantonese: "粤菜家乡", sichuan: "川菜家乡", northern: "北方家乡", jiangnan: "江南家乡",
                        hakka: "客家家乡", northwest: "西北家乡", northeast: "东北家乡",
                      };
                      chips.push({ icon: "🏠", label: m[p.hometown_cuisine] ?? `${p.hometown_cuisine}家乡` });
                    }
                    if (Array.isArray(p.excluded_meats) && p.excluded_meats.length > 0) {
                      const meatLabel: Record<string, string> = { pork: "猪", beef: "牛", lamb: "羊", chicken: "鸡", duck: "鸭" };
                      const list = p.excluded_meats.map(m => meatLabel[m] ?? m).join("/");
                      chips.push({ icon: "🥩", label: `不吃${list}` });
                    }
                    if (Array.isArray(p.cooking_methods_pref) && p.cooking_methods_pref.length > 0) {
                      const methodLabel: Record<string, string> = {
                        steam: "蒸", stir_fry: "炒", braise: "炖", boil: "煮", grill: "烤", deep_fry: "炸",
                      };
                      const list = p.cooking_methods_pref.slice(0, 3).map(m => methodLabel[m] ?? m).join("·");
                      chips.push({ icon: "🍳", label: `爱${list}` });
                    }
                    if (p.budget_level) {
                      const m: Record<string, string> = { economy: "实惠", medium: "适中预算", premium: "高端" };
                      chips.push({ icon: "💰", label: m[p.budget_level] ?? p.budget_level });
                    }
                    return (
                      <div className="rounded-[16px] p-3" style={{ background: "rgba(255,90,31,0.04)", border: "1px solid rgba(255,90,31,0.10)" }}>
                        <p className="text-[11px] font-bold mb-2" style={{ color: "#B84A0F" }}>🤖 算法理解到的你</p>
                        {chips.length === 0 ? (
                          <p className="text-[12px] text-secondary leading-relaxed">
                            还没反推到偏好。先去 onboarding 选几道你喜欢的菜，或下方手动调几个字段。
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {chips.map((c, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-white" style={{ color: "#1a1a1a", border: "1px solid rgba(255,90,31,0.20)" }}>
                                <span>{c.icon}</span>{c.label}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[10.5px] text-secondary mt-2 leading-snug">
                          算法根据你的图片选择和使用历史自动反推。
                          <button onClick={() => setAdvancedOpen(o => !o)} className="text-[#FF5A1F] font-bold ml-1 active:opacity-70">
                            想手动调？{advancedOpen ? "收起 ▲" : "点这里 →"}
                          </button>
                        </p>
                      </div>
                    );
                  })()}

                  {/* TICKET-039 §2 — 手动覆盖抽屉 (5 advanced 字段 → user_profiles upsert) */}
                  {advancedOpen && (
                    <div className="rounded-[16px] bg-white border border-black/5 p-3 space-y-4">
                      {/* cooking_methods_pref 多选 chip */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">🍳 烹饪方式 (多选)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: "steam",    label: "蒸" },
                            { id: "stir_fry", label: "炒" },
                            { id: "braise",   label: "炖/焖" },
                            { id: "boil",     label: "煮/汆" },
                            { id: "grill",    label: "烤" },
                            { id: "deep_fry", label: "炸" },
                          ].map(opt => {
                            const arr = profileV2.cooking_methods_pref ?? [];
                            const sel = arr.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  const next = sel ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                                  saveAdvancedPrefs({ cooking_methods_pref: next });
                                }}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {sel && "✓ "}{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* excluded_meats 多选 chip */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">🥩 不吃的肉 (多选)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: "pork",    label: "猪" },
                            { id: "beef",    label: "牛" },
                            { id: "lamb",    label: "羊" },
                            { id: "chicken", label: "鸡" },
                            { id: "duck",    label: "鸭" },
                          ].map(opt => {
                            const arr = profileV2.excluded_meats ?? [];
                            const sel = arr.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  const next = sel ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                                  saveAdvancedPrefs({ excluded_meats: next });
                                }}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {sel && "✓ "}{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* excluded_ingredients 多选 chip */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">🚫 食材忌口 (多选)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: "bitter_melon", label: "苦瓜" },
                            { id: "eggplant",     label: "茄子" },
                            { id: "cilantro",     label: "香菜" },
                            { id: "tofu",         label: "豆腐" },
                            { id: "green_onion",  label: "葱" },
                            { id: "ginger",       label: "姜" },
                            { id: "garlic",       label: "蒜" },
                          ].map(opt => {
                            const arr = profileV2.excluded_ingredients ?? [];
                            const sel = arr.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  const next = sel ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                                  saveAdvancedPrefs({ excluded_ingredients: next });
                                }}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {sel && "✓ "}{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* cooking_frequency_per_week slider 1-7 */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">
                          📅 每周做菜天数 · <span className="text-primary">{profileV2.cooking_frequency_per_week ?? "—"}</span>
                          <span className="opacity-60 ml-1">天 (剩下外卖)</span>
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={7}
                          step={1}
                          value={profileV2.cooking_frequency_per_week ?? 4}
                          onChange={e => saveAdvancedPrefs({ cooking_frequency_per_week: parseInt(e.target.value, 10) })}
                          className="w-full accent-[#FF5A1F]"
                        />
                      </div>

                      {/* budget_level 单选 */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">💰 食材预算定位</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: "economy", label: "实惠", icon: "💸" },
                            { id: "medium",  label: "适中", icon: "💰" },
                            { id: "premium", label: "高端", icon: "💎" },
                          ].map(opt => {
                            const sel = profileV2.budget_level === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => saveAdvancedPrefs({ budget_level: opt.id })}
                                className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-2xl border-[1.5px] active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[#FF5A1F]" : "bg-white border-black/5"
                                }`}>
                                <span className="text-[18px]">{opt.icon}</span>
                                <span className={`text-[11px] font-semibold ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 保存状态 */}
                      {(advancedSaving || advancedMsg) && (
                        <p className="text-[11px] text-center font-bold" style={{ color: advancedMsg?.startsWith("✓") ? "#16A34A" : "#B84A0F" }}>
                          {advancedSaving ? "保存中…" : advancedMsg}
                        </p>
                      )}
                    </div>
                  )}

                  {(Object.keys(TASTE_OPTIONS) as (keyof typeof TASTE_OPTIONS)[]).map(key => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2 px-1">
                        {TASTE_ICONS[key]} {TASTE_LABELS[key]} · <span className="opacity-60">{currentTasteLabel(key)}</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {TASTE_OPTIONS[key].map(opt => {
                          const sel = quickPrefs[key] === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => pickTaste(key, opt.id)}
                              className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-2xl active:scale-95 transition-all ${
                                sel ? "bg-[#FF5A1F]/10 border-[1.5px] border-[#FF5A1F]" : "bg-white border-[1.5px] border-black/5"
                              }`}>
                              <span className="text-[18px]">{opt.icon}</span>
                              <span className={`text-[11px] font-semibold ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {/* 200-char free-text taste description */}
                  <div>
                    <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2 px-1">
                      ✍️ 还想告诉我们 · 最多 200 字
                    </label>
                    <textarea
                      value={tasteFreeText}
                      onChange={e => setTasteFreeText(e.target.value.slice(0, 200))}
                      placeholder="例：爱吃江浙菜 · 不吃花椒 · 牛羊肉每周不超过 2 次 …"
                      rows={4}
                      maxLength={200}
                      className="w-full bg-white border border-black/5 rounded-[14px] px-3 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary resize-none"
                    />
                    <div className="flex items-center justify-between mt-1.5 px-1">
                      <span className="text-[10px] text-secondary/60">{tasteFreeText.length}/200</span>
                      <button
                        onClick={saveTasteFreeText}
                        disabled={tasteFreeSaving}
                        className="px-3 py-1 rounded-full text-[11px] font-bold active:scale-95 transition-all"
                        style={{
                          background: tasteFreeSaving ? "rgba(0,0,0,0.08)" : "#FF5A1F",
                          color: tasteFreeSaving ? "#888" : "white",
                        }}>
                        {tasteFreeSaving ? "保存中…" : tasteFreeMsg ?? "保存自由描述"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2 pt-3">家庭成员档案</p>

          {/* ── Member cards — TICKET-039 §3 重构 ──
              默认显示 头像 + 名字 + 关系 + 健康目标 (3 核心信息)
              点开抽屉显示 spec §1.2 完整 12 字段
              删除按钮带 confirm dialog
              数据存 localStorage `nutri_family_members` (算法侧 familyPrefs.ts
              同款读取)，DB 写 household_members 待后续棒 (helper_id NOT NULL FK
              约束阻挡 "非 helper 家人 row"，schema 升级走另一 ticket). */}
          {members.map((m, idx) => {
            const isOpen = openId === m.id;
            const stage  = getStageStyle(m.lifeStage);
            const draft  = isOpen ? editDraft : null;

            // 显示用 helpers (collapsed row 3 核心)
            const relLabel  = labelOf(RELATION_OPTIONS, m.relation);
            const goalLabel = labelOf(DIETARY_GOAL_OPTIONS, m.dietary_goal);

            return (
              <div key={m.id} className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden">

                {/* Card header row — 3 核心信息: 头像 / 名字 / 关系 + 健康目标 */}
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
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[16px] font-black text-on-surface">{m.name || "新成员"}</span>
                      {relLabel && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/[0.05] text-secondary">
                          {relLabel}
                        </span>
                      )}
                      {/* lifeStage chip 保留 (兼容老数据) */}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                        {stage.emoji} {m.lifeStage}
                      </span>
                    </div>
                    {goalLabel ? (
                      <p className="text-[12px] text-secondary truncate">🎯 {goalLabel}{m.needs.length > 0 ? ` · ${m.needs.slice(0, 2).join(" · ")}` : ""}</p>
                    ) : m.needs.length > 0 ? (
                      <p className="text-[12px] text-secondary truncate">{m.needs.join(" · ")}</p>
                    ) : (
                      <p className="text-[12px] text-secondary/40">点击完善 12 字段档案</p>
                    )}
                  </div>
                  <span
                    className="material-symbols-outlined text-secondary/60 text-xl flex-shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  >
                    expand_more
                  </span>
                </button>

                {/* Inline editor — spec §1.2 完整 12 字段抽屉 */}
                {isOpen && draft && (
                  <div className="border-t border-black/5 px-5 pb-5">
                    <div className="pt-4 space-y-5">

                      {/* 1. name */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">姓名 / 称呼</label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={e => setEditDraft(prev => prev ? { ...prev, name: e.target.value } : prev)}
                          placeholder="妈妈 / 爸爸 / 小明…"
                          className="w-full bg-[#f5f5f7] border border-black/5 rounded-[14px] px-4 py-3 text-[15px] font-bold text-on-surface outline-none focus:border-primary transition-colors"
                        />
                      </div>

                      {/* 2. relation */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">关系</label>
                        <div className="grid grid-cols-4 gap-2">
                          {RELATION_OPTIONS.map(opt => {
                            const sel = draft.relation === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setEditDraft(prev => prev ? { ...prev, relation: opt.id } : prev)}
                                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-[12px] border-[1.5px] active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[#FF5A1F]" : "bg-black/[0.02] border-transparent"
                                }`}>
                                <span className="text-[16px]">{opt.icon}</span>
                                <span className={`text-[11px] font-semibold ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3. gender */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">性别</label>
                        <div className="grid grid-cols-2 gap-2">
                          {GENDER_OPTIONS.map(opt => {
                            const sel = draft.gender === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setEditDraft(prev => prev ? { ...prev, gender: opt.id } : prev)}
                                className={`py-2.5 rounded-[12px] border-[1.5px] text-[13px] font-bold active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[#FF5A1F] text-[#FF5A1F]" : "bg-black/[0.02] border-transparent text-secondary"
                                }`}>
                                <span className="text-[16px] mr-1">{opt.icon}</span>{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4-6. age / height / weight (3 列 number) */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">年龄</label>
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={draft.age_years ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              setEditDraft(prev => prev ? { ...prev, age_years: v === "" ? undefined : parseInt(v, 10) } : prev);
                            }}
                            placeholder="—"
                            className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-3 py-2.5 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">身高 cm</label>
                          <input
                            type="number"
                            min={0}
                            max={250}
                            value={draft.height_cm ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              setEditDraft(prev => prev ? { ...prev, height_cm: v === "" ? undefined : parseInt(v, 10) } : prev);
                            }}
                            placeholder="—"
                            className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-3 py-2.5 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1.5">体重 kg</label>
                          <input
                            type="number"
                            min={0}
                            max={300}
                            step={0.1}
                            value={draft.weight_kg ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              setEditDraft(prev => prev ? { ...prev, weight_kg: v === "" ? undefined : parseFloat(v) } : prev);
                            }}
                            placeholder="—"
                            className="w-full bg-[#f5f5f7] border border-black/5 rounded-[12px] px-3 py-2.5 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      {/* 7. dietary_goal */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">健康目标</label>
                        <div className="grid grid-cols-3 gap-2">
                          {DIETARY_GOAL_OPTIONS.map(opt => {
                            const sel = draft.dietary_goal === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setEditDraft(prev => prev ? { ...prev, dietary_goal: opt.id } : prev)}
                                className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-[12px] border-[1.5px] active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[#FF5A1F]" : "bg-black/[0.02] border-transparent"
                                }`}>
                                <span className="text-[18px]">{opt.icon}</span>
                                <span className={`text-[11px] font-semibold ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 8. allergens (硬过滤) */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">过敏原 (多选 · 硬过滤)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {ALLERGEN_OPTIONS.map(opt => {
                            const arr = draft.allergens ?? [];
                            const sel = arr.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  const next = sel ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                                  setEditDraft(prev => prev ? { ...prev, allergens: next } : prev);
                                }}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-red-50 text-red-600 border-red-200" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {sel && "✓ "}{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 9. chronic_diseases */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">慢病情况 (多选)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {CHRONIC_OPTIONS.map(opt => {
                            const arr = draft.chronic_diseases ?? [];
                            const sel = arr.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  const next = sel ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                                  setEditDraft(prev => prev ? { ...prev, chronic_diseases: next } : prev);
                                }}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {sel && "✓ "}{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 10. dietary_mode */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">饮食模式</label>
                        <div className="grid grid-cols-3 gap-2">
                          {DIETARY_MODE_OPTIONS.map(opt => {
                            const sel = draft.dietary_mode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setEditDraft(prev => prev ? { ...prev, dietary_mode: opt.id } : prev)}
                                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-[12px] border-[1.5px] active:scale-95 transition-all ${
                                  sel ? "bg-[#FF5A1F]/10 border-[#FF5A1F]" : "bg-black/[0.02] border-transparent"
                                }`}>
                                <span className="text-[16px]">{opt.icon}</span>
                                <span className={`text-[10.5px] font-semibold leading-tight ${sel ? "text-[#FF5A1F]" : "text-secondary"}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 11. tcm_constitution */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">中医体质 (8 选 1)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {TCM_CONSTITUTION_OPTIONS.map(opt => {
                            const sel = draft.tcm_constitution === opt.id;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setEditDraft(prev => prev ? { ...prev, tcm_constitution: opt.id } : prev)}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                  sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                }`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 12. pregnancy_status (女性才显示) */}
                      {draft.gender === "female" && (
                        <div>
                          <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">怀孕状态</label>
                          <div className="flex flex-wrap gap-1.5">
                            {PREGNANCY_STATUS_OPTIONS.map(opt => {
                              const sel = draft.pregnancy_status === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => setEditDraft(prev => prev ? { ...prev, pregnancy_status: opt.id } : prev)}
                                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all active:scale-95 ${
                                    sel ? "bg-primary/10 text-primary border-primary/30" : "bg-black/[0.03] text-secondary border-transparent"
                                  }`}>
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* lifeStage (兼容老算法 — getEatingMembers 仍读此字段) */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">生命阶段 (兼容老算法)</label>
                        <div className="grid grid-cols-3 gap-2">
                          {LIFE_STAGES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => setEditDraft(prev => prev ? { ...prev, lifeStage: s.value } : prev)}
                              className={`flex flex-col items-center py-2 rounded-[12px] border-[1.5px] transition-all active:scale-95 ${
                                draft.lifeStage === s.value
                                  ? `border-primary ${s.bg}`
                                  : "border-black/[0.08] bg-black/[0.02]"
                              }`}
                            >
                              <span className="text-xl mb-0.5">{s.emoji}</span>
                              <span className={`text-[11px] font-bold ${draft.lifeStage === s.value ? "text-primary" : "text-secondary"}`}>
                                {s.value}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* legacy needs tags (保留 — 算法 familyPrefs 仍读 needs 数组) */}
                      <div>
                        <label className="block text-[11px] font-bold text-secondary uppercase tracking-wider mb-3">额外标签 (兼容老算法)</label>
                        {NEED_GROUPS.map(({ group, tags }) => (
                          <div key={group} className="mb-3">
                            <p className="text-[11px] text-secondary/50 font-semibold mb-1.5">{group}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {tags.map(tag => {
                                const sel = draft.needs.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    onClick={() => toggleNeed(tag)}
                                    className={`px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border transition-all active:scale-[0.96] ${
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

                      {/* Remove with confirm */}
                      {members.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`确定移除「${m.name || "此成员"}」？不可撤销。`)) removeMember(m.id);
                          }}
                          className="w-full py-2 text-[13px] font-semibold text-red-400 active:scale-[0.98] transition-transform"
                        >
                          🗑 移除此成员
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
            <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-wider px-1 mb-2">做饭辅助</p>

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

              {/* Row 5 — WhatsApp 邀请按钮 (TICKET-068 §D — link 升级为
                  ?invite= 闭环，菲佣点 link → /login?invite=XXX 自动 helper
                  tab + 预填邀请码框) */}
              <button
                onClick={() => {
                  const link = inviteCode
                    ? `${window.location.origin}/login?invite=${inviteCode}`
                    : `${window.location.origin}/login?role=helper`;
                  const text = encodeURIComponent(
                    `Hi ${helperName}! I'm using Aieats to plan our family meals — tap this link to join (no Facebook needed):\n\n${link}\n\n你好 ${helperName}！我用爱吃 Aieats 管理家里的菜单，点这个链接直接进入。`
                  );
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
                className="w-full py-3 rounded-[14px] text-[14px] font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white" }}
              >
                <span style={{ fontSize: 16 }}>📲</span>
                发给 {helperName || "工人姐姐"} / Send to helper
              </button>

              {/* TICKET-068 §D — 复制链接兜底按钮（WhatsApp 跳转失败时用） */}
              <button
                onClick={async () => {
                  const link = inviteCode
                    ? `${window.location.origin}/login?invite=${inviteCode}`
                    : `${window.location.origin}/login?role=helper`;
                  try {
                    await navigator.clipboard.writeText(link);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 1800);
                  } catch { /* clipboard blocked */ }
                }}
                className="w-full py-2 rounded-[12px] text-[13px] font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                style={{ background: "rgba(0,0,0,0.04)", color: "#333" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {linkCopied ? "check_circle" : "link"}
                </span>
                {linkCopied ? "已复制 / Copied" : "复制链接 / Copy link"}
              </button>

              {/* TICKET-067 §C — 小美料理机 toggle 并入做饭辅助卡（原独立 card 已删）*/}
              <div className="h-px bg-black/5" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                    <span className="text-[18px]">🤖</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-on-surface">我有小美料理机</p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {hasXiaomei ? '小美能做的菜会被优先推荐 + 标记 🤖' : '关闭时不影响排菜'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleHasXiaomei}
                  className="relative w-12 h-6 rounded-full transition-all flex-shrink-0"
                  style={{ background: hasXiaomei ? '#FF5A1F' : 'rgba(0,0,0,0.12)' }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: hasXiaomei ? '26px' : '2px' }}
                  />
                </button>
              </div>
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

          {/* TICKET-071 §C — Language picker 已删除（Home 顶部 chip popover 覆盖） */}

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

          {/* ── 会员中心 (TICKET-052 §G) — 单入口折叠卡替代原 MembershipCard +
              MembershipBenefits 双块布局。点开内嵌 "目前全部免费 · 30 天后
              再说" 大标语 + 权限列表 + 敬请期待占位 (不再跳 /pricing). */}
          <MembershipHub isPro={proReason === 'paid' || proReason === 'helper'} />

          {/* TICKET-067 §C — 独立 小美料理机 toggle card 已删除，并入"做饭辅助"分组卡 */}

          {/* TICKET-031 §B — 推广 Aieats 卡 (老板拍板拓客起点) */}
          <section className="bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 20 }}>🎁</span>
              <h3 className="font-bold" style={{ fontSize: 15, color: '#1a1a1a' }}>
                {isChinese ? '推广 Aieats' : 'Share Aieats'}
              </h3>
            </div>
            <p className="mb-3 leading-snug" style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
              {isChinese
                ? '把链接发给朋友，一起省心做饭。WhatsApp / 微信 / 朋友圈都可以。'
                : 'Send the link to friends. Works in WhatsApp / WeChat / Moments.'}
            </p>
            <ShareCard />
          </section>

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

          {/* TICKET-061 §A — 联系客服 (β 反馈通道)
              TICKET-045 §D — VIP 用户 (referred_by_agency_id ≠ null) 切到「📞 联系专属客服」
              入口 + 进 sheet 后 mailto 走 vip@nothinkeats.com */}
          <button
            onClick={() => setSupportSheetOpen(true)}
            className="w-full bg-white border border-black/5 rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <span className="text-[24px]">{agency ? "📞" : "📩"}</span>
            <div className="flex-1 text-left">
              <p className="font-bold text-[14px]">{agency ? "联系专属客服" : "联系客服"}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {agency ? "💎 VIP 专属通道 · 优先处理" : "用 app 遇问题 / 反馈 / 报 bug"}
              </p>
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
            <h3 className="text-[16px] font-bold mb-1">{agency ? "💎 联系专属客服" : "联系客服"}</h3>
            <p className="text-[12px] text-gray-500 mb-4">
              {agency
                ? `VIP 专属通道 · 优先处理 (由 ${agency.name} 推荐)`
                : "用 app 遇到问题？告诉我们，我们 24h 内回复你。"}
            </p>

            {/* TICKET-045 §D — agency 用户走 VIP_EMAIL */}
            <a
              href={`mailto:${agency ? VIP_EMAIL : SUPPORT_EMAIL}?subject=${encodeURIComponent(agency ? "[Aieats VIP 反馈]" : "[Aieats β 反馈]")}&body=${encodeURIComponent("用户ID: " + (getUserId()?.slice(0, 8) ?? "unknown") + "\n\n问题描述：\n")}`}
              onClick={onClickSupportMail}
              className="w-full bg-gray-50 border border-black/5 rounded-[16px] p-4 flex items-center gap-3 active:scale-[0.98] transition-all mb-2.5"
            >
              <span className="text-[22px]">📧</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-[13px]">发邮件反馈</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{agency ? VIP_EMAIL : SUPPORT_EMAIL}</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
                arrow_forward_ios
              </span>
            </a>

            <a
              href={`mailto:${agency ? VIP_EMAIL : SUPPORT_EMAIL}?subject=${encodeURIComponent(agency ? "[Aieats VIP Bug]" : "[Aieats β Bug]")}&body=${encodeURIComponent("用户ID: " + (getUserId()?.slice(0, 8) ?? "unknown") + "\n\nbug 复现步骤：\n1. \n2. \n3. \n\n期望行为：\n\n实际行为：\n\n截图：\n")}`}
              onClick={onClickSupportMail}
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
