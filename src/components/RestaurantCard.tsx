/**
 * RestaurantCard — compact weekend dining card + detail modal.
 *
 * Layout (per user direction 2026-05-17: 餐厅介绍压缩短一些、10 家展示
 * 尽量快的看完，点进去有详细信息):
 *
 *   Main card (horizontal, scan-fast):
 *     ┌──────┬─────────────────────────────┐
 *     │      │ 名稱 [MICHELIN] [城市]      │
 *     │ IMG  │ 菜系 · 區域 · $$$           │
 *     │ 80px │ 招牌：xxx                    │
 *     └──────┴─────────────────────────────┘
 *
 *   Tap → RestaurantDetail modal:
 *     hero photo + name + michelin + blurb + reason + 3 booking channels
 *     (WhatsApp / OpenRice / tel) — same BookingSheet as before but
 *     inline in the detail page.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DiningSuggestion } from '../lib/weeklyDiarySummary';
import { type DiningTag, type HkRestaurant, resolveRestaurantImage } from '../lib/hkRestaurants';
import { fetchPlaceData, type PlaceData } from '../lib/placesApi';

const TAG_EMOJI: Record<DiningTag, string> = {
  fish: '🐟', shellfish: '🦐', meat: '🥩', poultry: '🍗', egg: '🥚',
  dairy: '🥛', soy: '🌱', veggie: '🥗', fruit: '🍓', grain: '🌾',
  light: '🍵', banquet: '🌸',
};

function readPartySize(): string {
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '2', 10) || 2;
  const kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10) || 0;
  const total  = adults + kids;
  return kids > 0 ? `${total} 位（含 ${kids} 位小朋友）` : `${total} 位`;
}

function digitsOnly(s: string): string { return s.replace(/\D/g, ''); }

function buildWhatsAppMessage(name: string): string {
  return `你好 ${name}，想預訂今晚 ${readPartySize()} 用餐，請問幾點有位？\n\n（透過 Aieats · 爱吃 推薦）`;
}

function isOpenRice(link: string | undefined): boolean {
  return !!link && /openrice\./i.test(link);
}

export function RestaurantCard({ suggestion }: { suggestion: DiningSuggestion }) {
  const { restaurant: r, reason, tag } = suggestion;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Compact horizontal card — thumb + name + michelin + meta. */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-stretch rounded-2xl overflow-hidden text-left active:scale-[0.99] transition-all"
        style={{
          background: '#FFFDFB',
          border: '1px solid rgba(255,90,31,0.10)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
        {/* Square thumbnail (~88px) — onError fallback chain handles
            stale Unsplash photo IDs so no restaurant card ever shows a
            broken image. 1st fallback: generic fine-dining; 2nd: emoji-only. */}
        <div className="relative shrink-0" style={{ width: 88, background: '#f5f0eb' }}>
          <img
            src={resolveRestaurantImage(r)}
            alt={r.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => {
              const img = e.target as HTMLImageElement;
              // Walk through 2 fallback URLs before giving up to emoji.
              const FALLBACKS = [
                'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80&auto=format&fit=crop',
                'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80&auto=format&fit=crop',
              ];
              const step = Number(img.dataset.fallbackStep ?? '0');
              if (step < FALLBACKS.length) {
                img.dataset.fallbackStep = String(step + 1);
                img.src = FALLBACKS[step];
              } else {
                img.style.display = 'none';
              }
            }}
          />
          <span className="absolute left-1 bottom-1 text-[14px]"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
            {TAG_EMOJI[tag] ?? '🍽'}
          </span>
        </div>

        {/* Right side — name row + meta */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-serif font-black truncate" style={{ fontSize: 14.5, color: '#1a1a1a', letterSpacing: '-0.005em' }}>
              {r.name}
            </p>
            {r.michelin && (
              <span className="px-1.5 py-0.5 rounded-md font-bold tabular-nums shrink-0"
                style={{
                  fontSize: 8.5, letterSpacing: '0.04em',
                  background: r.michelin === 'Bib'
                    ? 'linear-gradient(135deg, #FFF1C7, #FFE49A)'
                    : 'linear-gradient(135deg, #B91C1C, #DC2626)',
                  color: r.michelin === 'Bib' ? '#7A5800' : 'white',
                }}>
                {r.michelin === 'Bib' ? 'BIB' : r.michelin}
              </span>
            )}
            <span className="px-1 py-0.5 rounded-md font-bold shrink-0"
              style={{
                fontSize: 8.5, letterSpacing: '0.04em',
                background: r.city === 'SZ' ? 'rgba(45,165,90,0.12)' : 'rgba(255,90,31,0.10)',
                color:      r.city === 'SZ' ? '#1b7e3f'              : '#FF5A1F',
              }}>
              {r.city === 'SZ' ? '深圳' : '香港'}
            </span>
          </div>
          <p className="mt-0.5 truncate" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.50)' }}>
            {r.cuisine} <span style={{ color: 'rgba(0,0,0,0.25)' }}>·</span> {r.area} <span style={{ color: 'rgba(0,0,0,0.25)' }}>·</span> {r.price_tier}
          </p>
          <p className="mt-1 font-serif italic truncate" style={{ fontSize: 11, color: '#FF5A1F' }}>
            招牌：{r.signature}
          </p>
        </div>
      </button>

      <RestaurantDetailModal
        open={open}
        onClose={() => setOpen(false)}
        suggestion={suggestion}
      />
    </>
  );
}

