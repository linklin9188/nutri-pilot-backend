/**
 * HelperTabBar — TICKET-041 P1 §2 5-tab fixed bottom nav (helper end).
 *
 * 与老 HelperBottomTabBar (4 tab: 任务/做菜/采购/社区) 并存的"工单 041 新版"
 * 5-tab bar: 主页 / 采购 / 做菜 / 社区 / 设置. HelperHome dashboard 化后
 * 全部 helper 页 footer 统一这一条. 老 HelperBottomTabBar 暂不删 (其他角色
 * 入口可能仍引用), 但 5 helper page 都改用本组件.
 *
 * Route 映射 (与 App.tsx 真实路由对齐):
 *   home     → /helper
 *   prep     → /prep
 *   cook     → /cook
 *   community→ /helper-community
 *   settings → /helper-settings
 *
 * 设计:
 *   - fixed bottom-0 z-50 + safe-area-inset-bottom padding
 *   - active tab 主色橙 #FF5A1F + FILL'1 icon + 加粗 label
 *   - 3-语 label (EN / Tagalog / Chinese) 通过 useLanguage().t3
 *   - 不再 guard nutri_role==='helper' (本组件只在 helper 页用, 调用方负责放置)
 */

import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export type HelperTabKey = "home" | "prep" | "cook" | "community" | "settings";

interface HelperTabBarProps {
  active: HelperTabKey;
}

export default function HelperTabBar({ active }: HelperTabBarProps) {
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  const TABS: Array<{ key: HelperTabKey; icon: string; label: string; route: string }> = [
    { key: "home",      icon: "home",          label: t3("Home",     "主页", "Tahanan"),    route: "/helper"           },
    { key: "prep",      icon: "shopping_cart", label: t3("Shopping", "采购", "Pamimili"),    route: "/prep"             },
    { key: "cook",      icon: "soup_kitchen",  label: t3("Cook",     "做菜", "Magluto"),     route: "/cook"             },
    { key: "community", icon: "groups",        label: t3("Community","社区", "Komunidad"),   route: "/helper-community" },
    { key: "settings",  icon: "settings",      label: t3("Settings", "设置", "Mga Setting"), route: "/helper-settings"  },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-black/[0.06]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      <div className="flex max-w-md mx-auto">
        {TABS.map(tab => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => { if (!isActive) navigate(tab.route); }}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 active:scale-90 transition-transform"
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 24,
                  color: isActive ? "#FF5A1F" : "rgba(0,0,0,0.32)",
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                  transition: "all 0.15s",
                }}
              >
                {tab.icon}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#FF5A1F" : "rgba(0,0,0,0.32)",
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
