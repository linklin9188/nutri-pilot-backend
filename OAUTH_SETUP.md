# OAuth Setup — `nothinkeats.com`

How to wire real Facebook / Instagram / Google / Apple sign-in once
credentials arrive. Today's code falls back to a local `devTestLogin`
(fake UUID per browser) when OAuth is missing — visible to anyone, fine
for test phase, **must be removed before public launch**.

## 1. Where the OAuth code lives

- `src/pages/SignIn.tsx` — primary entry, `/signin?role=helper|employer`
  - `tryOAuth(provider, redirectPath, scopes)` calls `supabase.auth.signInWithOAuth`
  - `startSocialLogin(provider)` wraps it with a 1.5s fallback to `devTestLogin`
  - `handleWeChat` is a pure stub (Supabase has no WeChat provider)
- `src/pages/Login.tsx` — secondary entry, `/login`
  - `launchOAuth(provider)` + `launchWeChat()` for the 公众号 网页授权 flow
- `src/App.tsx`:62 — `AppShell` restores Supabase auth session via
  `supabase.auth.getSession()` on boot

When OAuth succeeds, Supabase auth fires `onAuthStateChange` and
`App.tsx` copies `session.user.id` into `localStorage.userId` /
`nutri_user_id`. From there, `getUserId()` in `src/lib/userId.ts` is the
canonical reader for every other component.

## 2. Facebook (covers Instagram too, via Meta SSO)

### 2a. Meta Developer side

Friend or user creates an account at <https://developers.facebook.com/>
and runs these steps:

1. **Create App**: My Apps → Create App → "Consumer" → Display name
   "Aieats / 爱吃". Contact email: `jianjiaolin9@gmail.com`.
2. **Add Facebook Login product**: Sidebar → Products → "Set up"
   Facebook Login (Web platform).
3. **Site URL**: `https://nothinkeats.com`
4. **Valid OAuth Redirect URIs**:
   `https://qoyuafqqkfyrqlthsvws.supabase.co/auth/v1/callback`
   (matches Supabase project ref — do NOT use `nothinkeats.com/...`
   directly; Supabase brokers the OAuth handshake.)
5. **Privacy Policy URL**: `https://nothinkeats.com/privacy`
6. **Terms of Service URL**: `https://nothinkeats.com/terms`
7. **App Domain**: `nothinkeats.com`, `qoyuafqqkfyrqlthsvws.supabase.co`
8. **Switch App to Live mode** (top-right toggle) after FB review accepts
   the URLs above. App stays in Dev mode otherwise — only the app
   admin / testers can log in.
9. **Copy down**: App ID (16 digits) + App Secret (32-char hex).

### 2b. Supabase Dashboard side

Project: <https://supabase.com/dashboard/project/qoyuafqqkfyrqlthsvws/auth/providers>

1. **Auth → Providers → Facebook → enable**.
2. Paste **Facebook App ID** + **Facebook App Secret** from step 2a.9.
3. **Save**.
4. (Optional) **URL Configuration → Site URL**:
   `https://nothinkeats.com`. **Redirect URLs allow-list**:
   `https://nothinkeats.com/*`. Without this, Supabase rejects the
   `redirectTo` in `tryOAuth()`.

That's it for FB. Instagram inherits the same App (Meta SSO).

## 3. Google (zero cost, fastest if user changes mind)

1. **Google Cloud Console** → "OAuth consent screen" → External → fill
   in app name, contact, privacy URL, terms URL.
2. **Credentials → Create Credentials → OAuth client ID** → Web app.
3. **Authorized redirect URI**:
   `https://qoyuafqqkfyrqlthsvws.supabase.co/auth/v1/callback`
4. Copy **Client ID** + **Client Secret**.
5. **Supabase Dashboard → Auth → Providers → Google → enable** → paste.

## 4. Apple Sign In (iOS Safari users)

Requires Apple Developer Program ($99/yr). When ready:

1. **Apple Developer → Certificates → Identifiers → App IDs**: register
   `com.aieats.web` (or similar) with Sign In with Apple capability.
2. **Services IDs**: register `com.aieats.web.signin`, set Domain
   `nothinkeats.com` and Return URL
   `https://qoyuafqqkfyrqlthsvws.supabase.co/auth/v1/callback`.
3. **Keys**: create new key with Sign In with Apple service → download
   the `.p8` file.
4. **Supabase Dashboard → Auth → Providers → Apple → enable**:
   - Services ID: `com.aieats.web.signin`
   - Team ID: 10-char (from Apple Developer membership page)
   - Key ID: from step 3
   - Private Key: contents of `.p8` file

## 5. WeChat (公众号 网页授权)

Supabase has no first-party WeChat provider. Path:

1. **公众号 个人认证** (300 RMB, 数日审核) — at <https://mp.weixin.qq.com>
2. Open 「设置 → 公众号设置 → 功能设置 → 网页授权域名」, add
   `nothinkeats.com`.
3. The existing edge function `supabase/functions/wechat-mp-callback/`
   already handles the code → openid exchange + user_profiles upsert.
4. Set `VITE_WECHAT_APPID` env on Railway with the 公众号 AppID.
5. Update SignIn `handleWeChat` to call the OAuth URL the same way
   `Login.launchWeChat()` already does.

For the 小程序 (wechat-mp/), web-view 内 `wx.login` already captures
the code automatically — no UI change needed once the callback edge
function is hooked up.

## 6. Removing the `devTestLogin` fallback for production

Once **at least one real provider** works, do this in one PR:

```diff
// SignIn.tsx — startSocialLogin
- const res = await tryOAuth("facebook", redirectPath, scopes);
- if (!res.ok) {
-   devTestLogin(role, provider);
-   goAfterLogin(role);
-   return;
- }
+ const res = await tryOAuth("facebook", redirectPath, scopes);
+ if (!res.ok) {
+   setError(res.error ?? '登录失败，请稍后重试');
+   return;
+ }
```

Also delete `devTestLogin()` and the WeChat stub. The only remaining
WeChat path should be the real 公众号 网页授权 flow (Login.tsx pattern).

## 7. End-to-end testing checklist

- [ ] Open `/signin` in an incognito browser (no `localStorage`).
- [ ] Tap Facebook → redirects to `facebook.com/v17.0/dialog/oauth/...`
      (NOT staying on `/signin` with a fake login).
- [ ] After granting, returns to `https://nothinkeats.com/` (or
      `/setup` for new users) with a real `session.user.id` in
      `localStorage.userId`.
- [ ] Settings → 我的口味 → 改一个偏好 → 重开浏览器 → 口味偏好保留.
- [ ] On second device, log in with same FB account → 看到首个设备的
      menu cache (via `syncFavoritesFromCloud` etc.)
