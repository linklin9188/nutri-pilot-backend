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
import BottomTabBar from "../components/BottomTabBar";

// Stripe Payment Link / Price IDs are filled in once the Stripe products are
// created. Until then the "升级" button surfaces a configuration message and
// the dev override button is shown for local testing.
const STRIPE_PRICE_IDS: Record<Exclude<SubscriptionPlan, "free">, string> = {
  pro_monthly:  "price_1TWmfdLBQDUfsQf3bPrGpKkG",  // HK$66/月
  pro_halfyear: "price_1TWmiQLBQDUfsQf3XELFQsp8",  // HK$199/半年
  pro_yearly:   "price_1TWmjFLBQDUfsQf3SErUBlHz",  // HK$365/年
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

const PRO_FEATURES = [
  { emoji: "⭐", title: "米其林灵感菜单", desc: "解锁主厨级菜谱、精致摆盘与高端食材组合" },
  { emoji: "🎉", title: "家宴菜单",       desc: "在家请客 10–20 人，按场合 / 忌口 / 孕妇·助长高自动排菜" },
  { emoji: "🌿", title: "港式祛湿调理",   desc: "按节气 + 身体感受推汤水：冬瓜薏米 / 五指毛桃 / 川贝雪梨…" },
  { emoji: "🎒", title: "学校营养补全",   desc: "输入孩子在校菜单，AI 推荐补全缺口的家常晚餐 3 道" },
  { emoji: "🛒", title: "高端食材采购源", desc: "City'super、SOLE、HKTVmall Premium 直送（即将上线）" },
  { emoji: "👨‍👩‍👧", title: "无限家庭成员", desc: "家庭多人偏好聚合，外佣/长辈/儿童分别建档" },
  { emoji: "📅", title: "全周菜单解锁", desc: "免费版只能看本周前 3 天，Pro 解锁完整 7 天" },
  { emoji: "🔄", title: "无限菜品替换", desc: "不喜欢的菜，一键 AI 换一道（同营养水平）" },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPro, plan: currentPlan, endsAt } = useSubscription();
  const [selected, setSelected] = useState<Exclude<SubscriptionPlan, "free">>("pro_halfyear");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState<string | null>(null);

  // Handle the post-checkout return.
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      refreshSubscriptionFromSupabase().then(s => {
        if (s.isPro) {
          setMessage("订阅成功，已为你解锁 Pro 功能 🎉");
        } else {
          setMessage("正在确认支付，稍等几秒再刷新看看…");
        }
      });
    } else if (status === "canceled") {
      setMessage("已取消支付，没有任何扣款。");
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
      const userId = localStorage.getItem("userId") ?? "";
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
          <p className="text-[11px] text-gray-400 mt-0.5">{isPro ? "你的会员状态" : "解锁全部功能"}</p>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-52 space-y-5">

        {/* Already-Pro state */}
        {isPro && (
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
            {/* Stripe Customer Portal → manage card / cancel / download invoices */}
            <button
              onClick={async () => {
                setLoading(true); setMessage(null);
                try {
                  const userId = localStorage.getItem("userId") ?? "";
                  const resp = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/create-portal-session`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user_id: userId, return_url: window.location.href }),
                    }
                  );
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  const { url } = await resp.json();
                  if (!url) throw new Error("missing portal url");
                  window.location.href = url;
                } catch (e: any) {
                  setMessage(`无法打开管理页面：${e.message}。检查 create-portal-session Edge Function 是否已部署。`);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full h-11 rounded-2xl font-bold text-[13px] active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(255,90,31,0.10)", color: "#FF5A1F" }}
            >
              {loading ? "正在打开 Stripe…" : "管理订阅 / 换卡 / 取消"}
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

        {/* Features */}
        <section className="bg-white rounded-3xl p-5 shadow-sm">
          <h3 className="font-bold text-[14px] mb-3 text-gray-500">Pro 解锁</h3>
          <div className="space-y-3">
            {PRO_FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <span className="text-[22px] flex-shrink-0">{f.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-[14px]">{f.title}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

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

      <BottomTabBar />
    </div>
  );
}
