# UI-053 — Settings 加 avoid_tags / excluded_meats chip 可视化

## 1. 问题

qa-047 整合 audit 发现：用户在 OnboardingV2 选过的过敏原（海鲜/坚果/麸质/奶/蛋 → `user_profiles.avoid_tags`）+ 主肉忌口（猪/牛/羊/鸡/鸭 → `user_profiles.excluded_meats`）写进了 DB，但 Settings 页面**完全不显示** `avoid_tags`。`excluded_meats` 只在"🤖 算法理解到的你"chip 里被压缩成一条 `🥩 不吃猪/牛`，细分类被吞。结果：用户填了忌口看不到 → 体验断裂 + 内测期 helper 用户会反复问"我填的过敏原呢"。

## 2. 改法

`src/pages/Settings.tsx` 三处 surgical：
1. `ProfileV2` interface 加 `avoid_tags?: string[] | null`（行 499）。
2. 已有 useEffect SELECT 加 `avoid_tags` 列（行 513），不重 fetch、复用 TICKET-039 那个 effect。
3. 在算法反推 chip 卡片 IIFE 之后、手动覆盖抽屉之前（行 1063~1097），加独立 `🚫 我的忌口` chip 卡片，沿用算法卡片同款橙色背景容器（视觉一致），里面 avoid_tags 红色 chip + excluded_meats 橙色 chip 拆开显示，每个 tag 一颗 chip，emoji + 中文 label。

刻意保留算法反推那条聚合 `🥩 不吃猪/牛` —— 两次显示反而强化"系统看到了你的忌口"的信号；删它属于动 TICKET-039 已 ship 行为，硬约束禁止。

## 3. 教训

- spec 给的 jsx 用了 `avoidTags` / `excludedMeats` 独立 state，但项目早就把这两个数据合在 `profileV2` 里（TICKET-039 §2 fetch）。**别为了贴 spec 字面新加 state + 新 useEffect**，复用已有 fetch 才是少破现状。
- spec 给的 `border-t border-gray-100` mt-3 sub-section 样式放在橙色算法卡片**内部**视觉割裂；放在卡片**外部**作为独立平级 section，用算法卡片同款 `rounded-[16px]` + 橙色描边背景容器，整体一致性更好。
- avoid_tags / excluded_meats 是 OnboardingV2 拆 `avoidSet` 写入的"双列等价覆盖"（OnboardingV2.tsx:296-312 注释），算法侧 hard filter 是合并两列后过滤。可视化时这两列必须**同时显示且分清类目**——allergens（avoid_tags）用红色暗示「健康/医学风险」，meats（excluded_meats）用橙色暗示「饮食偏好」。
