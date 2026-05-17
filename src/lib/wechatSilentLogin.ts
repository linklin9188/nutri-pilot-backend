/**
 * wechatSilentLogin.ts — re-auth WeChat users who lost localStorage.
 *
 * Problem: 微信 X5 webview occasionally drops localStorage between sessions
 * (especially when entering from 公众号 / 朋友圈 / 群聊 share links). Users
 * who already authorized once should not have to tap "微信登录" again — we
 * have their openid in user_profiles, so a silent OAuth with scope=snsapi_base
 * is enough to recognise them.
 *
 * Flow:
 *   1. App boot detects MicroMessenger UA + missing userId + not already
 *      mid-OAuth (no ?code= in URL, not on /auth/wechat/* path).
 *   2. attemptSilent() redirects to WeChat OAuth with scope=snsapi_base.
 *      WeChat skips the consent screen because the openid was already
 *      authorized for this app — the user sees a brief blank flash.
 *   3. /auth/wechat/in bouncer forwards to the edge function.
 *   4. Edge function detects scope=snsapi_base. If the openid matches an
 *      existing user_profiles row → 302 back with userId. If no match
 *      (first-time user) → 302 to /login so they go through the normal
 *      snsapi_userinfo onboarding instead of being silently registered
 *      with a null display_name (the schema requires it).
 *
 * sessionStorage flag `wx_silent_attempted` prevents an infinite loop:
 * if silent OAuth fails (or the user has no record), we only try once
 * per browser session.
 */

import { getUserId } from './userId';

const SS_FLAG = 'wx_silent_attempted';

/** Returns true once silent re-auth has been triggered in this session. */
export function silentAttempted(): boolean {
  return sessionStorage.getItem(SS_FLAG) === '1';
}

/**
 * Should we run silent OAuth right now? True iff:
 *   · running inside the WeChat in-app browser
 *   · no userId on this device
 *   · not currently bouncing through an OAuth callback
 *   · haven't already attempted this session
 */
export function shouldAttemptSilent(): boolean {
  if (typeof window === 'undefined') return false;
  if (!/MicroMessenger/i.test(navigator.userAgent)) return false;
  if (getUserId()) return false;
  if (silentAttempted()) return false;
  // Don't re-trigger while we are mid-OAuth or already on the login page —
  // the user is actively handling auth, our silent attempt would either
  // collide with their explicit one or yank them away from /login.
  const path = window.location.pathname;
  if (path.startsWith('/auth/wechat/')) return false;
  if (path === '/login') return false;
  // ?code= is the OAuth return param — never re-trigger while it's present.
  if (new URLSearchParams(window.location.search).get('code')) return false;
  return true;
}

/**
 * Kick off the silent OAuth. The page redirects to open.weixin.qq.com and
 * never returns to the current React tree, so the caller should render a
 * lightweight placeholder ("正在登录…") while this is in flight.
 */
export function attemptSilent(): void {
  const appid = import.meta.env.VITE_WECHAT_APPID;
  if (!appid) return;
  sessionStorage.setItem(SS_FLAG, '1');
  // Same bouncer path the regular launchWeChat uses — keeps redirect_uri
  // on the whitelisted domain and reuses /auth/wechat/in's single-shot
  // guard against double-code consumption.
  const redirect = encodeURIComponent(`${window.location.origin}/auth/wechat/in`);
  const state = crypto.randomUUID();
  sessionStorage.setItem('wechat_oauth_state', state);
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;
  window.location.replace(url);
}

/** Convenience: returns true and triggers the redirect when applicable. */
export function maybeAttemptSilent(): boolean {
  if (!shouldAttemptSilent()) return false;
  attemptSilent();
  return true;
}
