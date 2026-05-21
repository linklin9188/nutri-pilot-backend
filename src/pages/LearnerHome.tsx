/**
 * LearnerHome — Chinese-cooking learning mode for unaffiliated helpers
 * (UI 013 §C). Rendered by HelperHome when localStorage.nutri_helper_mode
 * === 'learner'. No household_members link — standalone profile.
 */

import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";

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
  const haveEmployerLabel  = t3(
    "Already have an employer? Enter invite code",
    "已有雇主？输入邀请码",
    "May employer na? Ipasok ang invite code"
  );

  const handleCuisineTap = (cuisineId: string) => {
    // Stash chosen cuisine so /cook can filter once it's wired up; for now
    // just route to /cook which already lists all dishes.
    localStorage.setItem("nutri_learner_cuisine", cuisineId);
    navigate("/cook");
  };

  const handleUpgradeToEmployer = () => {
    // Wipe learner flag, route to /login?role=helper so user can enter
    // invite_code path.
    localStorage.removeItem("nutri_helper_mode");
    navigate("/login?role=helper");
  };

  return (
    <div className="min-h-screen bg-bg text-white" style={{ paddingBottom: 96 }}>
      {/* Hero */}
      <div
        className="px-6 pt-10 pb-8"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(255,90,31,0.18), transparent 60%), #0F0F0F",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 28 }}>🌱</span>
            <span className="font-bold text-white/85" style={{ fontSize: 13, letterSpacing: "0.08em" }}>
              {t3("LEARNER MODE", "学习模式", "MODE NG MAG-AARAL")}
            </span>
          </div>
          <button
            onClick={() => setLanguage(language === "tl" ? "en" : "tl")}
            className="px-3 py-1 rounded-full text-white/70 active:scale-95"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)", fontSize: 11 }}
          >
            {language === "tl" ? "TL" : "EN"}
          </button>
        </div>
        <h1 className="text-white font-bold leading-tight mb-2" style={{ fontSize: 28 }}>
          {heroTitle}
        </h1>
        <p className="text-white/65" style={{ fontSize: 14 }}>
          {heroSubtitle}
        </p>
      </div>

      {/* Cuisine grid */}
      <div className="px-5 mt-6">
        <h2 className="text-white/80 font-semibold mb-3" style={{ fontSize: 14, letterSpacing: "0.04em" }}>
          {t3("Pick a cuisine to explore", "选一个菜系开始学", "Pumili ng lutuin")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CUISINES.map(c => (
            <button
              key={c.id}
              onClick={() => handleCuisineTap(c.id)}
              className="flex flex-col items-start rounded-2xl p-4 gap-2 active:scale-[0.97] transition-all"
              style={{ background: c.gradient, boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
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
      <div className="px-5 mt-8 flex flex-col gap-3">
        <button
          onClick={() => navigate("/community")}
          className="w-full h-[52px] rounded-2xl flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "white", fontSize: 14 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>groups</span>
          {joinCommunityLabel}
        </button>
        <button
          onClick={() => navigate("/cook")}
          className="w-full h-[52px] rounded-2xl flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          style={{ background: "#FF5A1F", color: "white", fontSize: 14, boxShadow: "0 6px 18px rgba(255,90,31,0.30)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>soup_kitchen</span>
          {browseRecipesLabel}
        </button>
        <button
          onClick={handleUpgradeToEmployer}
          className="w-full py-3 text-center text-white/55 active:scale-95"
          style={{ fontSize: 13, textDecoration: "underline" }}
        >
          {haveEmployerLabel}
        </button>
      </div>
    </div>
  );
}
