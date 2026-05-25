# TELEPOT-20260525-057 Settings P0 hot-fix — 微信头像 legacy 修复 + 删 "我的口味偏好"

## 教训 1：微信 silent re-auth 永远不会回填 legacy row 的 avatar_url

老板真测发现微信登录后头像没显示。**Settings.tsx 头像区代码完全正确**（早就读了 `user_profiles.avatar_url`，img 有 onError 兜底，img 优先级 `avatar_b64 > avatar_url > 橙渐变首字母` 也对）。**wechat-mp-callback 也已经写 avatar_url**（TICKET-024 §A 已 ship）。

实查 production：所有 `wechat_openid IS NOT NULL` 的 user_profiles 行 `avatar_url` 全为 null。**真因 = A-legacy**：callback 加 avatar_url 逻辑**之前**老板已经登录建好 row，row 字段缺。之后每次进微信 webview，`wechatSilentLogin.ts` 走 scope=snsapi_base 静默授权 → callback **永远不调 sns/userinfo** → headimgurl=null → callback update path 里 `if (headimgurl) patch.avatar_url = headimgurl` 这行永远不触发 → 老板的头像 forever stuck null。

surgical fix：callback silent path 同时 select `avatar_url` 字段；如果 silent match 到 row 但 `avatar_url IS NULL` → 一次性 302 到 `/login?wx_refresh=avatar`，让用户走完整 snsapi_userinfo 授权，update path 把头像写进去。3 段改动：(1) 2 个 select 加 `avatar_url` 字段并把值挑出来；(2) silent + matched + 缺 avatar 时 302 /login；(3) 不要改 update path（已经对）。

教训：**新加 column / fill 逻辑后，永远要 audit legacy row**（"已 ship" 不等于"老 row 也有"）。silent 路径专门跳过 userinfo 的特性放大了这个 gap。

## 教训 2：删 JSX 整段要真删，不要 `{false && (...)}` wrap

第一反应想用 `<div style={{display:"none"}}>` 或 `{false && (<div>...</div>)}` 包死代码 — JSX 表达式合法但 React 不渲染。**两个都不行**：

- `display:none` 浪费 DOM，且 hooks 仍触发 setState / DB query；
- `{false && (...)}` 在 TypeScript 严格 JSX 校验下，wrapper attr 不当（比如 `<div><div>` 平行）会触发 "JSX expressions must have one parent element"，结构稍乱 closing 数算错就漏掉 `)}` 。

正确做法：**真删 JSX**。把整段子树连同 wrapper `</div></div>` 一并替换为 1 行注释。hooks 声明（tasteOpen / setTasteOpen / profileV2 / setAdvancedOpen / saveAdvancedPrefs / saveTasteFreeText / TASTE_OPTIONS / TASTE_LABELS / TASTE_ICONS / currentTasteLabel / pickTaste / tasteFreeText / tasteFreeSaving / tasteFreeMsg / advancedSaving / advancedMsg / advancedOpen 全部）保留供未来 family-member-edit 复用。Vite production build `tsc --isolatedModules` 不报 unused-but-defined，build 仍通过。

## 教训 3：删功能要确认"功能等价 fallback"已有

老板说 "可以删除放在我的家庭成员里即可"。删 "我的口味偏好" 之前必须确认：(a) 老板自己已经在 family member 列表里有 row；(b) family member 卡片支持编辑同样的 9 字段（hometown_cuisine / cuisine_preference / spice_tolerance / taste_intensity / cooking_methods_pref / excluded_meats / excluded_ingredients / cooking_frequency_per_week / budget_level / avoid_tags）；(c) 算法 reader 同时读个人 user_profiles 和 family member 数据 — 删 UI 不会改数据库写路径或算法读路径。本 ticket 只动 UI 显示层，不动 schema / 算法。
