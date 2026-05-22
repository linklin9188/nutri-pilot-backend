/**
 * CandidateGrid — TICKET-022 §A production grid
 *
 * Renders a horizontal scrollable strip of SlotChoice candidates (Algorithm 018 §A:
 * SlotPlan { primary, candidates[] }). User taps a card → onPick(choice) fires.
 *
 * Extracted from the DEV-only proto (src/pages/__protos__/CandidateGridProto.tsx)
 * for production reuse. Shared by:
 *   - WeeklyMenu.tsx — dinner refresh button expands grid in place
 *   - Home.tsx       — per-dish "看其他选择" toggles grid
 *
 * Visual contract:
 *   - Primary (first) candidate: orange #FF8C54 border + ⭐ "首选" chip
 *   - User-picked candidate (controlled via `pickedId`): #FF5A1F border + shadow
 *   - Each card shows TagBadgeRow (top 2 channels)
 *   - Score % displayed at bottom (matching CandidateGridProto)
 */
import type { SlotChoice } from '../hooks/useWeeklyMenu';
import { TagBadgeRow } from './TagBadge';

export interface CandidateGridProps {
  /** SlotPlan.candidates[] — includes primary as first entry. */
  candidates: SlotChoice[];
  /** ID of dish currently picked (for highlight). Controlled by parent. */
  pickedId?: string | null;
  /** Fires when user taps a candidate. */
  onPick: (choice: SlotChoice) => void;
  /** Tone — 'dark' for #0a0a0a-bg pages (WeeklyMenu), 'light' for #FAF7F2 (Home). */
  tone?: 'dark' | 'light';
}

export default function CandidateGrid({ candidates, pickedId, onPick, tone = 'dark' }: CandidateGridProps) {
  if (!candidates || candidates.length === 0) return null;

  const isDark = tone === 'dark';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'white';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const titleColor = isDark ? 'white' : '#1a1a1a';
  const descColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
  const scoreColor = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1" style={{ scrollbarWidth: 'none' }}>
      {candidates.map((c, idx) => {
        const isPrimary = idx === 0;
        const isPicked  = pickedId != null && c.dish?.id === pickedId;
        const title = (c.dish as any).title_zh || (c.dish as any).title_en || (c.dish as any).title || '';
        const desc  = (c.dish as any).description_zh || (c.dish as any).description_en || '';
        const img   = (c.dish as any).img || (c.dish as any).image_url || '';
        return (
          <button
            key={c.dish?.id ?? idx}
            onClick={() => onPick(c)}
            className="rounded-2xl flex-shrink-0 text-left p-2 active:scale-[0.97] transition-all"
            style={{
              width: 132,
              background: cardBg,
              border: isPicked
                ? '2px solid #FF5A1F'
                : isPrimary
                  ? '2px solid #FF8C54'
                  : `1px solid ${cardBorder}`,
              boxShadow: isPicked
                ? '0 6px 18px rgba(255,90,31,0.30)'
                : isPrimary
                  ? '0 4px 12px rgba(255,140,84,0.15)'
                  : 'none',
            }}
          >
            {isPrimary && (
              <div className="inline-block rounded-full px-1.5 py-0.5 mb-1.5"
                style={{ background: '#FF8C54', color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>
                ⭐ 首选
              </div>
            )}
            <div className="w-full rounded-xl mb-1.5 flex items-center justify-center overflow-hidden"
              style={{ aspectRatio: '1', background: 'rgba(255,90,31,0.08)' }}>
              {img ? (
                <img src={img} alt={title} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span style={{ fontSize: 28 }}>🍽️</span>
              )}
            </div>
            <p className="font-bold leading-tight" style={{ fontSize: 12, color: titleColor }}>{title}</p>
            {desc && (
              <p className="mt-0.5 leading-tight truncate" style={{ fontSize: 10, color: descColor }}>{desc}</p>
            )}
            <TagBadgeRow badges={c.tagBadges ?? []} />
            <p className="mt-1.5" style={{ fontSize: 9, color: scoreColor }}>
              {(c.score * 100).toFixed(0)}%
            </p>
          </button>
        );
      })}
    </div>
  );
}
