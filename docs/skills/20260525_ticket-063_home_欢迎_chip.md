# TICKET-063 Home 顶部欢迎 chip — 取了 displayName 但 0 JSX render 的消歧义

## 问题

老板真测 #9: "微信里点登陆后, 出现的是我们家菲佣的名字 Ika, 说明并不是
真正在获取用户的微信授权数据?"

实查真因 (CEO 已实查):
- `Home.tsx:736` 取了 `displayName` state, `:751` 从 user_profiles SELECT
  display_name, `:755` setDisplayName(data.display_name) — 数据链完整。
- 但 `grep -n "displayName"` 在整个 Home.tsx 只 2 处 (state 声明 + setter),
  **0 个 JSX 渲染节点**。
- Home 唯一可见的名字是 HELPER STATUS card 的 `Ika` (菲佣)
  → 老板误判: "微信登录抓到的是菲佣身份"。
- 微信授权链本身没问题: `wechat-mp-callback/index.ts:213` 的
  `if (nickname) patch.display_name = nickname` + TICKET-057 commit cb0ada1
  的 avatar 兜底 302 重授权同步补 display_name, 都已上线。

根因 = **UI 没渲染**, 不是后端 / 授权 / DB 任一环节有 bug。

## 方法

surgical edit, Home.tsx 3 处:

1. **state 扩** (`:740-742`): 加 `const [avatarUrl, setAvatarUrl] = useState<string | null>(null)`。
2. **SELECT 扩** (`:751-757`): `select("display_name, avatar_url")` + setAvatarUrl。
3. **顶部 chip 插入** (β banner 之后, header 之前): 44px 高 / 16px 圆角 /
   半透白底 + 1.5px 橙描边头像 (32x32) + "你好, {nickname}" 文案, 整体
   onClick → `/settings`。displayName 为空时仍渲染 "你好, 朋友" + 字母 U
   兜底头像 (`(displayName.trim().charAt(0) || 'U').toUpperCase()`), 未登录
   也有占位。avatarUrl 加 `onError` hide, 防 302/404 闪烂图。
4. **header paddingTop 调整**: 原本 `betaBannerShown ? 0 : safe-area`,
   现在 chip 永远在最上接管 safe-area-inset-top, header 改为 `paddingTop: 0`。

不动:
- HELPER STATUS card (`:1891-1910`) — 设计正常的菲佣卡, 保留。
- wechat-mp-callback (cb0ada1 已 fix)。
- 其他 Home 功能 (TICKET-062 拍冰箱 + 加菜单)。

vite build 通过, 主 bundle 1006.04 kB (gzip 311.40 kB), 增量 < 1 kB。

## 标准

**今后任何用户身份相关 state (display_name / avatar_url / member tier /
hometown 等) 必须有至少 1 个 JSX 渲染节点**。"取数据但不显示" 是反模式:
- 用户在 UI 上没看到自己的名字 → 第一反应永远是 "登录抓错人"。
- 数据链对的 + UI 没渲染 = 浪费一次后端调用 + 制造误判 ticket。
- review checklist: state 声明后, 用 grep 验证至少有 1 处 `{stateName}`
  在 JSX 中 (排除 setter / 注释), 没有就是 dead state, 要么删要么渲染。

后续若再加 user_profiles 字段 (e.g. region / tier / 偏好标签), 同样原则:
take it → render it。
