# TICKET-073 — InviteFamilySheet 用真 DB invite_code 替 fake 前端 mint

## 问题

老板真测：雇主端 Home 顶部 "+邀请家人" 展开看到邀请码 `APJKJK`（6 字符字母），切到菲佣端输 `APJKJK` 报 "Wrong invite code"，菲佣绑不上。

**根因（历史债）**：

- `Home.tsx:2671` 的 `InviteFamilySheet` 组件 **前端 mint** 一个 6 字符 alphanumeric code（字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`），存进 `localStorage.nutri_invite_code`，**从来没写进 DB**。
- DB `households.invite_code` 是 migration 001 的 trigger 自动生成的 **6 位数字**（`LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0')`，例 `847219`）。
- `Login.tsx` 菲佣绑定逻辑 `WHERE invite_code = 'APJKJK'` → 0 行 → 报错。
- 讽刺的是 `Home.tsx:752 / 775 / 783 / 801` 早就 fetch 了 DB `households.invite_code` 真值并存进 state `inviteCode`——但 `InviteFamilySheet` 组件**没用这个 state**，自己又 mint 了一个 fake。
- Home.tsx line 2670 注释早就写明：「Real households.invite_code DB sync is Database 部门 backlog」——这是 TICKET-044 §A 留下的有意识债务，今天兑现。

## 方法

最小改动，3 步：

1. **`InviteFamilySheet` 改成接 prop**：函数签名从 `function InviteFamilySheet()` 改成 `function InviteFamilySheet({ inviteCode }: { inviteCode: string })`。
2. **删除组件内 mint 逻辑**：原 `useState<string>(() => { ... localStorage mint ... })` 完整删掉，改成直接用 prop。
3. **父组件传 prop**：`Home.tsx:1489` 渲染处 `<InviteFamilySheet />` 改成 `<InviteFamilySheet inviteCode={inviteCode} />`，`inviteCode` 就是 line 752 那个 state（已经在 useEffect 里 fetch DB 真值填好了）。
4. **空态 fallback**：DB 还没 fetch / 新用户没 household 时 `inviteCode` 是空串。引入 `hasCode = !!inviteCode && inviteCode.length >= 4`，code-card 区域空态显示「正在生成邀请码…」三语 loading，复制 / 分享按钮 `disabled + opacity-40`，不显示 fake code。
5. **不动 localStorage 残留**：老板 row 的 `localStorage.nutri_invite_code='APJKJK'` 不主动清，反正后续代码再也不读不写这个 key，它会自然过期。

## 标准

**今后凡「两端都要互认」的 code / token / id 必须 DB 主存，前端绝不能自己 mint fake 不存 DB**。

- 邀请码、token、订单号、refer code、分享 id 之类的「两端契约」标识，物理上必须先有 DB 行，前端只是显示/复制。
- 任何在前端 `Math.random()` + `localStorage.setItem` 拼出来的「标识」如果对端需要校验，就是定时炸弹。
- 临时绕过（"DB 部门 backlog"）写在注释里没用，因为另一端的校验代码不会因为你写注释就放过你。要么前端不显示，要么 DB 真存。
- 验证 sanity：grep `localStorage.setItem.*invite\|token\|code\|share_id` —— 看看哪些 key 是「前端自造的双端标识」，逐个排查。
