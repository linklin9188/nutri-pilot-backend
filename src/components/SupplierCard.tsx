/**
 * SupplierCard — shows a single supplier with tier badge.
 * Locked suppliers show a blurred upgrade prompt.
 */

import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Supplier, UserTier, TIER_CONFIG } from "../lib/suppliers";

interface Props {
  supplier:    Supplier;
  userTier:    UserTier;
  ingredient?: string;   // pre-filled search query
  index?:      number;   // for stagger animation
}

const TIER_ORDER: UserTier[] = ['anonymous', 'user', 'premium'];

function isUnlocked(supplierTier: UserTier, userTier: UserTier): boolean {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(supplierTier);
}

export default function SupplierCard({ supplier, userTier, ingredient, index = 0 }: Props) {
  const navigate  = useNavigate();
  const unlocked  = isUnlocked(supplier.tier, userTier);
  const tierCfg   = TIER_CONFIG[supplier.tier];

  const handleClick = () => {
    if (!unlocked) {
      // Locked → prompt upgrade
      if (supplier.tier === 'premium') {
        // show upgrade modal (future: open premium sheet)
        navigate('/signin');
      } else {
        navigate('/signin');
      }
      return;
    }
    const url = ingredient ? supplier.searchUrl(ingredient) : supplier.baseUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25 }}
      className="relative flex flex-col items-start rounded-2xl p-4 text-left w-full overflow-hidden"
      style={{
        background: unlocked
          ? (supplier.bgColor ?? "rgba(255,255,255,0.06)")
          : "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        filter: unlocked ? "none" : "blur(0px)",
        opacity: unlocked ? 1 : 0.55,
      }}
    >
      {/* Tier badge */}
      {supplier.badge && (
        <span
          className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{
            background: unlocked ? `${tierCfg.color}22` : "rgba(255,255,255,0.08)",
            color:      unlocked ? tierCfg.color          : "rgba(255,255,255,0.3)",
          }}
        >
          {unlocked ? supplier.badge : `🔒 ${supplier.badge}`}
        </span>
      )}

      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: 20 }}>{supplier.emoji}</span>
        <span
          className="font-semibold"
          style={{
            fontSize: 14,
            color: unlocked ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
          }}
        >
          {supplier.name_en || supplier.name}
        </span>
      </div>

      {/* Note */}
      {supplier.note && (
        <p
          className="font-light mt-0.5"
          style={{
            fontSize: 11,
            color: unlocked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)",
          }}
        >
          {supplier.note}
        </p>
      )}

      {/* Locked overlay */}
      {!unlocked && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          <div className="text-center">
            <p style={{ fontSize: 18 }}>{tierCfg.icon}</p>
            <p style={{ fontSize: 11, color: tierCfg.color, fontWeight: 600, marginTop: 2 }}>
              {tierCfg.label}专属
            </p>
          </div>
        </div>
      )}
    </motion.button>
  );
}