// ── Detail modal ───────────────────────────────────────────────────
// Full-screen modal (mobile-first, also OK on desktop) with hero + all
// info + 3 booking channels inline. Tap-outside / × / esc to close.

function RestaurantDetailModal({
  open, onClose, suggestion,
}: { open: boolean; onClose: () => void; suggestion: DiningSuggestion }) {
  const { restaurant: r, reason, tag } = suggestion;
  const [copied, setCopied] = useState(false);

  // ── Pre-enriched Places data (DB read) ──────────────────────────────
  // The Places API key was used ONCE locally to enrich into the
  // restaurant_places table + storage bucket. Frontend never calls
  // Google — it reads our DB row by restaurant_id. See src/lib/placesApi.
  const [places, setPlaces] = useState<PlaceData | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchPlaceData(r.id).then(data => {
      if (!cancelled) setPlaces(data);
    });
    return () => { cancelled = true; };
  }, [open, r.id]);

  // Prefer Places real-restaurant photo (Supabase Storage URL) when
  // available, else Unsplash cuisine-category fallback.
  const heroPhoto = places?.imageUrl ?? resolveRestaurantImage(r);
  // Prefer Places-verified phone if it exists and differs from our seed
  // (rare but possible if seed is stale or omitted).
  const phone = places?.phone ?? r.phone ?? null;

  const hasPhone     = !!phone;
  const hasLink      = !!r.link;
  const linkIsOpenRice = isOpenRice(r.link);

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsApp = () => {
    if (!phone) return;
    const msg = buildWhatsAppMessage(r.name);
    openExternal(`https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(msg)}`);
  };

  const handleLink = () => {
    if (r.link) openExternal(r.link);
  };

  const handleCall = () => {
    if (!phone) return;
    navigator.clipboard?.writeText(phone).catch(() => {/* offline-tolerant */});
    setCopied(true);
    window.location.href = `tel:${digitsOnly(phone)}`;
    setTimeout(() => setCopied(false), 1500);
  };

  const handleMaps = () => {
    if (places?.mapsUrl) {
      openExternal(places.mapsUrl);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={onClose}>
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl bg-white overflow-hidden flex flex-col"
            style={{ maxHeight: '92vh', boxShadow: '0 -8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>

            {/* Hero photo (16:9) — Places real shot when available, else
                Unsplash cuisine fallback. */}
            <div className="relative w-full shrink-0" style={{ aspectRatio: '16 / 9', background: '#f5f0eb' }}>
              <img src={heroPhoto} alt={r.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-2/3"
                style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.6))' }} />
              <button onClick={onClose}
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
                <span className="text-white" style={{ fontSize: 16 }}>✕</span>
              </button>
              {r.michelin && (
                <span className="absolute top-3 left-3 px-2 py-1 rounded-md font-bold tabular-nums"
                  style={{
                    fontSize: 10.5, letterSpacing: '0.04em',
                    background: r.michelin === 'Bib'
                      ? 'linear-gradient(135deg, #FFF1C7, #FFE49A)'
                      : 'linear-gradient(135deg, #B91C1C, #DC2626)',
                    color: r.michelin === 'Bib' ? '#7A5800' : 'white',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  }}>
                  {r.michelin === 'Bib' ? 'BIB GOURMAND' : `MICHELIN ${r.michelin}`}
                </span>
              )}
              <div className="absolute left-4 bottom-3 text-white">
                <p className="font-serif font-black"
                  style={{ fontSize: 22, lineHeight: 1.15, textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
                  {r.name}
                </p>
                <p className="mt-0.5" style={{ fontSize: 11, opacity: 0.85, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  {r.cuisine} · {r.area} · {r.city === 'SZ' ? '深圳' : '香港'}
                </p>
              </div>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-[16px]">{TAG_EMOJI[tag] ?? '🍽'}</span>
                <span className="font-bold tabular-nums"
                  style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.06em' }}>
                  {r.price_tier}
                </span>
              </div>

              <p className="font-serif italic" style={{ fontSize: 14, color: '#FF5A1F' }}>
                招牌：{r.signature}
              </p>

              <p className="mt-3 leading-relaxed" style={{ fontSize: 13.5, color: 'rgba(0,0,0,0.78)' }}>
                {r.blurb}
              </p>

              {/* ── Places-enriched info row ─────────────────────────
                  Address + rating + map deep-link. Shows only when we
                  got something back from Places — fully optional so the
                  detail modal works fine even when Places API is rate-
                  limited / disabled / not configured. */}
              {(places?.address || places?.rating) && (
                <div className="mt-3 px-3 py-2.5 rounded-xl flex items-start gap-3"
                  style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <div className="flex-1 min-w-0">
                    {places.rating && (
                      <div className="flex items-baseline gap-1 mb-1">
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                          ⭐ {places.rating.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)' }}>Google 评价</span>
                      </div>
                    )}
                    {places.address && (
                      <p className="truncate" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.55)' }}>
                        📍 {places.address}
                      </p>
                    )}
                  </div>
                  {places.mapsUrl && (
                    <button onClick={handleMaps}
                      className="shrink-0 px-3 py-1 rounded-full font-bold active:scale-95 transition-all"
                      style={{
                        background: 'rgba(66,133,244,0.10)',
                        color: '#1A73E8', fontSize: 11, letterSpacing: '0.04em',
                      }}>
                      导航 →
                    </button>
                  )}
                </div>
              )}

              {reason && (
                <div className="mt-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(255,90,31,0.06)', border: '1px dashed rgba(255,90,31,0.20)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#FF5A1F' }}>
                    為什麼推薦給您
                  </p>
                  <p className="font-serif" style={{ fontSize: 12.5, color: '#1a1a1a', lineHeight: 1.55 }}>
                    {reason}
                  </p>
                </div>
              )}

              {/* Booking channels */}
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(0,0,0,0.5)' }}>
                  預訂 · 三種方式
                </p>
                <p className="font-serif italic mb-3" style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', lineHeight: 1.5 }}>
                  我幫您填好「想預訂今晚 {readPartySize()} 用餐」的訊息。
                </p>

                <div className="flex flex-col gap-2.5">
                  {hasPhone && (
                    <ChannelButton
                      emoji="💬"
                      title="WhatsApp 發訊息預訂"
                      sub="預填好訊息 · 對方在 WhatsApp 內回覆"
                      background="linear-gradient(135deg, #25D366, #1FAE53)"
                      onClick={handleWhatsApp}
                    />
                  )}
                  {hasLink && (
                    <ChannelButton
                      emoji={linkIsOpenRice ? '🍴' : '🌐'}
                      title={linkIsOpenRice ? 'OpenRice 預訂' : '餐廳官網'}
                      sub={linkIsOpenRice ? '查桌位空缺 · 線上立即訂' : '訪問餐廳官方訂位頁'}
                      background="linear-gradient(135deg, #FF5A1F, #FF8C54)"
                      onClick={handleLink}
                    />
                  )}
                  {hasPhone && (
                    <ChannelButton
                      emoji="📞"
                      title={`致電 ${r.phone}`}
                      sub={copied ? '電話已複製 ✓ · 撥號中…' : '手機開撥號 · 電腦複製到剪貼簿'}
                      background="linear-gradient(135deg, #4F5BD5, #6C5CE7)"
                      onClick={handleCall}
                    />
                  )}
                  {!hasPhone && !hasLink && (
                    <p className="text-center py-6 font-serif italic"
                      style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>
                      暫無預訂方式 · 請查 OpenRice 搜尋「{r.name}」
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-5 mb-2 text-center" style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>
                Aieats 不收訂位費 · 預訂直接對接餐廳
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChannelButton({
  emoji, title, sub, background, onClick,
}: { emoji: string; title: string; sub: string; background: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left active:scale-[0.98] transition-all"
      style={{ background }}>
      <span style={{ fontSize: 24, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}>{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white truncate" style={{ fontSize: 14, letterSpacing: '0.02em' }}>
          {title}
        </p>
        <p className="mt-0.5 text-white/85 truncate" style={{ fontSize: 11, lineHeight: 1.4 }}>
          {sub}
        </p>
      </div>
      <span className="text-white/80" style={{ fontSize: 16 }}>→</span>
    </button>
  );
}
