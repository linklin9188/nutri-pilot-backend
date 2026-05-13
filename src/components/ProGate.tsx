/**
 * ProGate — paywall component that wraps a feature.
 *
 * Usage:
 *   <ProGate feature="michelin" reason="本周菜单升级至米其林风格">
 *     <MichelinMenu />
 *   </ProGate>
 *
 * Renders children if the user is Pro. Otherwise shows a teaser with a CTA
 * that takes the user to /pricing.
 */

import { useNavigate } from "react-router-dom";
import { useSubscription } from "../lib/subscription";

interface ProGateProps {
  feature: "michelin" | "premium_sourcing" | "banquet";
  reason?: string;          // override the default teaser headline
  children: React.ReactNode;
}

const FEATURE_COPY: Record<ProGateProps["feature"], { title: string; sub: string; emoji: string }> = {
  michelin: {
    emoji: "⭐",
    title: "米其林灵感菜单",
    sub: "解锁主厨级菜谱、精致摆盘与高端食材组合",
  },
  premium_sourcing: {
    emoji: "🛒",
    title: "高端食材采购源",
    sub: "City'super、SOLE、HKTVmall Premium 直送，品质可追溯",
  },
  banquet: {
    emoji: "🎉",
    title: "宴请规划",
    sub: "10–20 人宴席自动排菜，按场合 / 人数 / 风格定制",
  },
};

export function ProGate({ feature, reason, children }: ProGateProps) {
  const { isPro, loading } = useSubscription();
  const navigate = useNavigate();

  // Avoid flashing the paywall while the Supabase row is being fetched.
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-[#FF5A1F] rounded-full animate-spin" />
      </div>
    );
  }

  if (isPro) return <>{children}</>;

  const copy = FEATURE_COPY[feature];
  return (
    <div
      className="rounded-3xl p-6 text-center"
      style={{
        background: "linear-gradient(135deg, rgba(255,90,31,0.08), rgba(255,140,84,0.04))",
        border: "1px solid rgba(255,90,31,0.18)",
      }}
    >
      <div className="text-[40px] mb-2">{copy.emoji}</div>
      <h3 className="font-serif font-black text-[20px] mb-1" style={{ color: "#1a1a1a" }}>
        {reason ?? copy.title}
      </h3>
      <p className="text-[13px] text-gray-500 mb-5">{copy.sub}</p>
      <button
        onClick={() => navigate("/pricing")}
        className="px-6 py-3 rounded-full font-bold text-white text-[14px] transition-all active:scale-95"
        style={{
          background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
          boxShadow: "0 8px 24px rgba(255,90,31,0.30)",
        }}
      >
        升级解锁 →
      </button>
    </div>
  );
}

/**
 * Compact inline paywall — for sitting alongside an existing feature row
 * rather than replacing the whole content.
 */
export function ProBadge({ feature }: { feature: ProGateProps["feature"] }) {
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  if (isPro) return null;

  const copy = FEATURE_COPY[feature];
  return (
    <button
      onClick={() => navigate("/pricing")}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
      style={{
        background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
        color: "white",
        boxShadow: "0 4px 12px rgba(255,90,31,0.25)",
      }}
      title={copy.sub}
    >
      <span>{copy.emoji}</span>
      Pro
    </button>
  );
}
