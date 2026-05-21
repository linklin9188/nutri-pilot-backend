/**
 * LearnerHome — Chinese-cooking learning mode for unaffiliated helpers
 * (UI 013 §C placeholder; UI 014 §M filled out with beige + invite banner).
 * Rendered by HelperHome when localStorage.nutri_helper_mode === 'learner'.
 * No household_members link — standalone profile.
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import HelperBottomTabBar from "../components/HelperBottomTabBar";

type Cuisine = {
  id: string;
  emoji: string;
  labelEn: string;
  labelZh: string;
  labelTl: string;
  gradient: string;
};

const CUISINES: Cuisine[] = [
  { id: "cantonese", emoji: "🥟", labelEn: "Cantonese",  labelZh: "粤菜",    labelTl: "Cantonese",  gradient: "linear-gradient(135deg, #FF5A1F, #FF9054)" },
  { id: "sichuan",   emoji: "🌶️", labelEn: "Sichuan",    labelZh: "川菜",    labelTl: "Sichuan",    gradient: "linear-gradient(135deg, #E63946, #F77F00)" },
  { id: "jiangnan",  emoji: "🍚", labelEn: "Jiangnan",   labelZh: "江浙菜",  labelTl: "Jiangnan",   gradient: "linear-gradient(135deg, #06B6D4, #3B82F6)" },
  { id: "northern",  emoji: "🥢", labelEn: "Northern",   labelZh: "北方菜",  labelTl: "Northern",   gradient: "linear-gradient(135deg, #A16207, #D97706)" },
  { id: "hongkong",  emoji: "🍜", labelEn: "Hong Kong",  labelZh: "港式",    labelTl: "Hong Kong",  gradient: "linear-gradient(135deg, #DC2626, #F59E0B)" },
  { id: "western",   emoji: "🥗", labelEn: "Western",    labelZh: "西式",    labelTl: "Kanluran",   gradient: "linear-gradient(135deg, #16A34A, #84CC16)" },
  { id: "vegetarian",emoji: "🥦", labelEn: "Vegetarian", labelZh: "素食",    labelTl: "Gulayan",    gradient: "linear-gradient(135deg, #059669, #10B981)" },
];

export default function LearnerHome() {
  const navigate = useNavigate();
  const { language, setLanguage, isTagalog, isChinese } = useLanguage();

  // Invite-code modal state (UI 014 §M — prominent inline upgrade flow).
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  // Learners are helpers — never zh. Snap to en if stale.
  useEffect(() => {
    if (language === "zh" || language === "zh-Hant") {
      setLanguage("en");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t3 = (en: string, _zh: string, tl: string) =>
    isTagalog ? tl : en;

  const heroTitle  = t3("Learn Chinese Cooking", "学中国菜", "Matuto ng Lutuing Tsino");
  const heroSubtitle = t3(
    "Browse 7 cuisines · Step-by-step guidance",
    "浏览 7 大菜系 · 一步步引导",
    "Mag-browse ng 7 lutuin · Hakbang-hakbang"
  );
  const browseRecipesLabel = t3("Browse Recipes", "浏览菜谱", "Mag-browse ng Recipe");
  const joinCommunityLabel = t3("Community", "社区", "Komunidad");

  const handleCuisineTap = (cuisineId: string) => {
    // Stash chosen cuisine so /cook can filter once it's wired up; for now
    // just route to /cook which already lists all dishes.
    localStorage.setItem("nutri_learner_cuisine", cuisineId);
    navigate("/cook");
  };

  // Inline invite-code join (mirror of HelperHome.handleJoinHousehold).
  async function handleJoinHousehold() {
    const code = codeInput.trim();
    if (code.length !== 6) {
      setCodeError(t3("Please enter a 6-digit code", "请输入 6 位邀请码", "6-digit code lang"));
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setCodeError(t3("Please sign in first", "请先登录", "Mag-sign in muna"));
      return;
    }
    setCodeLoading(true);
    setCodeError("");

    const { data: hh } = await supabase
      .from("households")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!hh) {
      setCodeError(t3(
        "Code not found. Ask your employer for the correct code.",
        "邀请码无效，请向雇主核对",
        "Walang code. Tanungin ang employer."
      ));
      setCodeLoading(false);
      return;
    }

    const { error } = await supabase
      .from("household_members")
      .upsert(
        { household_id: hh.id, helper_id: userId, status: "active" },
        { onConflict: "household_id,helper_id" }
      );

    if (error) {
      setCodeError(t3("Something went wrong. Please try again.", "出错了，请重试", "May problema. Subukan ulit."));
      setCodeLoading(false);
      return;
    }

    // Promote learner → regular helper. Wipe learner flag, reload HelperHome.
    localStorage.removeItem("nutri_helper_mode");
    setCodeLoading(false);
    navigate("/helper");
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative"
      style={{ background: "#FEF7E5", color: "#1a1a1a", paddingBottom: 96 }}>

      {/* Hero — warm gradient on beige instead of dark slab */}
      <div className="px-6 pt-12 pb-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(120% 80% at 50% 0%, rgba(255,90,31,0.10), transparent 65%)",
        }} />
        <div className="relative flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 26 }}>🌱</span>
            <span className="font-bold" style={{ fontSize: 12, letterSpacing: "0.08em", color: "rgba(0,0,0,0.6)" }}>
              {t3("LEARNER MODE", "学习模式", "MODE NG MAG-AARAL")}
            </span>
          </div>
          <button
            onClick={() => setLanguage(language === "tl" ? "en" : "tl")}
            className="px-3 py-1 rounded-full active:scale-95"
            style={{ background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.10)", fontSize: 11, color: "#1a1a1a" }}
          >
            {language === "tl" ? "TL" : "EN"}
          </button>
        </div>
        <h1 className="font-bold leading-tight mb-2 relative" style={{ fontSize: 28, color: "#1a1a1a" }}>
          {heroTitle}
        </h1>
        <p className="relative" style={{ fontSize: 14, color: "rgba(0,0,0,0.65)" }}>
          {heroSubtitle}
        </p>
      </div>

      {/* Upgrade-to-employer banner (UI 014 §M — top-prominent invite_code link).
          Inline expandable, mirror of HelperHome.showCodeInput so learners can
          upgrade without bouncing back to /login. */}
      <div className="px-5 mb-4">
        {showCodeInput ? (
          <div className="flex flex-col gap-2 px-4 py-4 rounded-2xl"
            style={{ background: "#FFFFFF", border: "1px solid rgba(255,90,31,0.25)", boxShadow: "0 4px 14px rgba(255,90,31,0.10)" }}>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginBottom: 4 }}>
              {t3(
                "Enter the 6-digit code from your employer:",
                "输入雇主的 6 位邀请码：",
                "Ilagay ang 6-digit code mula sa employer:"
              )}
            </p>
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-xl px-4 py-2.5 font-black text-center tracking-[0.25em]"
                style={{
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.15)",
                  color: "#1a1a1a",
                  fontSize: 20,
                  outline: "none",
                }}
              />
              <button
                onClick={handleJoinHousehold}
                disabled={codeLoading || codeInput.length !== 6}
                className="px-4 rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                style={{ background: "#FF5A1F", fontSize: 13 }}>
                {codeLoading ? "…" : t3("Join", "加入", "Sumali")}
              </button>
            </div>
            {codeError && <p style={{ fontSize: 11, color: "#d63838" }}>{codeError}</p>}
            <button onClick={() => setShowCodeInput(false)}
              style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
              {t3("Cancel", "取消", "Kanselahin")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCodeInput(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-all"
            style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.30)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#FF5A1F" }}>family_home</span>
            <div className="flex-1 text-left">
              <p className="font-bold" style={{ fontSize: 13, color: "#1a1a1a" }}>
                {t3("Got hired? Join an employer", "已就职？加入雇主家庭", "Natanggap na? Sumali sa employer")}
              </p>
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                {t3(
                  "Enter the 6-digit invite code your employer shared",
                  "输入雇主分享的 6 位邀请码",
                  "Ilagay ang 6-digit invite code"
                )}
              </p>
            </div>
            <span style={{ fontSize: 16, color: "#FF5A1F" }}>›</span>
          </button>
        )}
      </div>

      {/* Cuisine grid */}
      <div className="px-5 mt-2">
        <h2 className="font-semibold mb-3" style={{ fontSize: 13, letterSpacing: "0.04em", color: "rgba(0,0,0,0.65)" }}>
          {t3("Pick a cuisine to explore", "选一个菜系开始学", "Pumili ng lutuin")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CUISINES.map(c => (
            <button
              key={c.id}
              onClick={() => handleCuisineTap(c.id)}
              className="flex flex-col items-start rounded-2xl p-4 gap-2 active:scale-[0.97] transition-all"
              style={{ background: c.gradient, boxShadow: "0 6px 18px rgba(0,0,0,0.15)" }}
            >
              <span style={{ fontSize: 32, lineHeight: 1 }}>{c.emoji}</span>
              <span className="font-bold text-white" style={{ fontSize: 16 }}>
                {isChinese ? c.labelZh : isTagalog ? c.labelTl : c.labelEn}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Secondary actions */}
      <div className="px-5 mt-6 flex flex-col gap-3">
        <button
          onClick={() => navigate("/cook")}
          className="w-full h-[52px] rounded-2xl flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          style={{ background: "#FF5A1F", color: "white", fontSize: 14, boxShadow: "0 6px 18px rgba(255,90,31,0.30)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>soup_kitchen</span>
          {browseRecipesLabel}
        </button>
        <button
          onClick={() => navigate("/community")}
          className="w-full h-[52px] rounded-2xl flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.10)", color: "#1a1a1a", fontSize: 14 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.7)" }}>groups</span>
          {joinCommunityLabel}
        </button>
      </div>

      <HelperBottomTabBar />
    </div>
  );
}
