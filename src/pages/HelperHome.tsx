/**
 * HelperHome — domestic helper task dashboard (English only)
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import { useLanguage } from "../contexts/LanguageContext";

interface DayDish {
  title?: string;
  title_zh?: string;
  img?: string;
  image_url?: string;
  meal_type?: string;  // 'lunch' | 'dinner' | 'breakfast' — for grouping
}

type DishesByMeal = {
  breakfast: DayDish[];
  lunch:     DayDish[];
  dinner:    DayDish[];
};

// Task list — labels resolved at render time so we can pick zh / en / tl.
// `tl` strings are the Tagalog wording a Filipino domestic helper would
// recognize on a kitchen task card.
function buildTasks(t3: (en: string, zh: string, tl: string) => string) {
  return [
    {
      id: "shopping",
      icon: "fact_check",
      label: t3("Check Ingredients at Home", "检查家中食材", "Suriin ang mga sangkap sa bahay"),
      desc:  t3("Tick off what's already in the pantry",
                "勾出家里已经有的",
                "Lagyan ng tsek ang mga nasa kusina na"),
      gradient: "linear-gradient(135deg, #FF5A1F, #FF9054)",
      shadow: "rgba(255,90,31,0.35)",
      route: "/verify",
    },
    {
      id: "prep",
      icon: "menu_book",
      label: t3("Prep Steps", "备菜步骤", "Mga Hakbang sa Paghahanda"),
      desc:  t3("How to prepare & portion ingredients",
                "如何备料 / 切配",
                "Paano ihanda at hatiin ang sangkap"),
      gradient: "linear-gradient(135deg, #6C5CE7, #a29bfe)",
      shadow: "rgba(108,92,231,0.35)",
      route: "/prep",
    },
    {
      id: "cook",
      icon: "soup_kitchen",
      label: t3("Start Cooking", "开始烹饪", "Simulan ang Pagluluto"),
      desc:  t3("Step-by-step guide · Voice control",
                "一步步指引 · 语音控制",
                "Hakbang-hakbang · Kontrol sa boses"),
      gradient: "linear-gradient(135deg, #00B4D8, #0077B6)",
      shadow: "rgba(0,180,216,0.35)",
      route: "/cook",
    },
    {
      id: "community",
      icon: "groups",
      label: t3("Cooking Community", "厨艺社区", "Komunidad ng Pagluluto"),
      desc:  t3("Share your dishes · Earn Friday rewards",
                "分享菜品 · 周五领奖励",
                "Ibahagi ang pagkain · Premyo tuwing Biyernes"),
      gradient: "linear-gradient(135deg, #f7971e, #ffd200)",
      shadow: "rgba(255,210,0,0.35)",
      route: "/community",
    },
  ];
}

export default function HelperHome() {
  const navigate = useNavigate();
  const { t3, isTagalog, isChinese, language, setLanguage, cycleLanguageForRole } = useLanguage();
  const TASKS = buildTasks(t3);

  // Helper view never uses Chinese — if a stale appLanguage from a prior
  // employer session leaked in, snap to English on mount. Saves the worker
  // from having to click the cycle pill to escape Chinese.
  useEffect(() => {
    if (language === 'zh' || language === 'zh-Hant') {
      setLanguage('en');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Short chip label for the top-right language toggle. Helper sees only
  // EN / Tagalog / Indo, never 中文.
  const langChip = language === 'tl' ? 'TL'
                 : language === 'id' ? 'ID'
                 : 'EN';
  const [dishes, setDishes] = useState<DayDish[]>([]);
  const [dishesByMeal, setDishesByMeal] = useState<DishesByMeal>({
    breakfast: [], lunch: [], dinner: [],
  });
  const [helperName, setHelperName] = useState("");
  const [isLinked, setIsLinked] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeDone, setCodeDone] = useState(false);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12
    ? t3("Good morning", "早上好", "Magandang umaga")
    : hour < 17
    ? t3("Good afternoon", "下午好", "Magandang hapon")
    : t3("Good evening", "晚上好", "Magandang gabi");

  // Locale-appropriate date string.
  const dateLocale = isChinese ? "zh-HK" : isTagalog ? "fil-PH" : "en-HK";
  const dateLabel = now.toLocaleDateString(dateLocale, {
    weekday: "long", month: "long", day: "numeric",
  });

  useEffect(() => {
    // Fast path: any locally-cached menu (employer-saved from a previous bind
    // session OR a self-test). We replace this with the real employer pull
    // below once binding is confirmed.
    const raw = localStorage.getItem("generatedMenu");
    if (raw) {
      try { setDishes(JSON.parse(raw)); } catch { /* ignore */ }
    }

    const userId = getUserId();
    if (!userId) return;

    supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle()
      .then(({ data }) => { if ((data as any)?.display_name) setHelperName((data as any).display_name); });

    // Bind status + pull the employer's menu. Three-step query because
    // helper has no direct foreign key to households.user_weekly_menus:
    //   1. helper.user_id → household_members.helper_id → household_id
    //   2. household_id → households.employer_id
    //   3. employer_id → user_weekly_menus today's dinner dish_ids
    //   4. dish_ids → dishes (title, image, course_type, prep/cook steps)
    (async () => {
      // 1. Find the helper's active household membership
      const { data: member } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("helper_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: false })
        .limit(1);
      const householdId = (member?.[0] as any)?.household_id;
      if (!householdId) return;
      setIsLinked(true);

      // 2. Resolve household → employer
      const { data: hh } = await supabase
        .from("households")
        .select("employer_id")
        .eq("id", householdId)
        .maybeSingle();
      const employerId = (hh as any)?.employer_id;
      if (!employerId) return;

      // 3. Today's saved menu for the employer. user_weekly_menus is keyed by
      // (user_id, week_start, day_index, meal_type). Monday-start week + JS
      // Date getDay() (Sun=0 → 6, Mon=1 → 0, etc.).
      const today = new Date();
      const dow = (today.getDay() + 6) % 7; // 0 = Mon
      const monday = new Date(today);
      monday.setDate(today.getDate() - dow);
      const weekStart = monday.toISOString().slice(0, 10);

      const { data: menuRows } = await supabase
        .from("user_weekly_menus")
        .select("meal_type, dish_ids, swapped_dish_ids")
        .eq("user_id", employerId)
        .eq("week_start", weekStart)
        .eq("day_index", dow);

      if (!menuRows || menuRows.length === 0) return;

      // Collect dish_ids per meal type — preferring swapped_dish_ids when
      // the employer swapped a dish. We keep the meal-type grouping so the
      // helper sees "午餐 5 道 + 晚餐 6 道" instead of a flat list of 11.
      const byMeal: Record<string, string[]> = { breakfast: [], lunch: [], dinner: [] };
      for (const m of menuRows as any[]) {
        const ids: string[] = (m.swapped_dish_ids?.length ? m.swapped_dish_ids : m.dish_ids) ?? [];
        if (byMeal[m.meal_type]) byMeal[m.meal_type].push(...ids);
      }
      const allIds = [...byMeal.breakfast, ...byMeal.lunch, ...byMeal.dinner];
      if (allIds.length === 0) return;

      // 4. Fetch dish detail (one round trip for all meals)
      const { data: dishRows } = await supabase
        .from("dishes")
        .select("id, title_zh, title_en, image_url, course_type, meal_type")
        .in("id", allIds);

      const idMap = new Map((dishRows ?? []).map((d: any) => [d.id, d]));
      const resolve = (ids: string[]) => ids.map(id => idMap.get(id)).filter(Boolean) as DayDish[];

      const byMealResolved: DishesByMeal = {
        breakfast: resolve(byMeal.breakfast).map(d => ({ ...d, meal_type: 'breakfast' })),
        lunch:     resolve(byMeal.lunch).map(d => ({ ...d, meal_type: 'lunch' })),
        dinner:    resolve(byMeal.dinner).map(d => ({ ...d, meal_type: 'dinner' })),
      };
      const flatOrdered = [
        ...byMealResolved.breakfast,
        ...byMealResolved.lunch,
        ...byMealResolved.dinner,
      ];
      if (flatOrdered.length === 0) return;

      setDishesByMeal(byMealResolved);
      setDishes(flatOrdered);  // keep flat list for legacy dish-count display
      // Mirror to localStorage so HelperPrep / HelperCook (which still read
      // from generatedMenu) light up too. Includes meal_type so those pages
      // can group too once they're updated.
      localStorage.setItem("generatedMenu", JSON.stringify(flatOrdered));
    })();
  }, []);

  async function handleJoinHousehold() {
    const code = codeInput.trim();
    if (code.length !== 6) { setCodeError("Please enter a 6-digit code"); return; }
    const userId = getUserId();
    if (!userId) { setCodeError("Please sign in first"); return; }

    setCodeLoading(true);
    setCodeError("");

    // Find household by invite code
    const { data: hh } = await supabase
      .from("households")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!hh) {
      setCodeError("Code not found. Ask your employer for the correct code.");
      setCodeLoading(false);
      return;
    }

    // Join the household
    const { error } = await supabase
      .from("household_members")
      .upsert({ household_id: hh.id, helper_id: userId, status: "active" }, { onConflict: "household_id,helper_id" });

    if (error) {
      setCodeError("Something went wrong. Please try again.");
    } else {
      setIsLinked(true);
      setCodeDone(true);
      setShowCodeInput(false);
    }
    setCodeLoading(false);
  }

  function handleInvite() {
    const url = `${window.location.origin}/signin?role=helper`;
    const text = encodeURIComponent(
      `Hey! I use Aieats to manage cooking for my employer — shopping list, prep steps, voice cooking guide. Join me and earn rewards every Friday! ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#0a0a0a", paddingBottom: 40 }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(37,211,102,0.12) 0%, transparent 55%)",
      }} />

      {/* Header */}
      <div className="relative z-10 px-5 pt-14 pb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)" }}>{greeting}</p>
            <h1 className="font-serif font-black text-white mt-0.5" style={{ fontSize: 28 }}>
              {helperName || t3("My Tasks", "我的任务", "Mga Gawain Ko")}
            </h1>
          </div>
          {/* Language toggle — helper cycle is EN → Tagalog → Indonesian.
              Replaces the old non-interactive support_agent icon. */}
          <button
            onClick={cycleLanguageForRole}
            className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(37,211,102,0.15)", border: "1.5px solid rgba(37,211,102,0.3)" }}
            title="EN / Tagalog / Indonesian"
            aria-label="Switch language">
            <span className="font-black text-[#25D366]" style={{ fontSize: 14, letterSpacing: '0.04em' }}>
              {langChip}
            </span>
          </button>
        </div>

        {/* Date + dish count */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <span className="material-symbols-outlined text-white/40" style={{ fontSize: 14 }}>calendar_today</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{dateLabel}</span>
          <span className="ml-auto" style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
            {dishes.length > 0
              ? t3(`${dishes.length} dishes today`, `今日 ${dishes.length} 道菜`, `${dishes.length} ulam ngayon`)
              : t3("No menu yet", "还没有菜单", "Wala pang menu")}
          </span>
        </div>
      </div>

      {/* Today's dishes — grouped by meal (breakfast / 午餐 / 晚餐).
          Each section scrolls horizontally and shows the dish count next
          to the label, so the helper knows e.g. "5 道午餐 / 6 道晚餐". */}
      {dishes.length > 0 && (
        <div className="relative z-10 px-5 mb-5 space-y-3">
          {([
            { key: 'breakfast', label: t3('BREAKFAST', '早餐', 'AGAHAN') },
            { key: 'lunch',     label: t3('LUNCH',     '午餐', 'TANGHALIAN') },
            { key: 'dinner',    label: t3('DINNER',    '晚餐', 'HAPUNAN') },
          ] as const).map(({ key, label }) => {
            const list = dishesByMeal[key];
            if (!list || list.length === 0) return null;
            return (
              <div key={key}>
                <div className="flex items-baseline gap-2 mb-2">
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.10em", fontWeight: 700 }}>
                    {label}
                  </p>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>
                    {list.length} {t3(list.length > 1 ? 'dishes' : 'dish', '道', 'ulam')}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {list.map((dish, i) => (
                    <div key={`${key}-${i}`} className="flex-shrink-0 rounded-xl overflow-hidden relative"
                      style={{ width: 80, height: 80 }}>
                      <img
                        src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"}
                        alt={dish.title || dish.title_zh}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"; }}
                      />
                      <div className="absolute inset-0"
                        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)" }} />
                      <p className="absolute bottom-1 left-1.5 right-1.5 text-white font-semibold leading-tight"
                        style={{ fontSize: 10 }}>
                        {dish.title || dish.title_zh}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Household link banner */}
      <div className="relative z-10 px-5 mb-4">
        {codeDone ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)" }}>
            <span className="material-symbols-outlined text-[#25D366]" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p style={{ fontSize: 13, color: "#25D366", fontWeight: 600 }}>
              {t3("Linked to employer's household! 🎉",
                  "已绑定雇主家庭 🎉",
                  "Nakaugnay na sa employer! 🎉")}
            </p>
          </div>
        ) : isLinked ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.15)" }}>
            <span className="material-symbols-outlined text-[#25D366]" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>link</span>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              {t3("Connected to employer household",
                  "已连接雇主家庭",
                  "Konektado sa employer")}
            </p>
          </div>
        ) : showCodeInput ? (
          <div className="flex flex-col gap-2 px-4 py-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
              {t3("Enter the 6-digit code from your employer:",
                  "输入雇主的 6 位邀请码：",
                  "Ilagay ang 6-digit code mula sa employer:")}
            </p>
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-xl px-4 py-2.5 font-black text-center tracking-[0.25em]"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 20, outline: "none" }}
              />
              <button
                onClick={handleJoinHousehold}
                disabled={codeLoading || codeInput.length !== 6}
                className="px-4 rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                style={{ background: "#25D366", fontSize: 13 }}>
                {codeLoading ? "..." : t3("Join", "加入", "Sumali")}
              </button>
            </div>
            {codeError && <p style={{ fontSize: 11, color: "#ff6b6b" }}>{codeError}</p>}
            <button onClick={() => setShowCodeInput(false)} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              {t3("Cancel", "取消", "Kanselahin")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCodeInput(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}>
            <span className="material-symbols-outlined text-white/30" style={{ fontSize: 18 }}>link</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
              {t3("Enter employer invite code", "输入雇主邀请码", "Ilagay ang employer invite code")}
            </p>
            <span className="ml-auto" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>›</span>
          </button>
        )}
      </div>

      {/* Task cards */}
      <div className="relative z-10 px-5 flex flex-col gap-3 mb-6">
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
          {t3("TODAY'S TASKS", "今日任务", "MGA GAWAIN NGAYON")}
        </p>
        {TASKS.map(task => (
          <button
            key={task.id}
            onClick={() => navigate(task.route)}
            className="w-full flex items-center gap-4 p-5 rounded-3xl transition-all active:scale-[0.97]"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: task.gradient, boxShadow: `0 6px 20px ${task.shadow}` }}>
              <span className="material-symbols-outlined text-white"
                style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>{task.icon}</span>
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-white" style={{ fontSize: 16 }}>{task.label}</p>
              <p className="mt-0.5" style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{task.desc}</p>
            </div>
            <span className="material-symbols-outlined text-white/20" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
        ))}
      </div>

      {/* Invite friends */}
      <div className="relative z-10 px-5 mb-4">
        <button
          onClick={handleInvite}
          className="w-full py-4 rounded-2xl flex items-center gap-3 active:scale-[0.98] transition-all"
          style={{ background: "rgba(37,211,102,0.09)", border: "1px solid rgba(37,211,102,0.2)" }}
        >
          <span style={{ fontSize: 22 }}>📲</span>
          <div className="flex-1 text-left">
            <p className="font-semibold text-white" style={{ fontSize: 13 }}>
              {t3("Invite helper friends", "邀请其他工人朋友", "Mag-imbita ng kaibigang helper")}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {t3("Share via WhatsApp · Earn 50 pts per referral",
                  "WhatsApp 分享 · 每位 50 分",
                  "WhatsApp · 50 puntos kada imbita")}
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-full font-bold text-white text-[12px]"
            style={{ background: "#25D366" }}>
            {t3("Share", "分享", "Ibahagi")}
          </div>
        </button>
      </div>

      {/* Switch account */}
      <div className="relative z-10 flex justify-center">
        <button
          onClick={() => { localStorage.removeItem("nutri_role"); navigate("/signin"); }}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.18)" }}
        >
          {t3("Switch account", "切换账号", "Lumipat ng account")}
        </button>
      </div>
    </div>
  );
}
