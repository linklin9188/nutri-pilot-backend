# TICKET-071 — Settings 名字内联编辑 (微信 nickname 拿不到时用户自定义)

## 1. 问题

微信 OAuth 在 web-view 外/未认证公众号场景拿不到 nickname,
头像区落到 `userId.slice(0, 8)` 兜底（一串字母数字），用户没法把自己的名字显示成"林建杰"这样的真名。
TICKET-070 给的"重新获取微信资料"兜底按钮只解决"再走一次微信授权"路径，
完全不能解决"压根不在微信环境 / 微信也拿不到"的场景。
老板拍板 2 条:
1. 微信能拿就拿 nickname (已实现, wechat-mp-callback `index.ts:213`)
2. 拿不到 → 用户自己改 (本 ticket)

## 2. 方法

Settings.tsx 头像卡名字行 (line 949) 加 ✏️ icon button → 切到内联编辑态:
- input (autoFocus + maxLength 20) + 保存 button + 取消 button
- 保存走 `supabase.from('user_profiles').update({ display_name }).eq('id', userId)`
- 用 `.update()` 不是 `.upsert()` — row 已经存在 (Settings 是登录后页, user_profiles 必有 row)
- 立即 `setMyDisplayName(name)` 让 UI 即时反应,不需要刷新
- 用 unknown + Error narrow 替代 any (lint cleanliness)
- 与 TICKET-070 "🔄 重新获取微信资料"按钮并存,不冲突 (一个走 OAuth, 一个走 input)
- 三语 t4 跟齐 Settings 主流 (Tagalog + Bahasa 4 语)

## 3. 标准

任何"第三方 OAuth 自动 fill 的字段"都必须有"用户自定义"备选 UI,
不能假设第三方一定能拿到 — 微信 / Google / Apple 都可能因为环境/scope/审核失败。
设计 fallback chain 时, 链尾必须是"用户手输", 不是"显示 userId.slice(0,8)"这种露馅的兜底。
具体落地: 凡是 `display_name || nickname || userId.slice(0,8)` 这种 fallback 链,
display_name 那一段必须配套一个可见的编辑入口让用户自己填,
否则永远卡在最差的兜底态。
