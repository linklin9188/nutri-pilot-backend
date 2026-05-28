/**
 * HelperBottomTabBar — shared domestic-helper bottom navigation
 * Used by: HelperHome (/helper), HelperCook (/cook),
 *          VerifyIngredients (/verify), Community (/community)
 *
 * Differs from employer BottomTabBar:
 *  - 4 tabs labeled for cooking-staff workflow (任务/做菜/采购/社区)
 *  - 3-language labels (EN / Tagalog / Chinese) — helper view never uses zh-Hant
 *  - Only renders when nutri_role === 'helper' (mirror of BottomTabBar's
 *    own guard that hides it for helper). HelperPrep is NOT in the tab set —
 *    it's the prep stage before /cook, entered from inside /cook via the
 *    PREP/COOK/SERVE step bar.
 */

import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export default function HelperBottomTabBar() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();
  const { t3 } = useLanguage();

  // Mirror of BottomTabBar.tsx guard inverted: this bar is helper-only.
  if (localStorage.getItem("nutri_role") !== "helper") return null;

  const TABS = [
    { icon: "task_alt",      label: t3("Tasks",    "任务",     "Gawain"),    route: "/helper"          },
    { icon: "soup_kitchen",  label: t3("Cook",     "做菜",     "Magluto"),   route: "/cook"            },
    { icon: "shopping_cart", label: t3("Shopping", "采购清单", "Pamimili"),  route: "/verify"          },
    // TICKET-100 (5/28): Community tab 已砍, 改 Settings (跟雇主端一致)
    { icon: "settings",      label: t3("Settings", "设置",     "Settings"),  route: "/helper-settings" },
  ];

  function isActive(route: string) {
    if (route === "/helper") return pathname === "/helper";
    return pathname.startsWith(route);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 bg-white/95 backdrop-blur-xl border-t border-black/[0.06]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      <div className="flex max-w-md mx-auto">
        {TABS.map(tab => {
          const active = isActive(tab.route);
          return (
            <button
              key={tab.route}
              onClick={() => navigate(tab.route)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 active:scale-90 transition-transform"
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 24,
                  color: active ? "#FF5A1F" : "rgba(0,0,0,0.32)",
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  transition: "all 0.15s",
                }}
              >
                {tab.icon}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#FF5A1F" : "rgba(0,0,0,0.32)",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
