# TICKET-067 P0 — saveHelper 污染雇主 display_name

## 问题

`src/pages/Settings.tsx:849-856` 的 `saveHelper()` 用 `getUserId()` (=雇主 ID) 做
`user_profiles` row key, 把菲佣 `helperName` 写进了**雇主自己**的 `display_name`
字段:

```ts
const userId = getUserId();              // 雇主 ID
if (userId) await supabase.from("user_profiles").upsert({
  id: userId,                            // 雇主 row
  display_name: helperName               // ← 菲佣名字!
}, { onConflict: "id" });
```

后果: 老板 `user_profiles` row 的 `display_name` 被永久污染成菲佣名字 'Ika'.
所有读 display_name 的地方 — Settings 头像 (`myDisplayName`)、Home 顶部
TICKET-063 "Hi {昵称}"、ChatAgent — 全显示 'Ika'. 老板真测截图证实.

## 方法

surgical edit: **删 line 853** 那一行 supabase upsert, helperName / helperLang
只走 localStorage (其他模块仍能正常读). 不动 user_profiles schema, 不动
household_members, 不动 wechat callback.

雇主 display_name 的真值来源应只有一条路径: `wechat-mp-callback/index.ts:213`
`if (nickname) patch.display_name = nickname` — TICKET-064 commit `0fd9d2a` 已
加 wx_refresh 自动触发, 老板下次走完整 snsapi_userinfo 授权时, 真 wechat
nickname 会自动覆盖污染数据, **无需手动 SQL UPDATE**.

grep 验证: `grep -rn "display_name.*helperName\|helperName.*display_name" src/`
仅命中这一处, 修完后 0 残留.

## 标准

今后任何对 `user_profiles` 的 upsert/update, **必须确认 row key 对应的 actor**:

- `userId = getUserId()` → 雇主 row, 只能写雇主自己的字段 (display_name / hometown / dietary_goal / taste_pref ...)
- 菲佣相关数据 → 走 `household_members` (helper_id 列), 或本地 `localStorage`
  (helperName / helperLang). 永远不要把菲佣属性 upsert 到雇主 row.
- helperId (菲佣 user_profiles row, 如果未来真注册) → 单独 row, 不可与雇主混用.

review checklist: 凡看到 `supabase.from("user_profiles").upsert({ id: X, ... })`,
立即问 "X 是 actor 自己吗? 写入的字段是 X 自己的属性吗?", 任一答 no 即 bug.
