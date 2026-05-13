/**
 * BottomTabBar — shared employer bottom navigation
 * Used by: Home, WeeklyMenu, Community (employer view), Settings
 */

import { useNavigate, useLocation } from "react-router-dom";

const TABS = [
  { icon: "home",           label: "首页",  route: "/"         },
  { icon: "calendar_month", label: "菜单",  route: "/weekly"   },
  { icon: "shopping_cart",  label: "采购",  route: "/verify"   },
  { icon: "groups",         label: "社区",  route: "/community"},
  { icon: "settings",       label: "设置",  route: "/settings" },
];

export default function BottomTabBar() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  function isActive(route: string) {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-t border-black/[0.06]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      <div className="flex max-w-md mx-auto">
        {TABS.map(tab => {
          const active = isActive(tab.route);
          return (
            <button
              key={tab.label}
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
