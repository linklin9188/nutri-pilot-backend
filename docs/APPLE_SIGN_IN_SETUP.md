# Apple Sign In 配置 — 老板手动 todo

> 前端代码已 ship (TICKET-096), 但 Apple OAuth 真接通需要老板在 3 个地方配置.
> 不配置 → 点 "Apple 登录" 按钮会 fallback 到 dev test login (能用但拿不到真 Apple ID).

## 总成本

- **Apple Developer 账号**: $99/年（必须）
- 配置时间: 30-45 分钟
- 后续维护: 0 (一次配完跑很久)

---

## Step 1: 注册 Apple Developer 账号 ($99/年)

1. 进 https://developer.apple.com/programs/enroll/
2. 用你的 Apple ID 注册（可以新建一个或用现有）
3. 选 "Individual" 或 "Company"（Company 需要 D-U-N-S 号，复杂；Individual 个人足够）
4. 付 $99 USD
5. 等审核（通常 24-48 小时）

---

## Step 2: 在 Apple Developer 创建 Service ID

审核通过后：

1. 进 https://developer.apple.com/account → Certificates, IDs & Profiles → Identifiers
2. 点 ➕ → 选 "Services IDs" → Continue
3. 填写：
   - Description: `Aieats Sign In`
   - Identifier: `com.aieats.signin`（任意，但要记住）
4. Continue → Register
5. 点刚创建的 Service ID → 勾选 "Sign In with Apple" → Configure
6. 配置：
   - **Primary App ID**: 选你的 App ID（如果没有先建一个 App ID）
   - **Domains**: `qoyuafqqkfyrqlthsvws.supabase.co`（Supabase project 域名）
   - **Return URLs**: `https://qoyuafqqkfyrqlthsvws.supabase.co/auth/v1/callback`
7. Save → Continue → Save

---

## Step 3: 创建 Sign In Key + Generate Secret

1. 还是 Certificates, IDs & Profiles → Keys
2. ➕ 创建新 Key
3. 填：
   - Key Name: `Aieats Sign In Key`
   - 勾选 "Sign In with Apple" → Configure → Primary App ID 选你的 App
4. Continue → Register → **下载 .p8 文件**（只能下载一次！丢了重做）
5. 记录：
   - Key ID（10 字符）
   - Team ID（在 Membership 页可见）
   - Service ID（Step 2 填的 `com.aieats.signin`）

---

## Step 4: 在 Supabase 加 Apple Provider

1. 进 https://app.supabase.com → 选 nothinkeats project → Authentication → Providers
2. 找 Apple → Enable
3. 填写：
   - **Service ID**: `com.aieats.signin`（Step 2 的）
   - **Team ID**: Apple Developer 页面右上看到
   - **Key ID**: Step 3 的 Key ID
   - **Secret Key (Private Key)**: 把 Step 3 下载的 .p8 文件**整个内容**（含 `-----BEGIN PRIVATE KEY-----` 等）粘贴进去
4. Save

---

## Step 5: Verify

1. 配置完后等 5-10 分钟传播
2. 进 https://nothinkeats.com/login（无痕窗口）
3. 点 "Apple 登录" 黑色按钮
4. 应该弹出 Apple ID 授权页 ("使用 Apple ID 登录 nothinkeats.com")
5. 授权 → 自动跳回 Home

---

## 常见问题

### 我点 Apple 登录还是 dev login？
- 检查 Supabase Provider 是否 Enable
- 检查 Service ID 是否在 Apple Developer 配置了 Return URL
- 浏览器无痕模式重试

### Apple 拒绝授权
- "Hide my email" 是 Apple 默认行为, OK
- 用户首次授权后 Apple 会自动 trust, 第二次登录无 prompt

### 改 Apple ID 邮箱后用户身份变了?
- 老问题 - Apple ID 改邮箱后我们识别不出是同一人. PDPO 隐私限制, 暂时无解.
  作为内测 issue 留待后续 ticket.

---

## 你不想付 $99 怎么办?

如果暂时不想付 Apple Dev 费, 当前代码已经 ship dev fallback:
- 用户点 "Apple 登录" → Supabase 返回 "provider not enabled" 错误
- Login 自动 fallback 到 devTestLogin → 创建一个 anonymous userId 当 Apple 用户对待
- 用户能进 app 体验, 但你看到的数据全是匿名的（无 email / 无真 Apple ID）

正式上线时还是要付 $99 接通真 Apple OAuth.
