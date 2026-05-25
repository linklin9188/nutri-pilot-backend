import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLanguage, LANGUAGE_LABEL } from "../contexts/LanguageContext";
import HelperTabBar from "../components/HelperTabBar";
import {
  dishToIngredients,
  aggregateIngredients,
  type AggregatedIngredient,
} from "../lib/dishIngredients";
import { getUserId } from "../lib/userId";
import { loadEmployerTodayMenu } from "../lib/helperEmployerMenu";
import {
  loadHomeInventory as loadHomeInventoryDb,
  setIngredientAvailable as setIngredientAvailableDb,
  commitInventoryFromLs,
  inventoryToMap,
} from "../lib/homeInventory";
// TICKET-083 — 菲佣 ④ 点 "✅ 确认完了" → 写 helper_confirmed notification, 雇主 Home 收红点
import { confirmInventoryAndNotifyEmployer } from "../lib/purchaseFlow";

/**
 * HelperPrep — Shopping "我家有 / Already have" toggle screen for the helper.
 *
 * Rewritten by TICKET-20260525-061 (老板真测 #5). The previous version was a
 * per-dish step-by-step prep checklist; the new spec is the inverse — the
 * helper walks through today's aggregated ingredient list and ticks off what
 * the kitchen already has so the employer's shopping run skips them.
 *
 * Pattern mirrors VerifyIngredients (the employer-side shopping screen) so
 * the persistence key `home_inventory_<userId>_<YYYY-MM-DD>` is shared —
 * the helper's "we already have flour" toggle is visible to the employer
 * when they open the shopping list, and vice versa.
 *
 * What's kept from the previous file:
 *   - Top-bar zh→en snap-on-mount useEffect (TICKET-060 — helper view never
 *     uses Chinese even if a stale employer session leaked appLanguage)
 *   - Language pill in the header (cycleLanguageForRole)
 *   - HelperTabBar at the bottom
 *   - i18n via t3(en, zh, tl) — every string passes through it.
 */

// Default headcount: helper has no profile of their own, so we read the
// employer-side family stored under `nutri_family_members` + `nutri_eating_today`
// (same source VerifyIngredients uses). Fall back to onboarding static count.
function readHeadcount(): { adults: number; kids: number } {
  try {
    const allMembers = JSON.parse(
      localStorage.getItem("nutri_family_members") || "[]",
    ) as Array<{ id: string; lifeStage?: string }>;
    if (allMembers.length > 0) {
      const eatingIds = (() => {
        try {
          return JSON.parse(
            localStorage.getItem("nutri_eating_today") || "null",
          ) as string[] | null;
        } catch {
          return null;
        }
      })();
      const today =
        eatingIds && eatingIds.length > 0
          ? allMembers.filter((m) => eatingIds.includes(m.id))
          : allMembers;
      const kids = today.filter((m) => m.lifeStage === "儿童").length;
      const adults = today.length - kids;
      return { adults, kids };
    }
  } catch {
    /* fall through */
  }
  const adults = parseInt(localStorage.getItem("nutri_adults") ?? "2", 10);
  const kids = parseInt(localStorage.getItem("nutri_kids") ?? "0", 10);
  return { adults, kids };
}

