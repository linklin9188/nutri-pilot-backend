/**
 * HelperHome — TICKET-041 P1 §2 dashboard 化.
 *
 * 老板痛点 (2026-05-25 凌晨): helper 主页要像雇主 home 一样 dashboard,
 * 下面底部 5 TAB 切换功能.
 *
 * 5 区块 (从上到下):
 *   1. 顶部 hero      — 头像 (avatar_url/nickname) + 时段问候 + "今日 N 道菜"
 *                       + 国籍 chip + 右上 ⚙️ + 语言切换
 *   2. 今日任务       — 拉今天菜单 3-5 个任务卡 (菜名 / 预计时间 / 状态),
 *                       点跳 /cook?dish_id=xxx
 *   3. 今日菜单       — 早/午/晚餐 3 卡 grid (菜数 + 缩略图)
 *   4. 社区动态       — helper_posts 最新 3 帖横滑, 点跳 /helper-community
 *   5. 积分卡片占位   — "我的积分: --" + 邀请朋友赚积分 (TODO: 1000 用户后开)
 *
 * 页面底部 <HelperTabBar active="home" />.
 *
 * 老 HelperHome 保留的关键逻辑 (没丢):
 *   - household_members 三步绑定查询 (helper_id → household → employer →
 *     user_weekly_menus → dishes), TICKET-009 console.warn 留 diagnose
 *   - TICKET-052 §H 国籍 onboarding (只问 PH / ID 一次), 已答收口入 hero chip
 *   - 邀请码加入 household (handleJoinHousehold)
 *   - 切换账号 (登出 nutri_role + 回 /login)
 *
 * 老 task 卡 (任务/做菜/采购/社区) 删掉 — 5 TAB bar 已经把这 4 入口固化在
 * footer, 中间区域改用 dashboard section. 厨艺社区 task tile 改成顶级
 * "社区动态" section, 数据真渲染.
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import { useLanguage } from "../contexts/LanguageContext";
import { getDishTitle } from "../lib/dishTitleI18n";
import HelperTabBar from "../components/HelperTabBar";
import HelperFamilyPrefsCard from "../components/HelperFamilyPrefsCard";
// TICKET-076 §Phase 3-5 — 备菜时间反推 + Web Notification 提醒
import { loadTodayCookSchedule, type DayCookSchedule } from "../lib/cookSchedule";
import { setDailyMealTime, dateToISODay } from "../lib/dailyMealSchedule";
import { loadHelperHouseholdId } from "../lib/helperEmployerMenu";

interface DayDish {
  id?: string;
  title?: string;
  title_zh?: string;
  title_en?: string;
  img?: string;
  image_url?: string;
  meal_type?: string;
  // cooking duration if joined from dishes table (minutes); fallback ~15 in render.
  cook_time_min?: number | null;
}

type DishesByMeal = {
  breakfast: DayDish[];
  lunch:     DayDish[];
  dinner:    DayDish[];
};

interface PostMini {
  id: string;
  title: string | null;
  body: string;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  helper_id: string;
  user_profiles?: { display_name: string | null } | null;
}

export default function HelperHome() {
  const navigate = useNavigate();
  const { t3, isTagalog, isChinese, language, setLanguage, cycleLanguageForRole } = useLanguage();

  // Helper view never uses Chinese — if a stale appLanguage from a prior
  // employer session leaked in, snap to English on mount.
  useEffect(() => {
    if (language === 'zh' || language === 'zh-Hant') {
      setLanguage('en');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const langChip = language === 'tl' ? 'TL'
                 : language === 'id' ? 'ID'
                 : 'EN';

  const [dishes, setDishes] = useState<DayDish[]>([]);
  const [dishesByMeal, setDishesByMeal] = useState<DishesByMeal>({
    breakfast: [], lunch: [], dinner: [],
  });
  const [helperName, setHelperName] = useState("");
  const [helperNickname, setHelperNickname] = useState<string | null>(null);
  const [helperAvatarUrl, setHelperAvatarUrl] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeDone, setCodeDone] = useState(false);

  // TICKET-052 §H — origin country (PH/ID) prompt. undefined=未拉取, null/''=未填(显prompt), 'PH'/'ID'=已填(隐 + 顶部 chip).
  const [originCountry, setOriginCountry] = useState<string | null | undefined>(undefined);
  const [savingOrigin, setSavingOrigin] = useState(false);

  // §4 社区动态 — helper_posts 最新 3 帖
  const [communityPosts, setCommunityPosts] = useState<PostMini[]>([]);

  // §2 今日任务 — track pending/cooking/done. 仅 client-side, refresh 清零
  // (做菜状态后续 ticket 接 user_cook_logs 真持久化, 这版先用 localStorage
  // 占位 key=helper_task_done:<dishId>).
  const [taskDone, setTaskDone] = useState<Set<string>>(new Set());

  // TICKET-076 §Phase 4 — 今日备菜时间表 (雇主 lunch_time / dinner_time + 菜单 cook_time_min 反推)
  const [schedule, setSchedule] = useState<DayCookSchedule | null>(null);
  // §Phase 5 — Web Notification 权限. 'unsupported' = 浏览器不支持 Notification API (graceful degrade, 只显 UI 不挂)
  type NotifState = 'unsupported' | 'default' | 'granted' | 'denied';
  const [notifPerm, setNotifPerm] = useState<NotifState>('unsupported');

  // TICKET-082 §Phase 6 — 菲佣视角改"开饭"时间 (开做/备菜反推, 不能直接改).
  //   helper householdId 拉一次, time picker bottom sheet 写
  //   household_meal_schedule (set_by='helper') 后 reload cookSchedule.
  const [helperHouseholdId, setHelperHouseholdId] = useState<string | null>(null);
  const [editMeal, setEditMeal] = useState<'lunch' | 'dinner' | null>(null);
  const [editTimeInput, setEditTimeInput] = useState('19:00');
  const [editBusy, setEditBusy] = useState(false);
  useEffect(() => {
    const uid = getUserId();
    if (!uid) return;
    loadHelperHouseholdId(uid).then(setHelperHouseholdId);
  }, []);
  function openMealEditor(meal: 'lunch' | 'dinner') {
    const current = meal === 'lunch'
      ? (schedule?.lunch?.eatTime ?? '12:00')
      : (schedule?.dinner?.eatTime ?? '19:00');
    setEditTimeInput(current);
    setEditMeal(meal);
  }
  async function saveMealEdit() {
    if (!editMeal || !helperHouseholdId) return;
    setEditBusy(true);
    try {
      const today = dateToISODay(new Date());
      await setDailyMealTime(helperHouseholdId, today, editMeal, editTimeInput, 'helper');
      // reload 开做 / 备菜反推
      const uid = getUserId();
      if (uid) {
        const fresh = await loadTodayCookSchedule(uid);
        setSchedule(fresh);
      }
      setEditMeal(null);
    } catch (e) {
      console.warn('[HelperHome] save meal time error:', e);
    } finally {
      setEditBusy(false);
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12
    ? t3("Good morning", "早上好", "Magandang umaga")
    : hour < 17
    ? t3("Good afternoon", "下午好", "Magandang hapon")
    : t3("Good evening", "晚上好", "Magandang gabi");

  const dateLocale = isChinese ? "zh-HK" : isTagalog ? "fil-PH" : "en-HK";
  const dateLabel = now.toLocaleDateString(dateLocale, {
    weekday: "long", month: "long", day: "numeric",
  });

  useEffect(() => {
    // taskDone hydrate (localStorage helper_task_done:<dishId> = '1')
    try {
      const next = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('helper_task_done:') && localStorage.getItem(k) === '1') {
          next.add(k.replace('helper_task_done:', ''));
        }
      }
      if (next.size > 0) setTaskDone(next);
    } catch { /* ignore */ }

    // Fast path: any locally-cached menu (employer-saved or self-test).
    const raw = localStorage.getItem("generatedMenu");
    if (raw) {
      try { setDishes(JSON.parse(raw)); } catch { /* ignore */ }
    }

    const userId = getUserId();
    if (!userId) return;

    // §1 hero profile — display_name + nickname + avatar_url + origin_country (5 字段一拉)
    supabase.from("user_profiles")
      .select("display_name, nickname, avatar_url, origin_country")
      .eq("id", userId).maybeSingle()
      .then(({ data }) => {
        const d = data as { display_name?: string | null; nickname?: string | null; avatar_url?: string | null; origin_country?: string | null } | null;
        if (d?.display_name) setHelperName(d.display_name);
        if (d?.nickname) setHelperNickname(d.nickname);
        if (d?.avatar_url) setHelperAvatarUrl(d.avatar_url);
        setOriginCountry(d?.origin_country ?? null);
      })
      .catch(() => { setOriginCountry(null); });

    // §4 社区动态 — TICKET-044 §B "近期热门" mock smart push:
    //   过去 7 天 + like_count desc 取 3 帖 (区别原 created_at desc, 给 helper
    //   看见高赞内容刺激活跃度).
    //   TODO: 真协同过滤推荐 ("跟你国籍/角色相似的 helpers 在看什么")
    //         推到后续 ticket. 当前 like_count desc + 近 7 天 = 近期热门 mock.
    //   失败静默 (D 兜底: 没数据隐 section).
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('helper_posts')
      .select('id, title, body, image_url, like_count, comment_count, helper_id, user_profiles(display_name)')
      .gte('created_at', sevenDaysAgoIso)
      .order('like_count', { ascending: false, nullsFirst: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setCommunityPosts(data as unknown as PostMini[]);
      })
      .catch(() => { /* silent — 没社区帖就隐藏 section */ });

    // 三步绑定查询 + 拉雇主菜单 (保留 TICKET-009 console.warn diagnose 路径)
    (async () => {
      // 1. helper's active household membership
      const { data: member, error: memberErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("helper_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: false })
        .limit(1);
      if (memberErr) console.warn("[HelperHome] household_members fetch error:", memberErr);
      const householdId = (member?.[0] as any)?.household_id;
      if (!householdId) {
        console.warn("[HelperHome] no household_members row for helper_id=", userId,
                     "(Smell 3: helper_id uuid vs string mismatch or Login upsert RLS-denied)");
        return;
      }
      setIsLinked(true);

      // 2. household → employer
      const { data: hh, error: hhErr } = await supabase
        .from("households")
        .select("employer_id")
        .eq("id", householdId)
        .maybeSingle();
      if (hhErr) console.warn("[HelperHome] households fetch error:", hhErr);
      const employerId = (hh as any)?.employer_id;
      if (!employerId) {
        console.warn("[HelperHome] household has no employer_id, household_id=", householdId);
        return;
      }

      // 3. Today's saved menu
      const today = new Date();
      const dow = (today.getDay() + 6) % 7; // 0 = Mon
      const monday = new Date(today);
      monday.setDate(today.getDate() - dow);
      const weekStart = monday.toISOString().slice(0, 10);

      const { data: menuRows, error: menuErr } = await supabase
        .from("user_weekly_menus")
        .select("meal_type, dish_ids, swapped_dish_ids")
        .eq("user_id", employerId)
        .eq("week_start", weekStart)
        .eq("day_index", dow);

      if (menuErr) console.warn("[HelperHome] user_weekly_menus fetch error:", menuErr);
      if (!menuRows || menuRows.length === 0) {
        console.warn("[HelperHome] employer", employerId, "has no menu for", weekStart, "dow=", dow,
                     "— employer 尚未生成本周菜单");
        return;
      }

      const byMeal: Record<string, string[]> = { breakfast: [], lunch: [], dinner: [] };
      for (const m of menuRows as any[]) {
        const ids: string[] = (m.swapped_dish_ids?.length ? m.swapped_dish_ids : m.dish_ids) ?? [];
        if (byMeal[m.meal_type]) byMeal[m.meal_type].push(...ids);
      }
      const allIds = [...byMeal.breakfast, ...byMeal.lunch, ...byMeal.dinner];
      if (allIds.length === 0) return;

      // 4. dish detail (title / image / meal_type + cook_time_min for §2 任务 ETA)
      const { data: dishRows } = await supabase
        .from("dishes")
        .select("id, title_zh, title_en, image_url, course_type, meal_type, cook_time_min")
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
      setDishes(flatOrdered);
      localStorage.setItem("generatedMenu", JSON.stringify(flatOrdered));
    })();

    // TICKET-076 §Phase 4 — 拉今日备菜时间表 (独立于上面 dishes 拉取, 复用 lib/cookSchedule 内的
    // helperEmployerMenu, 多一次 SELECT 代价可忽略且解耦更清晰).
    loadTodayCookSchedule(userId).then(setSchedule).catch(err => {
      console.warn('[HelperHome] cook schedule fetch error:', err);
    });

    // TICKET-076 §Phase 5a — Notification API 探测 (Safari iOS / 旧浏览器无 API → 'unsupported' graceful degrade)
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission as NotifState);
    }
  }, []);

  // TICKET-076 §Phase 5c — setInterval 每分钟检查; 命中 startCookTime 推一次通知.
  // tag 防同一时刻重弹; 后台标签页 throttle 到 ~1/min 仍能触发 (前台 / 锁屏锁着也能弹).
  // 真后台用 service worker 更稳, 本 ticket 不做 SW.
  useEffect(() => {
    if (!schedule) return;
    if (notifPerm !== 'granted') return;
    if (typeof Notification === 'undefined') return;

    const tick = () => {
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      if (schedule.lunch && schedule.lunch.startCookTime === nowStr) {
        try {
          new Notification(
            t3('Time to start lunch!', '该开始做午饭了!', 'Oras na para magluto ng tanghalian!'),
            {
              body: t3(`Eat at ${schedule.lunch.eatTime}`, `预计 ${schedule.lunch.eatTime} 开饭`, `Kumain sa ${schedule.lunch.eatTime}`),
              tag: 'cook-reminder-lunch',
            }
          );
        } catch { /* ignore */ }
      }
      if (schedule.dinner && schedule.dinner.startCookTime === nowStr) {
        try {
          new Notification(
            t3('Time to start dinner!', '该开始做晚饭了!', 'Oras na para magluto ng hapunan!'),
            {
              body: t3(`Eat at ${schedule.dinner.eatTime}`, `预计 ${schedule.dinner.eatTime} 开饭`, `Kumain sa ${schedule.dinner.eatTime}`),
              tag: 'cook-reminder-dinner',
            }
          );
        } catch { /* ignore */ }
      }
    };
    // 进页面立刻跑一次 (如果用户恰好开页时已到点)
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  // 不依赖 t3 (语言切换不重建 timer); schedule + notifPerm 变才重建.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, notifPerm]);

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setNotifPerm(result as NotifState);
      if (result === 'granted') {
        try {
          new Notification(t3('Reminders enabled', '提醒已开启', 'Naka-enable ang paalala'));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  async function handleJoinHousehold() {
    const code = codeInput.trim();
    if (code.length !== 6) { setCodeError("Please enter a 6-digit code"); return; }
    const userId = getUserId();
    if (!userId) { setCodeError("Please sign in first"); return; }

    setCodeLoading(true);
    setCodeError("");

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

  async function saveOriginCountry(code: "PH" | "ID") {
    const uid = getUserId();
    if (!uid) return;
    setSavingOrigin(true);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: uid, origin_country: code }, { onConflict: "id" });
    setSavingOrigin(false);
    if (!error) setOriginCountry(code);
  }

  function toggleTaskDone(dishId: string) {
    setTaskDone(prev => {
      const next = new Set(prev);
      if (next.has(dishId)) {
        next.delete(dishId);
        localStorage.removeItem(`helper_task_done:${dishId}`);
      } else {
        next.add(dishId);
        localStorage.setItem(`helper_task_done:${dishId}`, '1');
      }
      return next;
    });
  }

  // §1 头像 — avatar_url 优先, fallback 橙渐变首字母圆
  const displayLabel = helperNickname || helperName || (t3("My Tasks", "我的任务", "Mga Gawain Ko") as string);
  const initial = (displayLabel || "?").trim().charAt(0).toUpperCase();

  // §3 今日菜单 (3 卡 grid) data
  const mealCards: Array<{ key: 'breakfast' | 'lunch' | 'dinner'; label: string; emoji: string }> = [
    { key: 'breakfast', label: t3('Breakfast', '早餐', 'Agahan'),     emoji: '🥐' },
    { key: 'lunch',     label: t3('Lunch',     '午餐', 'Tanghalian'), emoji: '🍱' },
    { key: 'dinner',    label: t3('Dinner',    '晚餐', 'Hapunan'),    emoji: '🍲' },
  ];

  // §2 任务卡 — 取今天 3-5 道(优先 lunch + dinner 前置, 按 meal 顺序排)
  const taskDishes = dishes
    .filter(d => d.id && (d.title_zh || d.title_en || d.title))
    .slice(0, 5);

  // TICKET-076 §Phase 4d — 给每道菜算 "N 分钟后做" / "现在做"
  // 早饭没 schedule (lib/cookSchedule 不算 breakfast), 返回 null 不显标签.
  function dishTimeBadge(dish: DayDish): { text: string; urgent: boolean } | null {
    if (!schedule) return null;
    const meal = dish.meal_type;
    const sched = meal === 'lunch' ? schedule.lunch : meal === 'dinner' ? schedule.dinner : null;
    if (!sched) return null;
    const [h, m] = sched.startCookTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const nowDate = new Date();
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const diff = startMin - nowMin;
    if (diff <= 0 && diff > -120) {
      // 已到点 / 过去 2 小时内 — "现在做"
      return { text: t3('Now', '现在做', 'Ngayon na'), urgent: true };
    }
    if (diff > 0 && diff <= 240) {
      // 4 小时内 — "N min later"
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      const text = hours > 0
        ? t3(`${hours}h ${mins}m later`, `${hours}小时${mins}分钟后`, `${hours}h ${mins}m mamaya`)
        : t3(`${mins}m later`, `${mins} 分钟后`, `${mins}m mamaya`);
      return { text, urgent: diff <= 30 };
    }
    return null;
  }

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#FEF7E5", paddingBottom: 96, color: "#1a1a1a" }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.06) 0%, transparent 55%)",
      }} />

      {/* ─────────────── §1 顶部 Hero ─────────────── */}
      <div className="relative z-10 px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* 头像: avatar_url (微信/上传) > 橙渐变首字母圆 */}
            {helperAvatarUrl ? (
              <img
                src={helperAvatarUrl}
                alt={displayLabel}
                className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
                style={{ border: '1.5px solid rgba(255,90,31,0.25)' }}
                onError={e => {
                  // 微信 avatar 跨域/防盗链失败 → 隐藏 img, fallback 由父级第二个 if 兜底是不行的, 直接换 background
                  (e.target as HTMLImageElement).style.display = 'none';
                  setHelperAvatarUrl(null);
                }}
              />
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black"
                style={{
                  background: 'linear-gradient(135deg, #FF5A1F, #FF9054)',
                  fontSize: 24,
                  boxShadow: '0 4px 12px rgba(255,90,31,0.30)',
                }}
              >
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{greeting}</p>
              <h1 className="font-serif font-black mt-0.5 truncate" style={{ fontSize: 22, color: "#1a1a1a" }}>
                {displayLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                  {dishes.length > 0
                    ? t3(`${dishes.length} dishes today`, `今日 ${dishes.length} 道菜`, `${dishes.length} ulam ngayon`)
                    : t3("No menu yet", "还没有菜单", "Wala pang menu")}
                </span>
                {/* 国籍 chip — 仅在 PH / ID 已答时显, 替代 origin onboarding card */}
                {originCountry === 'PH' || originCountry === 'ID' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.20)" }}>
                    <span style={{ fontSize: 11 }}>{originCountry === 'PH' ? '🇵🇭' : '🇮🇩'}</span>
                    <span style={{ fontSize: 10, color: "rgba(0,0,0,0.65)", fontWeight: 600 }}>
                      {originCountry === 'PH' ? 'PH' : 'ID'}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {/* Right cluster — 设置 + 语言 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate("/helper-settings")}
              className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
              style={{ background: "rgba(0,0,0,0.05)", border: "1.5px solid rgba(0,0,0,0.08)" }}
              title="Settings"
              aria-label="Settings"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "rgba(0,0,0,0.65)" }}>settings</span>
            </button>
            <button
              onClick={cycleLanguageForRole}
              className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
              style={{ background: "rgba(37,211,102,0.15)", border: "1.5px solid rgba(37,211,102,0.3)" }}
              title="EN / Tagalog / Indonesian"
              aria-label="Switch language">
              <span className="font-black text-[#25D366]" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                {langChip}
              </span>
            </button>
          </div>
        </div>

        {/* Date strip */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(0,0,0,0.04)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(0,0,0,0.45)" }}>calendar_today</span>
          <span style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{dateLabel}</span>
        </div>
      </div>

      {/* TICKET-094 — 雇主家偏好卡 (chat-driven, household 维度共享).
          雇主在 Home chat 答的偏好通过 user_chat_preferences.household_id
          自动同步给菲佣这边显示. 没绑 household / 没偏好 → 卡自动 null. */}
      {isLinked && helperHouseholdId && (
        <HelperFamilyPrefsCard
          householdId={helperHouseholdId}
          helperUserId={getUserId() ?? ''}
        />
      )}

      {/* ─────── TICKET-076 §Phase 4 — 做菜时间计划卡 ───────
          雇主在 Settings 设了 lunch_time / dinner_time, 这里反推开做时间 + 备菜时间.
          lunch / dinner 各一块; 没菜或菜单未生成则隐 (D 兜底).
          §Phase 5 — 通知权限按钮: 仅 default 状态显, granted/denied/unsupported 隐. */}
      {(schedule?.lunch || schedule?.dinner) && (
        <div className="relative z-10 mx-5 mb-4 px-4 py-4 rounded-2xl"
          style={{ background: "rgba(255,237,213,0.85)", border: "1px solid rgba(255,90,31,0.25)" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#FF5A1F" }}>schedule</span>
            <p className="font-bold" style={{ fontSize: 13, color: "#1a1a1a" }}>
              {t3('Cook plan today', '今日做菜计划', 'Plano ng pagluluto ngayon')}
            </p>
          </div>
          <div className="space-y-3">
            {schedule?.lunch && (
              <div className="rounded-xl px-3 py-2.5"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
                <p className="font-bold mb-1.5" style={{ fontSize: 12, color: "#1a1a1a" }}>
                  🍱 {t3('Lunch', '午饭', 'Tanghalian')}
                </p>
                <div className="space-y-0.5" style={{ fontSize: 11 }}>
                  <div className="flex justify-between items-center">
                    <span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Eat at', '开饭', 'Kumain')}</span>
                    <button onClick={() => openMealEditor('lunch')}
                      disabled={!helperHouseholdId}
                      className="inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40">
                      <span className="font-bold">{schedule.lunch.eatTime}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: "rgba(255,90,31,0.7)" }}>edit</span>
                    </button>
                  </div>
                  <div className="flex justify-between"><span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Start cooking', '开做', 'Magluto')}</span><span className="font-black" style={{ color: "#FF5A1F" }}>{schedule.lunch.startCookTime}</span></div>
                  <div className="flex justify-between"><span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Start prep', '备菜', 'Maghanda')}</span><span>{schedule.lunch.startPrepTime}</span></div>
                </div>
              </div>
            )}
            {schedule?.dinner && (
              <div className="rounded-xl px-3 py-2.5"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
                <p className="font-bold mb-1.5" style={{ fontSize: 12, color: "#1a1a1a" }}>
                  🍲 {t3('Dinner', '晚饭', 'Hapunan')}
                </p>
                <div className="space-y-0.5" style={{ fontSize: 11 }}>
                  <div className="flex justify-between items-center">
                    <span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Eat at', '开饭', 'Kumain')}</span>
                    <button onClick={() => openMealEditor('dinner')}
                      disabled={!helperHouseholdId}
                      className="inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40">
                      <span className="font-bold">{schedule.dinner.eatTime}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: "rgba(255,90,31,0.7)" }}>edit</span>
                    </button>
                  </div>
                  <div className="flex justify-between"><span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Start cooking', '开做', 'Magluto')}</span><span className="font-black" style={{ color: "#FF5A1F" }}>{schedule.dinner.startCookTime}</span></div>
                  <div className="flex justify-between"><span style={{ color: "rgba(0,0,0,0.55)" }}>{t3('Start prep', '备菜', 'Maghanda')}</span><span>{schedule.dinner.startPrepTime}</span></div>
                </div>
              </div>
            )}
          </div>
          {/* §Phase 5b — 通知权限按钮 (仅 default 状态显) */}
          {notifPerm === 'default' && (
            <button
              onClick={requestNotifPermission}
              className="w-full mt-3 py-2 rounded-xl font-bold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              style={{ background: "#FF5A1F", fontSize: 12 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>notifications</span>
              {t3('Enable cooking reminders', '开启做饭提醒', 'I-enable ang paalala sa pagluluto')}
            </button>
          )}
          {notifPerm === 'granted' && (
            <p className="text-center mt-2" style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>
              {t3('Reminders on', '提醒已开启', 'Naka-enable ang paalala')}
            </p>
          )}
          {notifPerm === 'denied' && (
            <p className="text-center mt-2" style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>
              {t3('Reminders blocked in browser settings', '浏览器已禁通知, 请在系统设置开启', 'Naka-block ang paalala sa browser')}
            </p>
          )}
        </div>
      )}

      {/* ─────── 国籍 onboarding card (仅未答时) ─────── */}
      {originCountry === null || originCountry === "" ? (
        <div className="relative z-10 mx-5 mb-4 px-4 py-4 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,90,31,0.20)", boxShadow: "0 4px 14px rgba(255,90,31,0.10)" }}>
          <p className="font-bold mb-2.5" style={{ fontSize: 14, color: "#1a1a1a" }}>
            {t3("Where are you from?", "你来自哪里？", "Saan ka galing?")}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => saveOriginCountry("PH")}
              disabled={savingOrigin}
              className="rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-95 transition-all"
              style={{ background: "rgba(0, 56, 168, 0.08)", border: "1.5px solid rgba(0, 56, 168, 0.25)" }}>
              <span style={{ fontSize: 28 }}>🇵🇭</span>
              <span className="font-bold" style={{ fontSize: 12, color: "#1a1a1a" }}>
                {t3("Philippines", "菲律宾", "Pilipinas")}
              </span>
            </button>
            <button
              onClick={() => saveOriginCountry("ID")}
              disabled={savingOrigin}
              className="rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-95 transition-all"
              style={{ background: "rgba(206, 17, 38, 0.08)", border: "1.5px solid rgba(206, 17, 38, 0.25)" }}>
              <span style={{ fontSize: 28 }}>🇮🇩</span>
              <span className="font-bold" style={{ fontSize: 12, color: "#1a1a1a" }}>
                {t3("Indonesia", "印度尼西亚", "Indonesia")}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ─────────────── §2 今日任务 ─────────────── */}
      <div className="relative z-10 px-5 mb-5">
        <p className="mb-2.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", letterSpacing: "0.10em", fontWeight: 700 }}>
          {t3("TODAY'S TASKS", "今日任务", "MGA GAWAIN NGAYON")}
        </p>
        {/* D 兜底: 没今日菜单 → "今天还没安排菜单, 去看雇主的菜单 →" */}
        {taskDishes.length === 0 ? (
          <button
            onClick={() => navigate('/cook')}
            className="w-full px-4 py-5 rounded-2xl flex items-center gap-3 active:scale-[0.98] transition-all text-left"
            style={{ background: "rgba(0,0,0,0.04)", border: "1px dashed rgba(0,0,0,0.15)" }}
          >
            <span style={{ fontSize: 28 }}>📋</span>
            <div className="flex-1">
              <p className="font-semibold" style={{ fontSize: 13, color: "#1a1a1a" }}>
                {t3("No menu scheduled today", "今天还没安排菜单", "Walang menu ngayon")}
              </p>
              <p className="mt-0.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                {t3("Tap to view the employer's menu →", "去看雇主的菜单 →", "Tingnan ang menu ng employer →")}
              </p>
            </div>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {taskDishes.map((dish, i) => {
              const title = getDishTitle(dish, language) || `Dish ${i + 1}`;
              const done = dish.id ? taskDone.has(dish.id) : false;
              const eta = dish.cook_time_min ?? 15;
              // TICKET-076 §Phase 4d — "X 分钟后做" 副标签 (只 lunch/dinner; breakfast 返回 null)
              const timeBadge = dishTimeBadge(dish);
              return (
                <div
                  key={dish.id || i}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}
                >
                  {/* Checkbox-like status pill */}
                  <button
                    onClick={() => {
                      if (!dish.id) return;
                      const wasDone = taskDone.has(dish.id);
                      toggleTaskDone(dish.id);
                      // TICKET-095 reactive 3 — cook 完成 → 写 love_keyword.
                      // 老板拍板 "cook 完成 X 做得怎样? confidence 调整". 这里直接
                      // 当 love 信号写 (confidence 0.7), 不弹问框. 重复 toggle 仅首次
                      // 触发 (wasDone=false → true 时); 取消勾 (true → false) 不撤销
                      // 信号 (因为菜实际可能已做了).
                      if (!wasDone) {
                        import('../lib/chatPreferenceExtractor').then(m =>
                          m.trackCookCompleted(dish, helperHouseholdId)
                        ).catch(() => {});
                      }
                    }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
                    style={{
                      background: done ? "#25D366" : "rgba(255,90,31,0.10)",
                      border: `1.5px solid ${done ? "#25D366" : "rgba(255,90,31,0.30)"}`,
                    }}
                    aria-label={done ? "Mark not done" : "Mark done"}
                  >
                    {done ? (
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#FF5A1F", fontWeight: 800 }}>{i + 1}</span>
                    )}
                  </button>
                  <button
                    onClick={() => navigate(`/cook?dish_id=${dish.id}`)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0 active:scale-[0.99] transition-transform"
                  >
                    {dish.image_url || dish.img ? (
                      <img
                        src={dish.image_url || dish.img}
                        alt={title}
                        className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(0,0,0,0.05)" }}>
                        <span style={{ fontSize: 18 }}>🍳</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${done ? 'line-through text-gray-400' : ''}`}
                        style={{ fontSize: 14, color: done ? "rgba(0,0,0,0.4)" : "#1a1a1a" }}>
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>schedule</span>
                        <span style={{ fontSize: 10, color: "rgba(0,0,0,0.5)" }}>
                          ~{eta} {t3('min', '分钟', 'minuto')}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded-full"
                          style={{
                            background: done ? 'rgba(37,211,102,0.12)'
                                       : 'rgba(255,90,31,0.10)',
                            fontSize: 9,
                            fontWeight: 700,
                            color: done ? '#25D366' : '#FF5A1F',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {done
                            ? t3('DONE',     '已完成', 'TAPOS')
                            : t3('PENDING',  '待做',   'PENDING')}
                        </span>
                        {/* TICKET-076 §Phase 4d — "现在做" / "N 分钟后做" 标签 */}
                        {!done && timeBadge && (
                          <span
                            className="px-1.5 py-0.5 rounded-full"
                            style={{
                              background: timeBadge.urgent ? 'rgba(220,38,38,0.10)' : 'rgba(0,0,0,0.05)',
                              fontSize: 9,
                              fontWeight: 700,
                              color: timeBadge.urgent ? '#DC2626' : 'rgba(0,0,0,0.55)',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {timeBadge.text}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 18, color: "rgba(0,0,0,0.3)" }}>chevron_right</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────── §3 今日菜单 (3 卡 grid) ─────────────── */}
      {dishes.length > 0 && (
        <div className="relative z-10 px-5 mb-5">
          <p className="mb-2.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", letterSpacing: "0.10em", fontWeight: 700 }}>
            {t3("TODAY'S MENU", "今日菜单", "MENU NGAYON")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {mealCards.map(meal => {
              const list = dishesByMeal[meal.key];
              const count = list?.length ?? 0;
              const cover = list?.[0]?.image_url || list?.[0]?.img;
              return (
                <button
                  key={meal.key}
                  onClick={() => navigate('/cook')}
                  className="rounded-2xl overflow-hidden text-left active:scale-95 transition-transform"
                  style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}
                >
                  <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                    {cover ? (
                      <img src={cover} alt={meal.label} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.04)" }}>
                        <span style={{ fontSize: 28 }}>{meal.emoji}</span>
                      </div>
                    )}
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)" }} />
                    <div className="absolute bottom-1.5 left-2 right-2">
                      <p className="text-white font-bold leading-tight" style={{ fontSize: 11 }}>{meal.label}</p>
                    </div>
                  </div>
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <span style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>
                      {count} {t3(count === 1 ? 'dish' : 'dishes', '道', 'ulam')}
                    </span>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>chevron_right</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────── §4 社区动态 — TICKET-044 §B 近期热门 mock smart push ─────────────── */}
      {communityPosts.length > 0 && (
        <div className="relative z-10 px-5 mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", letterSpacing: "0.10em", fontWeight: 700 }}>
                {t3("COMMUNITY", "社区动态", "KOMUNIDAD")}
              </p>
              {/* 🔥 chip — 区分 "近期热门" fallback 模式 (现在是 like_count desc + 7d,
                  真协同过滤推到后续 ticket) */}
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.20)" }}>
                <span style={{ fontSize: 10 }}>🔥</span>
                <span style={{ fontSize: 9, color: "#FF5A1F", fontWeight: 700, letterSpacing: '0.04em' }}>
                  {t3('TRENDING', '近期热门', 'TRENDING')}
                </span>
              </span>
            </div>
            <button
              onClick={() => navigate('/helper-community')}
              className="flex items-center gap-0.5 active:scale-95 transition-transform"
              style={{ fontSize: 11, color: "#FF5A1F", fontWeight: 700 }}
            >
              {t3('See all', '全部', 'Lahat')}
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
            {communityPosts.map(post => {
              const author = post.user_profiles?.display_name || 'helper';
              const preview = (post.title || post.body || '').slice(0, 50);
              return (
                <button
                  key={post.id}
                  onClick={() => navigate('/helper-community')}
                  className="flex-shrink-0 rounded-2xl overflow-hidden active:scale-[0.97] transition-transform text-left"
                  style={{ width: 160, background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}
                >
                  <div className="w-full" style={{ height: 100, background: "rgba(0,0,0,0.04)" }}>
                    {post.image_url ? (
                      <img src={post.image_url} alt={author} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span style={{ fontSize: 28 }}>💬</span>
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="font-semibold leading-tight line-clamp-2" style={{ fontSize: 11, color: "#1a1a1a", minHeight: 28 }}>
                      {preview || t3('(no preview)', '(无内容)', '(walang laman)')}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="truncate" style={{ fontSize: 10, color: "rgba(0,0,0,0.45)", maxWidth: 70 }}>
                        @{author}
                      </span>
                      <span className="ml-auto flex items-center gap-1" style={{ fontSize: 10, color: "rgba(0,0,0,0.5)" }}>
                        <span>❤️ {post.like_count}</span>
                        <span>💬 {post.comment_count}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────── §5 积分卡片占位 (TODO: 1000 用户后 enable 真数字) ─────────────── */}
      <div className="relative z-10 px-5 mb-5">
        <div className="rounded-2xl p-4"
          style={{ background: "linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,144,84,0.08))",
                   border: "1px solid rgba(255,90,31,0.20)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #FF5A1F, #FF9054)",
                       boxShadow: "0 4px 12px rgba(255,90,31,0.30)" }}>
              <span style={{ fontSize: 22 }}>⭐</span>
            </div>
            <div className="flex-1">
              <p className="font-bold" style={{ fontSize: 13, color: "#1a1a1a" }}>
                {t3('My Points', '我的积分', 'Mga Puntos Ko')}
              </p>
              <p className="font-black mt-0.5" style={{ fontSize: 22, color: "#FF5A1F", letterSpacing: '0.04em' }}>
                {/* TODO: enable 1000 用户后 — 现在隐真数字 hard-coded -- */}
                -- <span style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 600 }}>pts</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/helper-settings')}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all font-bold text-white"
            style={{ background: "#FF5A1F", fontSize: 13, boxShadow: "0 4px 14px rgba(255,90,31,0.25)" }}
          >
            <span style={{ fontSize: 14 }}>📲</span>
            {t3('Invite friends to earn points', '邀请朋友赚积分', 'Mag-imbita upang kumita ng puntos')}
          </button>
        </div>
      </div>

      {/* TICKET-097 (5/27 老板拍板) — 邀请码绑定 UI 已挪到 /helper/settings.
          HelperHome 顶部只显示菜单 + 任务, 不被绑定流程打断. 未绑定的菲佣
          看 HelperHome 时 isLinked=false → 顶部一条提示 chip 引导跳 settings. */}
      {!isLinked && (
        <div className="relative z-10 px-5 mb-4">
          <button
            onClick={() => navigate('/helper-settings')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-all"
            style={{ background: "rgba(255,90,31,0.08)", border: "1px dashed rgba(255,90,31,0.30)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#FF5A1F" }}>link</span>
            <div className="flex-1 text-left">
              <p style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600 }}>
                {t3("Bind to your employer", "绑定雇主家庭", "Maiugnay sa employer")}
              </p>
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", marginTop: 1 }}>
                {t3("Tap to enter invite code in settings", "去设置输入邀请码", "Pumunta sa settings")}
              </p>
            </div>
            <span style={{ fontSize: 13, color: "#FF5A1F" }}>›</span>
          </button>
        </div>
      )}

      {/* Switch account — 保留低权重 link */}
      <div className="relative z-10 flex justify-center pb-2">
        <button
          onClick={() => { localStorage.removeItem("nutri_role"); navigate("/login"); }}
          style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}
        >
          {t3("Switch account", "切换账号", "Lumipat ng account")}
        </button>
      </div>

      <HelperTabBar active="home" />

      {/* TICKET-082 §Phase 6 — 菲佣改"开饭"时间 bottom sheet (set_by='helper').
          开做 / 备菜由 cookSchedule 反推, 不能直接改. */}
      {editMeal && (
        <>
          <div className="fixed inset-0 z-[120]" onClick={() => !editBusy && setEditMeal(null)}
            style={{ background: 'rgba(0,0,0,0.45)' }} />
          <div className="fixed left-0 right-0 bottom-0 z-[121] max-w-md mx-auto rounded-t-3xl shadow-2xl"
            style={{ background: 'white', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
            <div className="px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between">
              <p className="font-bold" style={{ fontSize: 15, color: '#1a1a1a' }}>
                {editMeal === 'lunch'
                  ? t3('Set lunch time today', '设今天午饭时间', 'Itakda ang tanghalian ngayon')
                  : t3('Set dinner time today', '设今天晚饭时间', 'Itakda ang hapunan ngayon')}
              </p>
              <button onClick={() => !editBusy && setEditMeal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(0,0,0,0.05)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="time"
                value={editTimeInput}
                onChange={e => setEditTimeInput(e.target.value)}
                disabled={editBusy}
                className="w-full px-4 py-3 rounded-2xl border-2 border-orange-200 text-center font-black tabular-nums"
                style={{ fontSize: 28, color: '#FF5A1F' }}
              />
              <button onClick={saveMealEdit} disabled={editBusy}
                className="w-full py-3 rounded-2xl font-bold text-white active:scale-[0.98] transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 14 }}>
                {editBusy ? '…' : t3('Save', '保存', 'I-save')}
              </button>
              <p className="text-[11px] text-center text-secondary">
                {t3(
                  'Start cooking / prep time updates automatically.',
                  '开做 / 备菜时间会自动更新。',
                  'Awtomatikong mag-uupdate ang oras ng pagluluto.',
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
