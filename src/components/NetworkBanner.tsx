/**
 * NetworkBanner — TICKET-047 §B offline-state strip.
 *
 * Listens to `online` / `offline` window events and renders a one-line
 * amber strip at the top of the viewport when the device is offline.
 * Auto-dismisses the moment the device reconnects. Mounted once at
 * AppShell root so every route inherits the indicator without per-page
 * wiring.
 *
 * Pure presentational + window event subscription — no state library
 * needed, no localStorage, no DB. Safe to render before any auth state
 * is resolved.
 */
import { useEffect, useState } from 'react';

export default function NetworkBanner() {
  // Initial value uses navigator.onLine. The very-first paint may show the
  // banner momentarily on slow networks if the API reports false but the
  // request that triggered render was actually online — that's a benign
  // false-positive cleared on the first 'online' event tick.
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed left-0 right-0 z-[90] flex items-center justify-center gap-1.5 px-3 py-1.5"
      style={{
        top:        'env(safe-area-inset-top, 0px)',
        background: 'rgba(245,158,11,0.95)',
        color:      'white',
        fontSize:   11.5,
        fontWeight: 600,
        boxShadow:  '0 2px 8px rgba(245,158,11,0.30)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>wifi_off</span>
      <span>网络断了，部分功能不可用 — 数据已本地保存</span>
    </div>
  );
}
