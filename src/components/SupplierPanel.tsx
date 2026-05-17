/**
 * SupplierPanel — shows tiered suppliers for a given ingredient or page.
 *
 * Usage:
 *   <SupplierPanel ingredient="松茸" region="hk" />
 *   <SupplierPanel region="hk" />
 */

import { useMemo } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  getAllSuppliers,
  getUserTier,
  UserTier,
  Supplier,
  TIER_CONFIG,
} from "../lib/suppliers";
import SupplierCard from "./SupplierCard";

interface Props {
  ingredient?: string;
  region?:     'hk' | 'mainland';
  compact?:    boolean;   // single-row horizontal scroll
}

const TIER_ORDER: UserTier[] = ['anonymous', 'user', 'premium'];

function tierLabel(t: UserTier) {
  const cfg = TIER_CONFIG[t];
  return `${cfg.icon} ${cfg.label} · ${cfg.description}`;
}

export default function SupplierPanel({ ingredient, region = 'hk', compact = false }: Props) {
  const navigate  = useNavigate();
  const userTier  = getUserTier();
  const allSuppliers = useMemo(() => getAllSuppliers(region), [region]);

  // Group by tier
  const grouped = useMemo<Record<UserTier, Supplier[]>>(() => {
    const g: Record<UserTier, Supplier[]> = { anonymous: [], user: [], premium: [] };
    allSuppliers.forEach(s => g[s.tier].push(s));
    return g;
  }, [allSuppliers]);

  if (compact) {
    // Horizontal scroll card row — show all tiers inline
    return (
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {allSuppliers.map((s, i) => {
          const unlocked = TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(s.tier);
          return (
            <button
              key={s.id}
              onClick={() => {
                if (!unlocked) { navigate('/login'); return; }
                const url = ingredient ? s.searchUrl(ingredient) : s.baseUrl;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 relative overflow-hidden"
              style={{
                minWidth: 72,
                background: unlocked ? (s.bgColor ?? "rgba(255,255,255,0.07)") : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: unlocked ? 1 : 0.5,
              }}
            >
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <span style={{ fontSize: 10, color: unlocked ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", textAlign: 'center', lineHeight: 1.3 }}>
                {s.name}
              </span>
              {!unlocked && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
                  style={{ background: "rgba(0,0,0,0.5)" }}>
                  <span style={{ fontSize: 14 }}>{TIER_CONFIG[s.tier].icon}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {TIER_ORDER.map(tier => {
        const suppliers  = grouped[tier];
        const cfg        = TIER_CONFIG[tier];
        const userHasTier = TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(tier);
        if (suppliers.length === 0) return null;

        return (
          <div key={tier}>
            {/* Tier header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 15 }}>{cfg.icon}</span>
                <span style={{ fontSize: 13, color: userHasTier ? cfg.color : "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                  {cfg.label}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
                  · {cfg.description}
                </span>
              </div>
              {!userHasTier && (
                <button
                  onClick={() => navigate('/login')}
                  className="text-[11px] px-3 py-1 rounded-full font-semibold"
                  style={{ background: `${cfg.color}22`, color: cfg.color }}
                >
                  升级解锁
                </button>
              )}
            </div>

            {/* Supplier grid */}
            <div className="grid grid-cols-2 gap-2">
              {suppliers.map((s, i) => (
                <SupplierCard
                  key={s.id}
                  supplier={s}
                  userTier={userTier}
                  ingredient={ingredient}
                  index={i}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Upgrade CTA for non-premium */}
      {userTier !== 'premium' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl p-4 text-center"
          style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.12), rgba(201,162,39,0.06))", border: "1px solid rgba(201,162,39,0.20)" }}
        >
          <p style={{ fontSize: 20 }}>👑</p>
          <p className="font-semibold mt-1" style={{ fontSize: 14, color: "#C9A227" }}>
            高级会员专属供货商
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            米其林御用食材 · 农场直采 · A5 和牛
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-3 px-5 py-2 rounded-full font-semibold text-[13px]"
            style={{ background: "linear-gradient(135deg, #C9A227, #E8C547)", color: "#1a1400" }}
          >
            了解高级会员 →
          </button>
        </motion.div>
      )}
    </div>
  );
}
