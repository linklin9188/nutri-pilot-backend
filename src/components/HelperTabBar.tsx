/**
 * HelperTabBar — TICKET-041 P1 §2 helper 底部 nav (TICKET-058 §2: 5→4 tab).
 *
 * 与老 HelperBottomTabBar (4 tab: 任务/做菜/采购/社区) 并存的"工单 041 新版"
 * 4-tab bar: 主页 / 采购 / 做菜 / 社区. HelperHome dashboard 化后全部 helper
 * 页 footer 统一这一条. 老 HelperBottomTabBar 暂不删 (其他角色入口可能仍引用),
 * 但 5 helper page 都改用本组件.
 *
 * TICKET-058 §2 (2026-05-25, 老板真测): 删 ⚙️ settings tab.
 * 原因: HelperHome 右上角已有 ⚙️ settings 入口 (TICKET-041 P1 加的),
 * 底部 TAB 又有 settings → 重复. 老板拍板: "菲佣主页右上角有了设置,
 * 就不需要在下面再增加设置导航." 保留 home 右上 ⚙️ 作为唯一入口.
 *
 * Route 映射 (与 App.tsx 真实路由对齐):
 *   home     → /helper
 *   prep     → /prep
 *   cook     → /cook
 *   community→ /helper-community
 *
 * 设计:
 *   - fixed bottom-0 z-50 + safe-area-inset-bottom padding
 *   - active tab 主色橙 #FF5A1F + FILL'1 icon + 加粗 label
 *   - 3-语 label (EN / Tagalog / Chinese) 通过 useLanguage().t3
 *   - 不再 guard nutri_role==='helper' (本组件只在 helper 页用, 调用方负责放置)
 */

import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

// TICKET-058 §2 — "settings" 从联合类型移除. 调用方如还在传 active="settings"
// TS 会编译错暴露遗留点 (实际不应有, helper-settings 页不放底部 tab bar).
export type HelperTabKey = "home" | "prep" | "cook" | "settings" | "community";  // community 保留 type alias 兼容老 callers

interface HelperTabBarProps {
  // TICKET-058 §2 — active 改可选. HelperSettings 页通过 home 右上 ⚙️ 进入,
  // 不再属于 4 tab 中任何一个, 传 undefined 即可 (无 tab 高亮).
  active?: HelperTabKey;
}

export default function HelperTabBar({ active }: HelperTabBarProps) {
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  const TABS: Array<{ key: HelperTabKey; icon: string; label: string; route: string }> = [
    { key: "home",      icon: "home",          label: t3("Home",     "主页", "Tahanan"),  route: "/helper"          },
    { key: "prep",      icon: "shopping_cart", label: t3("Shopping", "采购", "Pamimili"), route: "/prep"            },
    { key: "cook",      icon: "soup_kitchen",  label: t3("Cook",     "做菜", "Magluto"),  route: "/cook"            },
    // TICKET-100 (5/28): Community tab 已砍, 改 Settings (跟雇主端一致)
    { key: "settings",  icon: "settings",      label: t3("Settings", "设置", "Settings"), route: "/helper-settings" },
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
