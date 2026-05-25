/**
 * Cart — /cart 购物车页 (TICKET-080-A).
 *
 * 流程: /verify 加车 → 顶部 cart icon → /cart 列表 → "去结账" → /checkout.
 *
 * 080-A:
 *   - 显示 cart_items (跨设备 sync 自 shopping_carts UNIQUE user_id)
 *   - +/- 改数量 → updateCartItemQty 实时 DB
 *   - 删除 → removeFromCart
 *   - 空状态 → 引导回 /verify
 *   - 底部 sticky "去结账" 跳 /checkout
 *
 * 080-B 接 Stripe 时 /checkout 会从 cart 取 items, 这里不变.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import {
  loadCart,
  updateCartItemQty,
  removeFromCart,
  type CartItem,
  type CartState,
} from '../lib/cart';

export default function Cart() {
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  const [state, setState] = useState<CartState>({ cartId: null, items: [], subtotalHkd: 0 });
  const [loading, setLoading] = useState(true);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const refresh = async () => {
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }
    const next = await loadCart(uid);
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    // 监听 cart 变化事件 (其他 tab / 子组件触发)
    const handler = () => { refresh(); };
    window.addEventListener('nutri-cart-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('nutri-cart-changed', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQtyChange = async (item: CartItem, delta: number) => {
    if (pendingItemId) return;
    const newQty = item.qty + delta;
    setPendingItemId(item.id);
    try {
      if (newQty <= 0) {
        await removeFromCart(item.id);
      } else {
        await updateCartItemQty(item.id, newQty);
      }
      await refresh();
    } finally {
      setPendingItemId(null);
    }
  };

  const handleRemove = async (item: CartItem) => {
    if (pendingItemId) return;
    setPendingItemId(item.id);
    try {
      await removeFromCart(item.id);
      await refresh();
    } finally {
      setPendingItemId(null);
    }
  };

  const handleCheckout = () => {
    if (state.items.length === 0) return;
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
          aria-label={t3('Back', '返回', 'Bumalik')}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold">{t3('Cart', '购物车', 'Cart')}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {state.items.length === 0
              ? t3('Empty', '空购物车', 'Walang laman')
              : t3(`${state.items.length} items`, `共 ${state.items.length} 件商品`, `${state.items.length} item`)}
          </p>
        </div>
      </header>

      {/* Body */}
      <main className="px-4 py-4 pb-40">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-[13px]">
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        ) : state.items.length === 0 ? (
          /* Empty state — 引导回 /verify */
          <div className="bg-white rounded-3xl p-8 text-center mt-8 shadow-sm">
            <div className="text-[56px] mb-3">🛒</div>
            <p className="font-bold text-[16px] mb-1" style={{ color: '#1a1a1a' }}>
              {t3('Your cart is empty', '购物车空空', 'Walang laman ang cart')}
            </p>
            <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
              {t3(
                'Add Inalca direct-supply items from the shopping list',
                '去采购清单里把 Inalca 直供食材加进购物车吧',
                'Magdagdag ng mga produkto mula sa shopping list',
              )}
            </p>
            <button
              onClick={() => navigate('/verify')}
              className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white active:scale-95"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
            >
              {t3('Go to shopping list', '去采购清单', 'Pumunta sa listahan')}
            </button>
          </div>
        ) : (
          /* Item list */
          <div className="space-y-3">
            {state.items.map(item => {
              const lineTotal = item.retail_price_hkd * item.qty;
              const isPending = pendingItemId === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-3.5 shadow-sm flex gap-3"
                  style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.15s' }}
                >
                  {/* Thumbnail placeholder — 080-A 还没接 image, 用图标占位 */}
                  <div
                    className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #fff5ef, #ffe6d5)' }}
                  >
                    <span className="text-[28px]">🛍️</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[14px] truncate" style={{ color: '#1a1a1a' }}>
                      {item.sku_name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {item.supplier_name}
                      {item.unit ? ` · ${item.unit}` : ''}
                    </p>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <p className="text-[11px] text-gray-500">
                          HKD {item.retail_price_hkd.toFixed(2)}
                          {item.unit ? <span className="text-[9px]"> / {item.unit}</span> : null}
                        </p>
                        <p className="text-[14px] font-black" style={{ color: '#FF5A1F' }}>
                          HKD {lineTotal.toFixed(2)}
                        </p>
                      </div>

                      {/* Qty stepper */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleQtyChange(item, -1)}
                          disabled={isPending}
                          aria-label={t3('Decrease', '减少', 'Bawasan')}
                          className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center text-[16px] font-bold active:scale-95 disabled:opacity-50"
                        >
                          −
                        </button>
                        <span className="text-[14px] font-bold min-w-[20px] text-center">{item.qty}</span>
                        <button
                          onClick={() => handleQtyChange(item, 1)}
                          disabled={isPending}
                          aria-label={t3('Increase', '增加', 'Dagdagan')}
                          className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[14px] font-bold active:scale-95 disabled:opacity-50"
                          style={{ background: '#FF5A1F' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemove(item)}
                      disabled={isPending}
                      className="mt-2 text-[10px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {t3('Remove', '删除', 'Tanggalin')}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Disclaimer — 080-A 提醒测试版 */}
            <p className="text-center text-[10px] text-gray-400 mt-4 px-4 leading-relaxed">
              {t3(
                'Pricing in HKD. Final payment & delivery coming soon (test version).',
                '价格 HKD。结账 + 配送功能即将上线 (当前为测试版)。',
                'Presyo sa HKD. Babayaran at paghahatid darating (test version).',
              )}
            </p>
          </div>
        )}
      </main>

      {/* Sticky footer — 总价 + 去结账 */}
      {state.items.length > 0 && !loading && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-black/5 px-5 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-gray-500">
                {t3('Subtotal', '商品总价', 'Subtotal')}
              </p>
              <p className="text-[20px] font-black" style={{ color: '#FF5A1F' }}>
                HKD {state.subtotalHkd.toFixed(2)}
              </p>
            </div>
            <button
              onClick={handleCheckout}
              className="px-6 py-3.5 rounded-full font-bold text-[14px] text-white active:scale-95 transition-all flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
                boxShadow: '0 8px 20px rgba(255,90,31,0.30)',
              }}
            >
              {t3('Checkout →', '去结账 →', 'Mag-checkout →')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
