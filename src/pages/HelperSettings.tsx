/**
 * HelperSettings — domestic helper settings hub (TICKET-036 §1)
 *
 * 老板真测发现菲佣端缺"设置主界面"——HelperHome / HelperCommunity /
 * HelperCook / HelperPrep 4 个功能页之外，菲佣没法集中管理自己资料、
 * 切换雇主端、登出。本页补上 7 个区块（仅 §1，本棒不做 5-tab bar）：
 *
 *  1. 顶部头像区（复用雇主 Settings 头像视觉 + 主色橙）
 *  2. 国籍选择 (origin_country: PH / ID) — 跟 HelperHome 同 source-of-truth
 *  3. 我的口味偏好 — Phase 1 显 "暂无偏好数据" placeholder (helper 不参与
 *     算法，未来从 community 互动反推)
 *  4. 推荐 helper 朋友 (WhatsApp share) — 积分文案保留，底层奖励 ship 1000
 *     用户后
 *  5. 💎 积分余额 — Phase 1 隐 (注释 TODO，待积分系统 ship)
 *  6. 切换到雇主端
 *  7. 账号区（登出 + 帮助）
 *
 * 红线：
 *  - 永不出现 "试用 / trial / Free trial" 字眼（helper 永久免费 invariant）
 *  - 不显示雇主端的家庭成员管理（helper 不管家庭成员）
 *  - 登出必清所有 localStorage helper 相关 key，不只 userId
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId, clearUserId } from "../lib/userId";
import { useLanguage } from "../contexts/LanguageContext";
import HelperTabBar from "../components/HelperTabBar";
import InviteCodeBindCard from "../components/InviteCodeBindCard";

interface HelperProfile {
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  origin_country?: string | null;
}

export default function HelperSettings() {
  const navigate = useNavigate();
  const { t3, cycleLanguageForRole, language, setLanguage } = useLanguage();

  // Helper view never uses Chinese — snap back to English if a stale
  // employer-side appLanguage leaked in (mirror of HelperHome behavior).
  useEffect(() => {
    if (language === "zh" || language === "zh-Hant") {
      setLanguage("en");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const langChip = language === "tl" ? "TL"
                 : language === "id" ? "ID"
                 : "EN";

  const [profile, setProfile] = useState<HelperProfile>({});
  const [loading, setLoading] = useState(true);
  const [savingOrigin, setSavingOrigin] = useState(false);
  // TICKET-097 — 菲佣是否已绑 household (决定 InviteCodeBindCard 显示状态)
  const [isLinked, setIsLinked] = useState(false);

  const userId = getUserId();

  // TICKET-097 — 拉一次菲佣绑定状态 (loadEmployerTodayMenu 同款 query 简化)
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('household_members')
      .select('household_id')
      .eq('helper_id', userId)
      .eq('status', 'active')
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setIsLinked(true);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    supabase
      .from("user_profiles")
      .select("display_name, nickname, avatar_url, origin_country")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile((data as HelperProfile) ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  // Display name fallback chain: display_name → nickname → userId.slice(0,8)
  // (DB 实际 nullable 即便代码默认非空 — CLAUDE.md Smell 1 phase 1 兜底).
  const displayName =
    profile.display_name?.trim() ||
    profile.nickname?.trim() ||
    (userId ? userId.slice(0, 8) : "");

  async function saveOriginCountry(code: "PH" | "ID") {
    if (!userId) return;
    setSavingOrigin(true);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: userId, origin_country: code }, { onConflict: "id" });
    setSavingOrigin(false);
    if (!error) setProfile(p => ({ ...p, origin_country: code }));
  }

  function handleInviteFriends() {
    const url = `${window.location.origin}/login?role=helper`;
    const text = encodeURIComponent(
      `Hey! I use Aieats to manage cooking for my employer — shopping list, prep steps, voice cooking guide. Join me! ${url}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function handleSwitchToEmployer() {
    // role=helper 标记清掉后跳 /login，让用户选择雇主登录路径
    // (Login.tsx 默认 role=employer)
    localStorage.removeItem("nutri_role");
    localStorage.removeItem("nutri_helper_mode");
    navigate("/login");
  }

  function handleLogout() {
    // 全清 helper 相关 key — 不只 userId（避免下次访问残留态把用户
    // 错引到 /helper）。getUserId() 双 key 通过 clearUserId() 一并清掉.
    clearUserId();
    [
      "nutri_role",
      "nutri_helper_mode",
      "isLoggedIn",
      "generatedMenu",  // HelperHome 缓存的菜单 JSON
    ].forEach(k => localStorage.removeItem(k));
    navigate("/login");
  }

  function handleHelp() {
    window.location.href = "mailto:support@nothinkeats.com?subject=Aieats%20Helper%20Support";
  }

  const originCountry = profile.origin_country ?? null;

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#FEF7E5", paddingBottom: 96, color: "#1a1a1a" }}
    >
      {/* Ambient glow — match HelperHome warm beige + faint orange */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.06) 0%, transparent 55%)",
        }}
      />

      {/* Header — back arrow + title + language chip */}
      <div className="relative z-10 px-5 pt-14 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/helper")}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: "rgba(0,0,0,0.05)" }}
            aria-label="Back"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#1a1a1a" }}>
              arrow_back
            </span>
          </button>
          <h1 className="font-serif font-black" style={{ fontSize: 22, color: "#1a1a1a" }}>
            {t3("Settings", "设置", "Mga Setting")}
          </h1>
        </div>
        <button
          onClick={cycleLanguageForRole}
          className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background: "rgba(37,211,102,0.15)",
            border: "1.5px solid rgba(37,211,102,0.3)",
          }}
          title="EN / Tagalog / Indonesian"
          aria-label="Switch language"
        >
          <span
            className="font-black text-[#25D366]"
            style={{ fontSize: 14, letterSpacing: "0.04em" }}
          >
            {langChip}
          </span>
        </button>
      </div>

      {/* §1 Avatar block */}
      <div className="relative z-10 px-5 mb-5">
        <div
          className="flex items-center gap-4 px-5 py-5 rounded-3xl"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-16 h-16 rounded-2xl object-cover"
              style={{ border: "2px solid rgba(255,90,31,0.20)" }}
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-white"
              style={{
                background: "linear-gradient(135deg, #FF5A1F, #FF9054)",
                fontSize: 24,
                boxShadow: "0 6px 18px rgba(255,90,31,0.30)",
              }}
            >
              {displayName ? displayName.charAt(0).toUpperCase() : "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate" style={{ fontSize: 17, color: "#1a1a1a" }}>
              {loading
                ? t3("Loading…", "加载中…", "Naglo-load…")
                : displayName || t3("Helper", "工人", "Helper")}
            </p>
            <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.25)" }}>
              <span style={{ fontSize: 10 }}>🧑‍🍳</span>
              <span className="font-bold" style={{ fontSize: 10, color: "#B84A0F" }}>
                {t3("HELPER", "菲佣", "HELPER")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* §2 Origin country */}
      <div className="relative z-10 px-5 mb-4">
        <p className="font-bold mb-2" style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}>
          {t3("🌍 NATIONALITY", "🌍 国籍", "🌍 NASYONALIDAD")}
        </p>
        <div
          className="px-4 py-4 rounded-3xl"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => saveOriginCountry("PH")}
              disabled={savingOrigin}
              className="rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-95 transition-all"
              style={{
                background:
                  originCountry === "PH" ? "rgba(0, 56, 168, 0.18)" : "rgba(0, 56, 168, 0.06)",
                border:
                  originCountry === "PH"
                    ? "2px solid rgba(0, 56, 168, 0.50)"
                    : "1.5px solid rgba(0, 56, 168, 0.20)",
              }}
            >
              <span style={{ fontSize: 28 }}>🇵🇭</span>
              <span className="font-bold" style={{ fontSize: 12, color: "#1a1a1a" }}>
                {t3("Philippines", "菲律宾", "Pilipinas")}
              </span>
            </button>
            <button
              onClick={() => saveOriginCountry("ID")}
              disabled={savingOrigin}
              className="rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-95 transition-all"
              style={{
                background:
                  originCountry === "ID" ? "rgba(206, 17, 38, 0.18)" : "rgba(206, 17, 38, 0.06)",
                border:
                  originCountry === "ID"
                    ? "2px solid rgba(206, 17, 38, 0.50)"
                    : "1.5px solid rgba(206, 17, 38, 0.20)",
              }}
            >
              <span style={{ fontSize: 28 }}>🇮🇩</span>
              <span className="font-bold" style={{ fontSize: 12, color: "#1a1a1a" }}>
                {t3("Indonesia", "印度尼西亚", "Indonesia")}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* TICKET-097 — 雇主绑定卡 (从 HelperHome 主页挪过来, 老板真测 5/27).
          已绑显示成功 green chip; 未绑显示输入 6 位邀请码入口. */}
      <div className="relative z-10 px-5 mb-4">
        <p className="font-bold mb-2"
          style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}>
          {t3("🔗 EMPLOYER BINDING", "🔗 绑定雇主", "🔗 PAGUUGNAY SA EMPLOYER")}
        </p>
        <InviteCodeBindCard
          isLinked={isLinked}
          onBound={() => setIsLinked(true)}
        />
      </div>

      {/* §3 Taste preferences (display-only, learned-by-algo placeholder) */}
      <div className="relative z-10 px-5 mb-4">
        <p
          className="font-bold mb-2"
          style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}
        >
          {t3("🎯 MY TASTE PROFILE", "🎯 我的口味偏好", "🎯 PANLASA KO")}
        </p>
        <div
          className="px-4 py-5 rounded-3xl text-center"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 6 }}>📊</div>
          <p className="font-semibold mb-1" style={{ fontSize: 13, color: "#1a1a1a" }}>
            {t3(
              "No data yet",
              "暂无偏好数据",
              "Wala pang datos",
            )}
          </p>
          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", lineHeight: 1.5 }}>
            {t3(
              "Use the community more — we'll learn your taste automatically",
              "多用社区，会自动学到你的口味",
              "Gamitin ang community — matututunan namin ang panlasa mo",
            )}
          </p>
        </div>
      </div>

      {/* §4 Invite helper friends — WhatsApp share */}
      <div className="relative z-10 px-5 mb-4">
        <p
          className="font-bold mb-2"
          style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}
        >
          {t3("👥 INVITE FRIENDS", "👥 邀请朋友", "👥 MAG-IMBITA")}
        </p>
        <button
          onClick={handleInviteFriends}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-3xl active:scale-[0.98] transition-all"
          style={{
            background: "rgba(37,211,102,0.10)",
            border: "1px solid rgba(37,211,102,0.30)",
          }}
        >
          <span style={{ fontSize: 24 }}>📲</span>
          <div className="flex-1 text-left">
            <p className="font-bold" style={{ fontSize: 14, color: "#1a1a1a" }}>
              {t3("Invite helper friends", "邀请其他工人朋友", "Mag-imbita ng kaibigang helper")}
            </p>
            <p className="mt-0.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
              {t3(
                "Share via WhatsApp · Earn 50 pts per referral",
                "WhatsApp 分享 · 每位 50 分",
                "WhatsApp · 50 puntos kada imbita",
              )}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-full font-bold text-white"
            style={{ background: "#25D366", fontSize: 12 }}
          >
            {t3("Share", "分享", "Ibahagi")}
          </div>
        </button>
      </div>

      {/* §5 Points balance — HIDDEN Phase 1.
          TODO: enable when 积分系统 1000 用户后 ship (老板拍板 1C 推迟). */}

      {/* §6 Switch to employer view */}
      <div className="relative z-10 px-5 mb-4">
        <p
          className="font-bold mb-2"
          style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}
        >
          {t3("🔄 SWITCH ROLE", "🔄 切换角色", "🔄 PALITAN ANG ROLE")}
        </p>
        <button
          onClick={handleSwitchToEmployer}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-3xl active:scale-[0.98] transition-all"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #FF5A1F, #FF9054)",
              boxShadow: "0 6px 18px rgba(255,90,31,0.30)",
            }}
          >
            <span
              className="material-symbols-outlined text-white"
              style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
            >
              swap_horiz
            </span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold" style={{ fontSize: 14, color: "#1a1a1a" }}>
              {t3("Switch to employer view", "切换到雇主端", "Lumipat sa employer view")}
            </p>
            <p className="mt-0.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
              {t3(
                "Sign in as employer to manage menu",
                "用雇主账号登录管理菜单",
                "Mag-sign in bilang employer para sa menu",
              )}
            </p>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: "rgba(0,0,0,0.3)" }}
          >
            chevron_right
          </span>
        </button>
      </div>

      {/* §7 Account — help + logout */}
      <div className="relative z-10 px-5 mb-6">
        <p
          className="font-bold mb-2"
          style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", letterSpacing: "0.08em" }}
        >
          {t3("🚪 ACCOUNT", "🚪 账号", "🚪 ACCOUNT")}
        </p>
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={handleHelp}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/[0.02] transition-colors text-left"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: "rgba(0,0,0,0.55)" }}
            >
              help
            </span>
            <p className="flex-1 font-semibold" style={{ fontSize: 13, color: "#1a1a1a" }}>
              {t3("Help & contact", "帮助 / 联系", "Tulong at kontak")}
            </p>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: "rgba(0,0,0,0.3)" }}
            >
              chevron_right
            </span>
          </button>
          <div style={{ height: 1, background: "rgba(0,0,0,0.05)", marginLeft: 16 }} />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/[0.02] transition-colors text-left"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: "#d63838" }}
            >
              logout
            </span>
            <p className="flex-1 font-semibold" style={{ fontSize: 13, color: "#d63838" }}>
              {t3("Sign out", "退出登录", "Mag-sign out")}
            </p>
          </button>
        </div>
      </div>

      {/* TICKET-058 §2 — settings 不再是底部 tab 之一 (从 helper 主页右上 ⚙️ 进入).
          不传 active prop → 4 tab 都不高亮. 仍渲染 tab bar 以便从 settings 回到其他页. */}
      <HelperTabBar />
    </div>
  );
}
