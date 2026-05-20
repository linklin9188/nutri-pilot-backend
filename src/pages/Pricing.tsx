/**
 * Pricing — subscription / upgrade page.
 *
 * Flow (target):
 *   1. User picks monthly or yearly.
 *   2. Frontend POSTs to /functions/v1/create-checkout-session
 *      with { user_id, price_id, return_url }.
 *   3. Backend (Supabase Edge Function) creates a Stripe Checkout Session
 *      and returns its `url`. We redirect the browser there.
 *   4. After payment Stripe redirects to /pricing?status=success.
 *      The `stripe-webhook` Edge Function has already flipped is_pro=true
 *      in user_profiles. On mount we refresh and show the success state.
 *
 * Flow (today): Stripe wiring is pending. The "升级" button calls a stub
 * that explains what's needed; a "Skip payment (dev)" button is available
 * for testing the gated features end-to-end.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useSubscription,
  refreshSubscriptionFromSupabase,
  devActivatePro,
  devCancelPro,
  type SubscriptionPlan,
} from "../lib/subscription";
import { getUserId } from "../lib/userId";
import BottomTabBar from "../components/BottomTabBar";
import MembershipBenefits from "../components/MembershipBenefits";

// Stripe Payment Link / Price IDs are filled in once the Stripe products are
// created. Until then the "升级" button surfaces a configuration message and
// the dev override button is shown for local testing.
const STRIPE_PRICE_IDS: Record<Exclude<SubscriptionPlan, "free">, string> = {
  pro_monthly:  "price_1TXD3dL2TBEx2Gg0TRBnWrE9",  // HK$66/月
  pro_halfyear: "price_1TXDCwL2TBEx2Gg0n6pSJLsJ",  // HK$199/半年
  pro_yearly:   "price_1TXDDjL2TBEx2Gg05nADOkJb",  // HK$365/年
};

// Early-bird promo: monthly subscribers pay HK$30 for the first 3 months
// instead of HK$66. Implement on Stripe side via a Coupon (3 months 55% off)
// attached to the monthly Price, or via a promotion code surfaced at checkout.
const EARLY_BIRD = { price: 30, months: 3 };

const PLANS = [
  {
    id: "pro_monthly" as const,
    label: "月度",
    price: 66,
    unit: "/月",
    savings: null,
    note: `早鸟价 HK$${EARLY_BIRD.price} / 月，前 ${EARLY_BIRD.months} 个月`,
    badge: "🎁 早鸟",
  },
  {
    id: "pro_halfyear" as const,
    label: "半年",
    price: 199,
    unit: "/半年",
    savings: "省 HK$197",
    note: "约 HK$33 / 月",
    badge: null,
  },
  {
    id: "pro_yearly" as const,
    label: "年度",
    price: 365,
    unit: "/年",
    savings: "省 HK$427",
    note: "约 HK$30 / 月 · 最划算",
    badge: "🔥 推荐",
  },
];


export default function Pricing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPro, isPaidPro, proReason, plan: currentPlan, endsAt } = useSubscription();
  const [selected, setSelected] = useState<Exclude<SubscriptionPlan, "free">>("pro_halfyear");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState<string | null>(null);

  // Handle the post-checkout AND post-portal return. The Customer Portal
  // sends the user back to return_url after any action (cancel / change card
  // / nothing). We refresh subscription state and surface the right toast.
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      refreshSubscriptionFromSupabase().then(s => {
        if (s.isPro) {
          setMessage("订阅好啦，已为您解锁 Pro 🎉");
        } else {
          setMessage("正在确认支付，稍等几秒再刷新看看…");
        }
      });
    } else if (status === "canceled") {
      setMessage("已取消支付，没有任何扣款。");
    } else if (status === "portal_returned") {
      // TICKET-037 §A — refresh state, show the right cancel/change toast.
      refreshSubscriptionFromSupabase().then(s => {
        if (!s.isPro) {
          // Already lost Pro entirely — webhook caught up to a cancel.
          setMessage("订阅已取消。");
        } else if (s.endsAt) {
          const iso = s.endsAt.toISOString().slice(0, 10);
          setMessage(`订阅已更新 · 期至 ${iso} 仍可用`);
        } else {
          setMessage("订阅设置已保存。");
        }
      });
    }
  }, [searchParams]);

  async function handleUpgrade() {
    setMessage(null);
    const priceId = STRIPE_PRICE_IDS[selected];
    if (!priceId) {
      setMessage(
        "Stripe Product 还没配置。请在 Stripe Dashboard 创建一个订阅产品，把 price_id 填进 src/pages/Pricing.tsx 的 STRIPE_PRICE_IDS。"
      );
      return;
    }

    setLoading(true);
    try {
      // Calls a Supabase Edge Function that creates a Stripe Checkout Session
      // server-side (Stripe Secret Key never touches the browser).
      const userId = getUserId() ?? "";
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/create-checkout-session`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id:    userId,
            price_id:   priceId,
            return_url: `${window.location.origin}/pricing`,
          }),
        }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const { url } = await resp.json();
      if (!url) throw new Error("missing checkout url");
      window.location.href = url;
    } catch (e: any) {
      setMessage(`无法发起支付：${e.message}。检查 Supabase Edge Function 是否已部署。`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold">爱吃 Pro</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{isPro ? "您的会员状态" : "解锁全部功能"}</p>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-52 space-y-5">

        {/* 拓客期免费 banner removed 2026-05-16 — Pro features now require
            payment for all employer users; only helpers are still free. */}

        {/* Helper-永久免费 banner — defensive, helpers normally don't reach this page. */}
        {proReason === 'helper' && (
          <section className="bg-white rounded-3xl p-6 shadow-sm space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[32px]">🧑‍🍳</span>
              <div>
                <h2 className="font-bold text-[18px]">助理永久免费</h2>
                <p className="text-[12px] text-gray-500">家政助理使用爱吃从不收费，请放心使用。</p>
              </div>
            </div>
          </section>
        )}

        {/* Already-paid state — only show when the user actually paid Stripe. */}
        {isPaidPro && (
          <section className="bg-white rounded-3xl p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[32px]">✨</span>
              <div>
                <h2 className="font-bold text-[18px]">你是 Pro 会员</h2>
                <p className="text-[12px] text-gray-500">
                  {currentPlan === "pro_yearly" ? "年度套餐"
                    : currentPlan === "pro_halfyear" ? "半年套餐"
                    : currentPlan === "pro_monthly" ? "月度套餐"
                    : "Pro"}
                  {endsAt && ` · 到期 ${endsAt.toISOString().slice(0,10)}`}
                </p>
              </div>
            </div>
            {/* Stripe Customer Portal → manage card / cancel / download invoices.
                TICKET-037 §A: icon + tooltip + loading + error toast (not raw HTTP
                code text). return_url 带 ?portal=returned 让 useEffect 上面捕获
                portal 回跳并刷新订阅状态。 */}
            <button
              onClick={async () => {
                if (loading) return; // anti double-click
                setLoading(true); setMessage(null);
                try {
                  const userId = getUserId() ?? "";
                  const returnUrl = `${window.location.origin}/pricing?status=portal_returned`;
                  const resp = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/create-portal-session`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user_id: userId, return_url: returnUrl }),
                    }
                  );
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  const { url } = await resp.json();
                  if (!url) throw new Error("missing portal url");
                  window.location.href = url;
                } catch {
                  // Friendlier toast — hides the HTTP / debug detail.
                  setMessage("暂时无法跳转，请稍后或联系客服");
                  setLoading(false);
                }
                // Note: on success the browser leaves this page entirely so we
                // don't reset loading in a finally — keeping the button locked
                // visually until the redirect completes.
              }}
              disabled={loading}
              title="改卡 / 暂停 / 退订"
              className="w-full h-11 rounded-2xl font-bold text-[13px] active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              style={{ background: "rgba(255,90,31,0.10)", color: "#FF5A1F" }}
            >
              {loading ? (
                <>
                  <span
                    className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden
                  />
                  正在跳转 Stripe…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>credit_card</span>
                  管理订阅 / 换卡 / 取消
                </>
              )}
            </button>
            <button
              onClick={() => {
                if (confirm("确定要取消 Pro 状态吗？仅 dev 测试用。")) devCancelPro();
              }}
              className="w-full text-[11px] text-gray-400 underline"
            >
              取消 Pro（dev only）
            </button>
          </section>
        )}

        {/* Hero */}
        {!isPro && (
          <section
            className="rounded-3xl p-6 text-white"
            style={{
              background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 60%, #FFB347 100%)",
              boxShadow: "0 12px 32px rgba(255,90,31,0.30)",
            }}
          >
            <p className="text-[12px] uppercase tracking-widest opacity-80">爱吃 Pro</p>
            <h2 className="font-serif font-black text-[28px] leading-tight mt-1">
              主厨级菜单<br />家也吃得讲究
            </h2>
            <p className="mt-3 text-[13px] opacity-90">
              米其林灵感的家常版菜谱 + 高端食材直采，让每一餐都升级。
            </p>
          </section>
        )}

        {/* Features — single source of truth in MembershipBenefits so the
            Pricing upsell + Settings post-buy surface never drift apart. */}
        <MembershipBenefits isPro={isPro} />

        {/* Plans */}
        {!isPro && (
          <section className="space-y-3">
            <h3 className="font-bold text-[14px] text-gray-500 px-1">选择套餐</h3>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map(p => {
                const active = selected === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className="relative rounded-2xl p-3 text-left transition-all active:scale-[0.98]"
                    style={{
                      background: "white",
                      border: active ? "2px solid #FF5A1F" : "2px solid transparent",
                      boxShadow: active ? "0 8px 24px rgba(255,90,31,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    {p.badge && (
                      <span
                        className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{
                          background: p.id === "pro_yearly"
                            ? "linear-gradient(135deg, #FF5A1F, #FF8C54)"
                            : "linear-gradient(135deg, #FFD700, #FFA500)",
                          color: "white",
                        }}
                      >
                        {p.badge}
                      </span>
                    )}
                    <p className="font-bold text-[13px]">{p.label}</p>
                    <p className="font-serif font-black text-[20px] mt-1 leading-tight">
                      HK${p.price}
                    </p>
                    <p className="text-[10px] font-medium text-gray-400">{p.unit}</p>
                    {p.savings && (
                      <p className="text-[10px] font-bold mt-1" style={{ color: "#16a34a" }}>
                        {p.savings}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{p.note}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {message && (
          <div className="rounded-2xl px-4 py-3 text-[13px]"
            style={{ background: "rgba(255,90,31,0.08)", color: "#7a3000", border: "1px solid rgba(255,90,31,0.20)" }}>
            {message}
          </div>
        )}
      </main>

      {/* CTA footer */}
      {!isPro && (
        <div className="fixed bottom-[60px] left-0 right-0 max-w-md mx-auto bg-white border-t border-black/5 px-5 py-4 space-y-2">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full h-[52px] rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
              boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
              fontSize: 15,
            }}
          >
            {loading ? "跳转支付中…" : `升级到 Pro · HK$${PLANS.find(p => p.id === selected)?.price}`}
          </button>
          <button
            onClick={() => { devActivatePro(selected); setMessage("已开启 Pro（dev 模式，未走支付）"); }}
            className="w-full text-[12px] text-gray-400 underline py-1"
          >
            Skip payment (dev only)
          </button>
        </div>
      )}

      {/* TICKET-047 §C — 横向对比矩阵 + FAQ。Visible to both free + paid users
          so paid users see what they have and free users see what they unlock.
          Sits between the plan selector / portal CTA and the bottom tab bar. */}
      <CompareMatrix currentPlan={currentPlan} />

      <BottomTabBar />
    </div>
  );
}

// ── TICKET-047 §C — Pricing compare matrix + FAQ accordion ────────────────
type PlanId = 'free' | 'pro_monthly' | 'pro_halfyear' | 'pro_yearly';

interface FeatureRow {
  label:    string;
  // 1 = ✓, 0 = ✗; per-plan boolean. Order: free / monthly / halfyear / yearly.
  free:     0 | 1;
  monthly:  0 | 1;
  halfyear: 0 | 1;
  yearly:   0 | 1;
}

const FEATURES: FeatureRow[] = [
  { label: '整周菜单生成',              free: 1, monthly: 1, halfyear: 1, yearly: 1 },
  { label: '一键采购清单',              free: 1, monthly: 1, halfyear: 1, yearly: 1 },
  { label: '米其林菜单',               free: 0, monthly: 1, halfyear: 1, yearly: 1 },
  { label: '学校营养均衡',             free: 0, monthly: 1, halfyear: 1, yearly: 1 },
  { label: '节庆推荐 (7 节庆)',         free: 0, monthly: 1, halfyear: 1, yearly: 1 },
  { label: 'ChatAgent AI 对话',         free: 0, monthly: 1, halfyear: 1, yearly: 1 },
  { label: 'Pantry 持久化（我家有）',    free: 0, monthly: 1, halfyear: 1, yearly: 1 },
  { label: '家宴菜单（10–20 人）',      free: 0, monthly: 0, halfyear: 1, yearly: 1 },
  { label: '港式祛湿调理',              free: 0, monthly: 0, halfyear: 1, yearly: 1 },
  { label: '大厨上门预约',              free: 0, monthly: 0, halfyear: 0, yearly: 1 },
];

interface FAQ {
  q: string;
  a: string;
}
const FAQS: FAQ[] = [
  {
    q: '什么时候选 HK$66 月度？',
    a: '想先试一两个月看 AI 推荐能不能跟你家口味、再决定要不要长期续。月度灵活，随时退订。',
  },
  {
    q: '什么时候选 HK$199 半年？',
    a: '已经决定用爱吃当主要菜单工具的家庭，半年付平均月费降到 HK$33，多解锁家宴 / 港式祛湿两个 Pro 工具。',
  },
  {
    q: '什么时候升 HK$365 年？',
    a: '有"找大厨上门"需求（节庆 / 寿宴 / 月子餐）的家庭，年付才解锁这一项；同时月费降到 HK$30，全年最低单价。',
  },
  {
    q: '中途升级 / 降级会怎样？',
    a: '随时可以在 "管理订阅" 里调整套餐。Stripe 按比例自动退差价 / 补差价，不会重复扣费。',
  },
];

function CompareMatrix({ currentPlan }: { currentPlan: PlanId }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const cellOk = '✓';
  const cellNo = '–';
  const PLANS_HEADER: { key: 'free' | 'monthly' | 'halfyear' | 'yearly'; label: string; price: string }[] = [
    { key: 'free',     label: '免费',  price: 'HK$0'   },
    { key: 'monthly',  label: '月度',  price: 'HK$66'  },
    { key: 'halfyear', label: '半年',  price: 'HK$199' },
    { key: 'yearly',   label: '年度',  price: 'HK$365' },
  ];
  const isCurrent = (k: typeof PLANS_HEADER[number]['key']) =>
    (k === 'free'     && currentPlan === 'free') ||
    (k === 'monthly'  && currentPlan === 'pro_monthly')  ||
    (k === 'halfyear' && currentPlan === 'pro_halfyear') ||
    (k === 'yearly'   && currentPlan === 'pro_yearly');

  return (
    <section className="bg-white rounded-3xl p-4 shadow-sm space-y-3 mt-2 mb-8">
      <h3 className="font-bold" style={{ fontSize: 15 }}>套餐对比</h3>

      {/* Matrix table */}
      <div className="rounded-2xl overflow-hidden border border-black/[0.06]">
        {/* Header row */}
        <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] text-center" style={{ background: 'rgba(0,0,0,0.03)' }}>
          <div className="px-3 py-2 text-left" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.50)' }}>
            功能
          </div>
          {PLANS_HEADER.map(p => {
            const active = isCurrent(p.key);
            return (
              <div key={p.key} className="px-1 py-2"
                style={{ background: active ? 'rgba(255,90,31,0.10)' : 'transparent' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: active ? '#FF5A1F' : '#1a1a1a' }}>
                  {p.label}
                </p>
                <p style={{ fontSize: 9.5, color: active ? '#FF5A1F' : 'rgba(0,0,0,0.45)', fontWeight: 600 }}>
                  {p.price}
                </p>
              </div>
            );
          })}
        </div>
        {/* Feature rows */}
        {FEATURES.map((row, i) => (
          <div key={i} className="grid grid-cols-[1.4fr_repeat(4,1fr)] text-center"
            style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <div className="px-3 py-2 text-left" style={{ fontSize: 11.5, color: '#1a1a1a' }}>
              {row.label}
            </div>
            {(['free', 'monthly', 'halfyear', 'yearly'] as const).map(k => {
              const has = row[k] === 1;
              const active = isCurrent(k);
              return (
                <div key={k} className="px-1 py-2"
                  style={{
                    background: active ? 'rgba(255,90,31,0.04)' : 'transparent',
                    fontSize: 12.5,
                    color: has ? (active ? '#FF5A1F' : '#16A34A') : 'rgba(0,0,0,0.22)',
                    fontWeight: has ? 700 : 500,
                  }}>
                  {has ? cellOk : cellNo}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* FAQ accordion */}
      <h3 className="font-bold pt-1" style={{ fontSize: 15 }}>常见问题</h3>
      <div className="rounded-2xl overflow-hidden border border-black/[0.06]">
        {FAQS.map((faq, i) => {
          const open = openIdx === i;
          return (
            <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
              <button onClick={() => setOpenIdx(open ? null : i)}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left active:bg-black/[0.02]">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a1a' }}>{faq.q}</span>
                <span className="material-symbols-outlined shrink-0"
                  style={{
                    fontSize: 16, color: 'rgba(0,0,0,0.45)',
                    transition: 'transform 0.2s',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                  expand_more
                </span>
              </button>
              {open && (
                <p className="px-3 pb-3" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.62)', lineHeight: 1.6 }}>
                  {faq.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