// Minimum dish fields we need to run dishToIngredients + display titles.
interface DishLite {
  id: string;
  title_zh: string;
  title_en?: string;
  main_ingredient?: string;
  course_type?: string;
  prep_steps_json?: unknown;
  image_url?: string;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function HelperPrep() {
  const navigate = useNavigate();
  const {
    t3,
    cycleLanguageForRole,
    language,
    setLanguage,
  } = useLanguage();

  // TICKET-20260525-060 — Helper view never uses Chinese. If a stale
  // appLanguage from a prior employer session leaked into this helper-only
  // page, snap to EN on mount. Matches HelperHome.tsx:73-78 pattern.
  useEffect(() => {
    if (language === "zh" || language === "zh-Hant") {
      setLanguage("en");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dishes, setDishes] = useState<DishLite[]>([]);
  const [loading, setLoading] = useState(true);
  // TICKET-075 §5 — helper 当前绑定 household 的 id, 用于跨账号共享 inventory.
  // null = 未绑 (helper 还没用邀请码进 household), 此时 UI 仍 work 但只走 LS.
  const [householdId, setHouseholdId] = useState<string | null>(null);

  // Shared persistence with VerifyIngredients — LS 用 雇主 userId 已经不准
  // (helper 自己 userId 与雇主 userId 不同). DB 主存, LS 留作 helper 端的
  // fast cache (key 用 helper 自己 userId 区分多账号).
  const inventoryKey = `home_inventory_${getUserId() ?? "anon"}_${todayKey()}`;
  const loadInventoryLs = (): Record<string, boolean> => {
    try {
      const raw = localStorage.getItem(inventoryKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  };
  const persistInventoryLs = (map: Record<string, boolean>) => {
    const pruned: Record<string, boolean> = {};
    for (const k of Object.keys(map)) if (map[k]) pruned[k] = true;
    try {
      localStorage.setItem(inventoryKey, JSON.stringify(pruned));
    } catch {
      /* quota — silently drop */
    }
  };
  const [haveIt, setHaveIt] = useState<Record<string, boolean>>(() =>
    loadInventoryLs(),
  );

  // TICKET-083 — 菲佣"✅ 确认完了"按钮态. confirming → 灰 disabled; confirmed →
  // 持久绿章 (cleared 在每日切换/下次菜单变化时自然失效).
  const [confirmState, setConfirmState] = useState<'idle' | 'confirming' | 'confirmed'>('idle');
  const [confirmedCount, setConfirmedCount] = useState(0);

  // TICKET-075 §5 — 读雇主菜单 + DB inventory 经 household 三步绑定.
  // 取代原 localStorage.generatedMenu 路径 (单设备孤岛, 切账号必断).
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        const helperUid = getUserId();
        const result = await loadEmployerTodayMenu(helperUid);
        if (cancelled) return;

        // 菜单 — dishes 直接渲染聚合; 缺 prep_steps_json 时 dishToIngredients
        // 的 main_ingredient 兜底路径仍能输出粗略清单.
        setDishes(result.dishes as DishLite[]);
        if (result.householdId) {
          setHouseholdId(result.householdId);

          // DB inventory — 拉到的 row 转 map 替换 LS, 同时刷 LS 副 cache.
          const items = await loadHomeInventoryDb(result.householdId, todayKey());
          if (cancelled) return;
          const dbMap = inventoryToMap(items);

          // 兼容老 helper: DB 空但 LS 有 → 一次性迁移 (markedBy='helper').
          const sentinelKey = `nutri_inventory_migrated_${result.householdId}_${todayKey()}`;
          const lsMap = loadInventoryLs();
          if (items.length === 0 && Object.keys(lsMap).length > 0 && !localStorage.getItem(sentinelKey)) {
            await commitInventoryFromLs(result.householdId, lsMap, 'helper', todayKey());
            try { localStorage.setItem(sentinelKey, '1'); } catch {}
            setHaveIt(lsMap);
          } else {
            setHaveIt(dbMap);
            persistInventoryLs(dbMap);
          }
        }
        // 没 household → 留 LS map (老路径), 不动 haveIt
      } catch (e) {
        console.error("HelperPrep load error:", e);
        if (!cancelled) setDishes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Aggregate ingredients across all of today's dishes — identical pipeline
  // to VerifyIngredients 'today' mode so the helper and employer see the
  // same canonical list.
  const ingredients = useMemo<AggregatedIngredient[]>(() => {
    if (dishes.length === 0) return [];
    const { adults, kids } = readHeadcount();
    const raw = dishes.flatMap((dish) => dishToIngredients(dish, adults, kids));
    return aggregateIngredients(raw);
  }, [dishes]);

  // TICKET-075 §5b — 双写: LS 即时 + DB 异步. 失败不阻塞 UI.
  // TICKET-083 — 改了任何 toggle 让"已确认"按钮回到 idle (用户可能漏勾再补)
  const toggleHave = (nameZh: string) => {
    setHaveIt((prev) => {
      const nextVal = !prev[nameZh];
      const next = { ...prev, [nameZh]: nextVal };
      persistInventoryLs(next);
      if (householdId) {
        setIngredientAvailableDb(householdId, nameZh, nextVal, 'helper', todayKey())
          .catch((e) => console.warn('[HelperPrep.toggle] DB write failed:', e));
      }
      return next;
    });
    if (confirmState === 'confirmed') setConfirmState('idle');
  };

  const toBuy = ingredients.filter((i) => !haveIt[i.nameZh]);
  const haveList = ingredients.filter((i) => !!haveIt[i.nameZh]);

  // TICKET-083 §4b — 菲佣 ④ "✅ 确认完了" → 写 helper_confirmed notification,
  // 雇主 Home 顶部立刻显红卡. toBeBoughtIngredients = 没勾"我家有"的食材名.
  const handleConfirmAndNotify = async () => {
    if (confirmState === 'confirming') return;
    if (!householdId) {
      // 未绑 household → 不能通知 (helper 还没扫雇主邀请码). 给提示但不阻塞.
      console.warn('[HelperPrep.confirm] no householdId, cannot notify');
      return;
    }
    setConfirmState('confirming');
    const helperUid = getUserId();
    const toBeBought = toBuy.map((i) => i.nameZh);
    const ok = await confirmInventoryAndNotifyEmployer(
      householdId,
      todayKey(),
      helperUid,
      toBeBought,
    );
    if (ok) {
      setConfirmedCount(toBeBought.length);
      setConfirmState('confirmed');
    } else {
      setConfirmState('idle');
    }
  };

  return (
    <div className="bg-[#f4f4f6] font-sans text-on-surface min-h-screen pb-56 flex flex-col max-w-md mx-auto relative">
      {/* Header — preserved from previous version */}
      <header className="bg-white sticky top-0 z-50 border-b border-black/5 flex justify-between items-center w-full px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            className="active:scale-95 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full"
            onClick={() =>
              navigate(
                localStorage.getItem("nutri_role") === "helper"
                  ? "/helper"
                  : "/",
              )
            }
          >
            <span className="material-symbols-outlined text-[20px]">
              arrow_back
            </span>
          </button>
          <div>
            <span className="text-[18px] font-bold tracking-tight">
              {t3("Shopping Check", "采购确认", "Tsek sa Pamimili")}
            </span>
            {ingredients.length > 0 && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                {toBuy.length} {t3("to buy", "待买", "bibilhin")} ·{" "}
                {haveList.length} {t3("have", "已有", "meron")}
              </p>
            )}
          </div>
        </div>
        {/* Language pill — role-aware cycle (helper: en → tl → id) */}
        <button
          onClick={cycleLanguageForRole}
          className="px-3 py-1.5 rounded-full bg-black/5 text-[12px] font-bold text-gray-900 active:scale-95 transition-transform"
          title="Switch language"
        >
          {LANGUAGE_LABEL[language]}
        </button>
      </header>

      {/* Hero — explain the screen in helper-friendly plain language */}
      <section className="px-5 pt-5 pb-3">
        <h1 className="text-[22px] font-black leading-tight tracking-tight text-gray-900">
          {t3(
            "Mark what your kitchen already has",
            "确认家里有哪些不需要再买",
            "Markahan ang mga nasa kusina na",
          )}
        </h1>
        <p className="text-[13px] text-gray-500 mt-2 leading-snug">
          {t3(
            "Tap each item you already have at home. The rest is the employer's shopping list — they will only buy what's not checked.",
            "已经有的食材点一下就好。剩下的就是雇主要买的清单，不会重复采购。",
            "I-tap ang mga nasa bahay na. Ang natitira ang bibilhin ng employer — hindi na uulit.",
          )}
        </p>
      </section>

      {/* Progress bar */}
      {ingredients.length > 0 && (
        <div className="px-5 pb-3">
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              animate={{
                width: `${(haveList.length / ingredients.length) * 100}%`,
              }}
              transition={{ type: "spring", stiffness: 200 }}
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {haveList.length}/{ingredients.length}{" "}
            {t3("items checked", "项已确认", "naka-tsek")}
          </p>
        </div>
      )}

      <main className="px-4 pt-2 flex flex-col gap-5">
        {loading && (
          <div className="text-center py-20 text-gray-400 text-[14px]">
            {t3(
              "Loading shopping list...",
              "加载采购清单中...",
              "Naglo-load ng listahan...",
            )}
          </div>
        )}

        {!loading && ingredients.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
            <span style={{ fontSize: 48 }}>🛒</span>
            <p
              className="text-gray-500 font-semibold"
              style={{ fontSize: 15 }}
            >
              {t3(
                "No menu yet. Ask the employer to pick today's dishes first.",
                "还没有菜单，请等雇主选好今日的菜。",
                "Wala pang menu. Hintayin ang employer na pumili ng menu ngayon.",
              )}
            </p>
          </div>
        )}

        {/* ── Section 1: still need to buy ────────────────────────────── */}
        {!loading && toBuy.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[13px] font-bold text-gray-700">
                {t3("Need to buy", "待采购", "Kailangang bilhin")}
              </p>
              <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                {toBuy.length}{" "}
                {t3("items", "项", "items")}
              </span>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {toBuy.map((item, i) => (
                <button
                  key={item.nameZh}
                  onClick={() => toggleHave(item.nameZh)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.99] text-left ${
                    i !== toBuy.length - 1
                      ? "border-b border-black/[0.05]"
                      : ""
                  }`}
                >
                  {/* Empty checkbox */}
                  <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex-shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-gray-300 text-[16px]">
                      home
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[16px] text-gray-900 leading-tight">
                      {item.nameZh}
                    </p>
                    {item.variants && item.variants.length >= 2 && (
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                        ({item.variants.join(" + ")})
                      </p>
                    )}
                    {item.dishes.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                        {t3("For: ", "用于：", "Para sa: ")}
                        {item.dishes.slice(0, 2).join(" · ")}
                        {item.dishes.length > 2
                          ? ` +${item.dishes.length - 2}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/5 text-gray-600 flex-shrink-0">
                    {t3(
                      "I have it?",
                      "我家有？",
                      "Meron tayo?",
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Section 2: already have (greyed out, below) ─────────────── */}
        <AnimatePresence>
          {!loading && haveList.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[13px] font-bold text-gray-500">
                  {t3(
                    "Already have at home",
                    "我家已有",
                    "Meron na sa bahay",
                  )}
                </p>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {haveList.length}{" "}
                  {t3("items", "项", "items")}
                </span>
              </div>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm opacity-80">
                {haveList.map((item, i) => (
                  <button
                    key={item.nameZh}
                    onClick={() => toggleHave(item.nameZh)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-[0.99] text-left bg-emerald-50/40 ${
                      i !== haveList.length - 1
                        ? "border-b border-black/[0.05]"
                        : ""
                    }`}
                  >
                    {/* Checked badge */}
                    <div className="w-7 h-7 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center">
                      <span
                        className="material-symbols-outlined text-white text-[16px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        check
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className="font-bold text-[15px] text-gray-500 leading-tight"
                        style={{ textDecoration: "line-through" }}
                      >
                        {item.nameZh}
                      </p>
                      {item.variants && item.variants.length >= 2 && (
                        <p className="text-[10px] text-gray-300 mt-0.5 leading-tight">
                          ({item.variants.join(" + ")})
                        </p>
                      )}
                    </div>

                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                      {t3(
                        "✓ Have it",
                        "✓ 我家有",
                        "✓ Meron",
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 px-1 leading-snug">
                {t3(
                  "Tap again to move back to the buying list if you changed your mind.",
                  "点一下可以重新放回采购清单。",
                  "I-tap ulit para bumalik sa listahan ng bibilhin.",
                )}
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Footer note — explains the flow, replaces the old "Start Cooking" CTA */}
        {!loading && ingredients.length > 0 && (
          <div className="mt-2 px-2 pb-4 text-center">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {t3(
                "When you're done checking, switch to the Cook tab to start preparing today's meal.",
                "确认完后，切换到「烹饪」标签开始做今天的饭。",
                "Pagkatapos mag-tsek, lipat sa Cook tab para magluto.",
              )}
            </p>
          </div>
        )}
      </main>

      {/* AI Pilot FAB — preserved */}
      <div className="fixed bottom-32 right-6 z-[55]">
        <button
          onClick={() => navigate("/ai-pilot")}
          className="w-14 h-14 bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
        >
          <span
            className="material-symbols-outlined text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            mic
          </span>
        </button>
      </div>

      {/* TICKET-083 §4b — 菲佣"✅ 确认完了"sticky 按钮. 点了写 helper_confirmed
          notification, 雇主 Home 收红点 + /verify 按钮态切换. 没绑 household 或菜单
          为空时隐藏 (没意义可点). */}
      {!loading && ingredients.length > 0 && householdId && (
        <div
          className="fixed left-0 right-0 mx-auto max-w-md px-4 z-40"
          style={{ bottom: 76 }}
        >
          <button
            onClick={handleConfirmAndNotify}
            disabled={confirmState === 'confirming' || confirmState === 'confirmed'}
            className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-80"
            style={{
              background: confirmState === 'confirmed'
                ? 'linear-gradient(135deg, #25D366, #16A34A)'
                : 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
              boxShadow: '0 8px 20px rgba(255,90,31,0.28)',
            }}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {confirmState === 'confirmed' ? 'check_circle' : 'send'}
            </span>
            {confirmState === 'confirming'
              ? t3('Notifying employer…', '通知雇主中…', 'Inaabisuhan…')
              : confirmState === 'confirmed'
                ? t3(
                    `Confirmed · ${confirmedCount} items notified`,
                    `✓ 已确认 · ${confirmedCount} 件已通知雇主`,
                    `Kumpirmado · ${confirmedCount} naipaalam`,
                  )
                : t3(
                    `Confirm: ${toBuy.length} items to buy`,
                    `✅ 确认完了 · 要买 ${toBuy.length} 件`,
                    `Kumpirmahin · ${toBuy.length} bibilhin`,
                  )}
          </button>
        </div>
      )}

      <HelperTabBar active="prep" />
    </div>
  );
}
