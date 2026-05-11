/**
 * HelperHome — domestic helper task dashboard (English only)
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface DayDish {
  title?: string;
  title_zh?: string;
  img?: string;
  image_url?: string;
}

const TASKS = [
  {
    id: "shopping",
    icon: "fact_check",
    label: "Check Ingredients at Home",
    desc: "Tick off what's already in the pantry",
    gradient: "linear-gradient(135deg, #FF5A1F, #FF9054)",
    shadow: "rgba(255,90,31,0.35)",
    route: "/verify",
  },
  {
    id: "prep",
    icon: "menu_book",
    label: "Prep Steps",
    desc: "How to prepare & portion ingredients",
    gradient: "linear-gradient(135deg, #6C5CE7, #a29bfe)",
    shadow: "rgba(108,92,231,0.35)",
    route: "/prep",
  },
  {
    id: "cook",
    icon: "soup_kitchen",
    label: "Start Cooking",
    desc: "Step-by-step guide · Voice control",
    gradient: "linear-gradient(135deg, #00B4D8, #0077B6)",
    shadow: "rgba(0,180,216,0.35)",
    route: "/cook",
  },
  {
    id: "community",
    icon: "groups",
    label: "Cooking Community",
    desc: "Share your dishes · Earn Friday rewards",
    gradient: "linear-gradient(135deg, #f7971e, #ffd200)",
    shadow: "rgba(255,210,0,0.35)",
    route: "/community",
  },
];

export default function HelperHome() {
  const navigate = useNavigate();
  const [dishes, setDishes] = useState<DayDish[]>([]);
  const [helperName, setHelperName] = useState("");
  const [isLinked, setIsLinked] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeDone, setCodeDone] = useState(false);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    "Good evening";

  const dateLabel = now.toLocaleDateString("en-HK", {
    weekday: "long", month: "long", day: "numeric",
  });

  useEffect(() => {
    const raw = localStorage.getItem("generatedMenu");
    if (raw) {
      try { setDishes(JSON.parse(raw)); } catch { /* ignore */ }
    }
    const userId = localStorage.getItem("userId");
    if (userId) {
      supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle()
        .then(({ data }) => { if ((data as any)?.display_name) setHelperName((data as any).display_name); });
      // Check if already linked to a household
      supabase.from("household_members").select("id").eq("helper_id", userId).eq("status", "active").maybeSingle()
        .then(({ data }) => { if (data) setIsLinked(true); });
    }
  }, []);

  async function handleJoinHousehold() {
    const code = codeInput.trim();
    if (code.length !== 6) { setCodeError("Please enter a 6-digit code"); return; }
    const userId = localStorage.getItem("userId");
    if (!userId) { setCodeError("Please sign in first"); return; }

    setCodeLoading(true);
    setCodeError("");

    // Find household by invite code
    const { data: hh } = await supabase
      .from("households")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!hh) {
      setCodeError("Code not found. Ask your employer for the correct code.");
      setCodeLoading(false);
      return;
    }

    // Join the household
    const { error } = await supabase
      .from("household_members")
      .upsert({ household_id: hh.id, helper_id: userId, status: "active" }, { onConflict: "household_id,helper_id" });

    if (error) {
      setCodeError("Something went wrong. Please try again.");
    } else {
      setIsLinked(true);
      setCodeDone(true);
      setShowCodeInput(false);
    }
    setCodeLoading(false);
  }

  function handleInvite() {
    const url = `${window.location.origin}/signin?role=helper`;
    const text = encodeURIComponent(
      `Hey! I use Aieats to manage cooking for my employer — shopping list, prep steps, voice cooking guide. Join me and earn rewards every Friday! ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#0a0a0a", paddingBottom: 40 }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(37,211,102,0.12) 0%, transparent 55%)",
      }} />

      {/* Header */}
      <div className="relative z-10 px-5 pt-14 pb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)" }}>{greeting}</p>
            <h1 className="font-serif font-black text-white mt-0.5" style={{ fontSize: 28 }}>
              {helperName || "My Tasks"}
            </h1>
          </div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(37,211,102,0.15)", border: "1.5px solid rgba(37,211,102,0.3)" }}>
            <span className="material-symbols-outlined text-[#25D366]"
              style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>support_agent</span>
          </div>
        </div>

        {/* Date + dish count */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <span className="material-symbols-outlined text-white/40" style={{ fontSize: 14 }}>calendar_today</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{dateLabel}</span>
          <span className="ml-auto" style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
            {dishes.length > 0 ? `${dishes.length} dishes today` : "No menu yet"}
          </span>
        </div>
      </div>

      {/* Today's dish strip */}
      {dishes.length > 0 && (
        <div className="relative z-10 px-5 mb-5">
          <p className="mb-2" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
            TODAY'S MENU
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {dishes.map((dish, i) => (
              <div key={i} className="flex-shrink-0 rounded-xl overflow-hidden relative"
                style={{ width: 72, height: 72 }}>
                <img
                  src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"}
                  alt={dish.title || dish.title_zh}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"; }}
                />
                <div className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 60%)" }} />
                <p className="absolute bottom-1 left-1 right-1 text-white font-semibold leading-tight"
                  style={{ fontSize: 9 }}>
                  {dish.title || dish.title_zh}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Household link banner */}
      <div className="relative z-10 px-5 mb-4">
        {codeDone ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)" }}>
            <span className="material-symbols-outlined text-[#25D366]" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p style={{ fontSize: 13, color: "#25D366", fontWeight: 600 }}>Linked to employer's household! 🎉</p>
          </div>
        ) : isLinked ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.15)" }}>
            <span className="material-symbols-outlined text-[#25D366]" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>link</span>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Connected to employer household</p>
          </div>
        ) : showCodeInput ? (
          <div className="flex flex-col gap-2 px-4 py-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Enter the 6-digit code from your employer:</p>
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-xl px-4 py-2.5 font-black text-center tracking-[0.25em]"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 20, outline: "none" }}
              />
              <button
                onClick={handleJoinHousehold}
                disabled={codeLoading || codeInput.length !== 6}
                className="px-4 rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                style={{ background: "#25D366", fontSize: 13 }}>
                {codeLoading ? "..." : "Join"}
              </button>
            </div>
            {codeError && <p style={{ fontSize: 11, color: "#ff6b6b" }}>{codeError}</p>}
            <button onClick={() => setShowCodeInput(false)} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowCodeInput(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}>
            <span className="material-symbols-outlined text-white/30" style={{ fontSize: 18 }}>link</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Enter employer invite code</p>
            <span className="ml-auto" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>›</span>
          </button>
        )}
      </div>

      {/* Task cards */}
      <div className="relative z-10 px-5 flex flex-col gap-3 mb-6">
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
          TODAY'S TASKS
        </p>
        {TASKS.map(task => (
          <button
            key={task.id}
            onClick={() => navigate(task.route)}
            className="w-full flex items-center gap-4 p-5 rounded-3xl transition-all active:scale-[0.97]"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: task.gradient, boxShadow: `0 6px 20px ${task.shadow}` }}>
              <span className="material-symbols-outlined text-white"
                style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>{task.icon}</span>
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-white" style={{ fontSize: 16 }}>{task.label}</p>
              <p className="mt-0.5" style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{task.desc}</p>
            </div>
            <span className="material-symbols-outlined text-white/20" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
        ))}
      </div>

      {/* Invite friends */}
      <div className="relative z-10 px-5 mb-4">
        <button
          onClick={handleInvite}
          className="w-full py-4 rounded-2xl flex items-center gap-3 active:scale-[0.98] transition-all"
          style={{ background: "rgba(37,211,102,0.09)", border: "1px solid rgba(37,211,102,0.2)" }}
        >
          <span style={{ fontSize: 22 }}>📲</span>
          <div className="flex-1 text-left">
            <p className="font-semibold text-white" style={{ fontSize: 13 }}>Invite helper friends</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Share via WhatsApp · Earn 50 pts per referral
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-full font-bold text-white text-[12px]"
            style={{ background: "#25D366" }}>
            Share
          </div>
        </button>
      </div>

      {/* Switch account */}
      <div className="relative z-10 flex justify-center">
        <button
          onClick={() => { localStorage.removeItem("nutri_role"); navigate("/signin"); }}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.18)" }}
        >
          Switch account
        </button>
      </div>
    </div>
  );
}
