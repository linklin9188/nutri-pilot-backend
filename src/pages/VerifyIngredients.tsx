import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { generateProcurementList, IngredientRequirement, UserLogisticsPreferences, VENDOR_CATALOG, VENDORS_DB } from "../services/procurementEngine";
import SupplierPanel from "../components/SupplierPanel";
import { getUserTier, TIER_CONFIG } from "../lib/suppliers";
import { dishToIngredients, aggregateIngredients, type ShoppingIngredient } from "../lib/dishIngredients";

// Keep in sync with useWeeklyMenu ALGO_VERSION
const WEEKLY_ALGO_VERSION = 'v7';

// ── Helper: read headcount from localStorage ──────────────────────────────────
function readHeadcount(): { adults: number; kids: number } {
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '3', 10);
  const kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);
  return { adults, kids };
}

// ── Helper: get all dishes for a mode ─────────────────────────────────────────
function getDishes(mode: 'today' | 'week'): any[] {
  if (mode === 'today') {
    const raw = localStorage.getItem('generatedMenu');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }
  // Week mode: read from versioned weekly menu cache (try all dishesPerDay variants)
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  const weekStart = monday.toISOString().slice(0, 10);

  for (const p of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    const key = `weekly_menu_${WEEKLY_ALGO_VERSION}_${weekStart}_p${p}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const menu = JSON.parse(raw);
        return (menu.days ?? []).flatMap((d: any) => d.dishes ?? []);
      } catch { /* ignore */ }
    }
  }
  return [];
}

// ── Convert aggregated ingredients → IngredientRequirement[] for engine ───────
function toRequirements(ings: { name: string; type: 'Meat/Seafood' | 'Produce' | 'Staples'; weightGrams: number }[]): IngredientRequirement[] {
  return ings.map((ing, i) => ({
    id: `req_${i}`,
    name: ing.name,
    type: ing.type,
    weightGrams: ing.weightGrams,
  }));
}

// ── Helper simple checklist view ─────────────────────────────────────────────
function HelperChecklistView({ onBack, procurementPlan }: {
  onBack: () => void;
  procurementPlan: any[];
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const items = procurementPlan.map(item => {
    const name = item.ingredient?.catalogItem?.abstractTerm?.[0] || item.ingredient?.name || "Unknown";
    const id = item.ingredient?.id ?? name;
    return { id, name };
  });

  // Deduplicate by id
  const unique = items.filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i);

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: "#f8f9fa" }}>
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button onClick={onBack} className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-[18px] font-bold">核对家中食材</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Check what you already have at home</p>
        </div>
        <div className="ml-auto px-3 py-1 rounded-full text-[12px] font-bold"
          style={{ background: "rgba(37,211,102,0.12)", color: "#25D366" }}>
          {checkedCount}/{unique.length} ✓
        </div>
      </header>

      <main className="flex-1 px-5 py-5 flex flex-col gap-3">
        {unique.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">inventory_2</span>
            <p>No ingredients to check</p>
            <p className="text-sm mt-1">Make sure a menu has been generated first</p>
          </div>
        ) : (
          <>
            <p className="text-[12px] text-gray-400 mb-1">Tick off ingredients you already have at home:</p>
            {unique.map(item => {
              const isChecked = !!checked[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border transition-all active:scale-[0.98]"
                  style={{
                    border: isChecked ? "1.5px solid #25D366" : "1.5px solid rgba(0,0,0,0.07)",
                    background: isChecked ? "rgba(37,211,102,0.06)" : "white",
                  }}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background: isChecked ? "#25D366" : "rgba(0,0,0,0.06)",
                    }}>
                    {isChecked && (
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check</span>
                    )}
                  </div>
                  <p className="text-left font-medium text-[15px]" style={{ color: isChecked ? "#25D366" : "#1a1a1a" }}>
                    {item.name}
                  </p>
                  {isChecked && (
                    <span className="ml-auto text-[11px] font-semibold" style={{ color: "#25D366" }}>有 ✓</span>
                  )}
                  {!isChecked && (
                    <span className="ml-auto text-[11px]" style={{ color: "rgba(0,0,0,0.25)" }}>需要买</span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </main>

      {/* Summary footer */}
      {unique.length > 0 && (
        <div className="px-5 py-5 bg-white border-t border-black/5">
          <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)" }}>
            <p className="font-semibold text-[14px]" style={{ color: "#25D366" }}>
              {checkedCount === unique.length
                ? "All ingredients available! 🎉"
                : `${unique.length - checkedCount} item${unique.length - checkedCount !== 1 ? "s" : ""} to buy`}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
              {checkedCount > 0
                ? `${checkedCount} already at home · ${unique.length - checkedCount} needed`
                : "Tap each item you already have"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyIngredients() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'today' | 'week'>('today');
  const [selectedDays, setSelectedDays] = useState<number[]>([new Date().getDay() || 7]); // 1-7 for Mon-Sun
  const [procurementPlan, setProcurementPlan] = useState<any[]>([]);
  const [dishCount, setDishCount] = useState(0);

  useEffect(() => {
    const { adults, kids } = readHeadcount();
    const dishes = getDishes(mode);
    setDishCount(dishes.length);

    // Convert each dish → shopping ingredients using DB fields
    const allRaw: ShoppingIngredient[] = dishes.flatMap(dish =>
      dishToIngredients(dish, adults, kids)
    );

    // Aggregate (combine same ingredient across dishes, cap condiments)
    const aggregated = aggregateIngredients(allRaw);

    // Convert to IngredientRequirement for procurement engine
    const requirements = toRequirements(aggregated);

    let ingredients: IngredientRequirement[] = requirements.length > 0
      ? requirements
      : [
          // Fallback if no menu saved
          { id: 'ing_1', name: '鸡肉 (Chicken)', type: 'Meat/Seafood', weightGrams: 600 },
          { id: 'ing_2', name: '时蔬 (Seasonal Veg)', type: 'Produce', weightGrams: 400 },
          { id: 'ing_3', name: '米饭 (Jasmine Rice)', type: 'Staples', weightGrams: 500 },
        ];

    // 2. Fetch User Logistics Preferences (from storage)
    const savedPrefs = localStorage.getItem('logisticsPrefs');
    const prefs: UserLogisticsPreferences = savedPrefs ? JSON.parse(savedPrefs) : {
      meat: 'Waves Pacific', // Specific choice default
      produce: 'Selected',   // Generic category, engine will pick highest margin within category
      staples: 'Economy'     // Generic category, engine will pick highest margin within category
    };

    // 3. Run Procurement Engine (This contains the "Hidden Profit Margin Logic")
    const plan = generateProcurementList(ingredients, prefs);
    setProcurementPlan(plan);
  }, [mode, selectedDays]);

  const groupedPlan = procurementPlan.reduce((acc, curr) => {
    const vName = curr.vendor ? curr.vendor.name : 'Unknown Vendor';
    if (!acc[vName]) acc[vName] = [];
    acc[vName].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const handleUpdateWeight = (idString: string, deltaDirection: number) => {
    // We only update the specific item clicked
    setProcurementPlan(prev => prev.map(item => {
      if (item.ingredient.id === idString) {
        let step = 50;
        let minWeight = 50;
        const catalogItem = item.ingredient.catalogItem;
        
        if (catalogItem) {
          if (catalogItem.pricingMode === 'unit') {
            step = catalogItem.unitWeight;
            minWeight = catalogItem.unitWeight;
          } else if (catalogItem.pricingMode === 'weight') {
            step = catalogItem.weightIncrement || 50;
            minWeight = catalogItem.unitWeight;
          }
        }

        let newWeight = item.ingredient.weightGrams;
        
        if (deltaDirection > 0) {
          newWeight = Math.ceil((newWeight + 1) / step) * step;
        } else {
          newWeight = Math.floor((newWeight - 1) / step) * step;
        }

        if (newWeight < minWeight) newWeight = minWeight; // Min 1 portion/step

        return {
          ...item,
          ingredient: {
            ...item.ingredient,
            weightGrams: newWeight
          }
        };
      }
      return item;
    }));
  };

  const [processingCheckout, setProcessingCheckout] = useState<string | null>(null);

  function handleSendToHelper() {
    if (procurementPlan.length === 0) return;
    const lines: string[] = [`🛒 ${mode === 'week' ? '本周' : '今日'}采购清单\n`];
    // Group by vendor
    const grouped: Record<string, typeof procurementPlan> = {};
    for (const item of procurementPlan) {
      const vName = item.vendor?.name ?? '其他';
      if (!grouped[vName]) grouped[vName] = [];
      grouped[vName].push(item);
    }
    for (const [vendor, items] of Object.entries(grouped)) {
      lines.push(`📦 ${vendor}`);
      for (const item of items) {
        const name = item.ingredient.catalogItem?.skuName || item.ingredient.name;
        const weight = item.ingredient.weightGrams;
        lines.push(`  • ${name} ${weight}g`);
      }
      lines.push('');
    }
    lines.push('请按以上清单采购，谢谢！');
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  const handleCheckout = async (vendorName: string, items: any[]) => {
    setProcessingCheckout(vendorName);
    
    // Stub for Payment API Integration
    const processPaymentAPI = async (amount: number, vendor: string) => {
      // TODO: Implement actual payment gateway (Stripe/WeChat/Alipay)
      return new Promise(resolve => setTimeout(resolve, 1500));
    };

    try {
      // Calculate total amount (mocked for now, depending on items)
      const totalAmount = items.reduce((acc, item) => acc + (item.ingredient?.catalogItem?.priceRaw || 0), 0);
      
      await processPaymentAPI(totalAmount, vendorName);
      
      // Navigate to delivery tracking after successful "payment"
      navigate('/delivery');
    } catch (error) {
      console.error("Payment failed", error);
      setProcessingCheckout(null); // Reset if failed
    }
  };

  const handleChangeBrand = (id: string, currentItem: any) => {
    // Find all matching catalogs for this ingredient based on abstractTerm match
    const abstractName = currentItem.ingredient.name.toLowerCase();
    
    // Find all matching SKUs
    const matchingSKUs = VENDOR_CATALOG.filter(c => 
      c.abstractTerm.some(term => abstractName.includes(term.toLowerCase()))
    );

    if (matchingSKUs.length <= 1) return; // No alternatives

    const currentIdx = matchingSKUs.findIndex(sku => sku.skuId === currentItem.ingredient.catalogItem?.skuId);
    let nextIdx = (currentIdx + 1) % matchingSKUs.length;
    
    const nextSku = matchingSKUs[nextIdx];
    if (nextSku) {
      const nextVendor = VENDORS_DB.find(v => v.id === nextSku.vendorId);
      
      setProcurementPlan(prev => prev.map(item => {
        if (item.ingredient.id === id) {
          
          let step = 50;
          let minWeight = 50;
          if (nextSku.pricingMode === 'unit') {
            step = nextSku.unitWeight;
            minWeight = nextSku.unitWeight;
          } else if (nextSku.pricingMode === 'weight') {
            step = nextSku.weightIncrement || 50;
            minWeight = nextSku.unitWeight;
          }
          
          // Recalculate weight for new sku
          let newWeight = item.ingredient.weightGrams;
          newWeight = Math.max(minWeight, Math.round(newWeight / step) * step);

          return {
            ...item,
            vendor: nextVendor,
            isOptimalForPlatform: false,
            ingredient: {
              ...item.ingredient,
              weightGrams: newWeight,
              catalogItem: nextSku
            }
          };
        }
        return item;
      }));
    }
  };


  const userTier = getUserTier();
  const tierCfg  = TIER_CONFIG[userTier];
  const isHelper = localStorage.getItem("nutri_role") === "helper";

  // ── Helper mode: simple checklist ──────────────────────────────────────────
  if (isHelper) {
    return <HelperChecklistView onBack={() => navigate("/helper")} procurementPlan={procurementPlan} />;
  }

  return (
    <div className="bg-background font-sans w-full max-w-md mx-auto min-h-screen text-on-surface relative overflow-x-hidden">
      {/* Top Navigation Bar */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-5 py-4 w-full border-b border-black/5">
        <div className="flex items-center gap-3">
          <button className="active:scale-95 transition-transform duration-200 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full flex items-center justify-center"
            onClick={() => navigate(isHelper ? "/helper" : "/")}>
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-bold tracking-tight leading-tight">
              {isHelper ? "核对家中食材" : "智能采购"}
            </h1>
            {isHelper && (
              <p className="text-[11px] text-secondary mt-0.5">确认家里已有哪些食材</p>
            )}
          </div>
        </div>
        {/* Tier badge */}
        <span className="text-[11px] px-3 py-1 rounded-full font-semibold"
          style={{ background: `${tierCfg.color}18`, color: tierCfg.color }}>
          {tierCfg.icon} {tierCfg.label}
        </span>
      </header>

      <main className="px-5 py-6 space-y-6 pb-24">
        {/* Today / Week Tab */}
        <div className="bg-white rounded-3xl p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-black/[0.02] flex gap-1">
          {(['today', 'week'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-3 rounded-2xl font-semibold text-[14px] transition-all ${
                mode === m
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-secondary'
              }`}
            >
              {m === 'today' ? '🛒 今日菜单采购' : '📅 本周菜单采购'}
            </button>
          ))}
        </div>

        {/* Headcount + dish summary */}
        {(() => {
          const { adults, kids } = readHeadcount();
          const eff = adults + kids * 0.5;
          return (
            <div className="flex items-center gap-3 bg-primary/5 rounded-2xl px-4 py-3 border border-primary/10">
              <span className="text-2xl">👥</span>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-on-surface">
                  {adults}大{kids > 0 ? `${kids}小` : ''} · 有效{eff}人份
                </p>
                <p className="text-[11px] text-secondary mt-0.5">
                  {mode === 'today' ? '今日' : '本周'} {dishCount} 道菜 · 食材已按人数核算
                </p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="text-[11px] text-primary font-semibold px-2 py-1 rounded-lg bg-primary/10"
              >
                改人数
              </button>
            </div>
          );
        })()}

        {/* Development Notice */}
        <div className="bg-primary/5 rounded-2xl px-4 py-4 flex items-start gap-3 mb-2 border border-primary/20">
          <span className="material-symbols-outlined text-primary text-[20px] mt-0.5 pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-on-surface text-[14px] tracking-tight">智能比价优选引擎</span>
            <span className="text-[12px] text-secondary leading-normal">
              系统已根据各平台实时数据，为您匹配出价格与品质的最优组合方案。
            </span>
          </div>
        </div>

        {(Object.entries(groupedPlan) as [string, any[]][]).map(([vendorName, items], idx) => {
          const mainVendorInfo = items[0].vendor;
          
          return (
            <section key={idx} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                  <h2 className="text-[16px] font-bold text-on-surface tracking-tight">{vendorName}</h2>
                  <span className="text-[10px] bg-black/5 text-secondary px-2 py-0.5 rounded font-bold">{mainVendorInfo?.category || '综合生鲜'}</span>
                </div>
              </div>
              <div className="bg-white rounded-[24px] border border-black/5 shadow-sm overflow-hidden">
                <div className="flex flex-col">
                  {items.map((item, i) => (
                    <div key={item.ingredient.id} className={`p-4 ${i !== items.length - 1 ? 'border-b border-black/5' : ''} flex gap-4`}>
                      <div className="flex-grow flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col">
                              <h3 className="font-bold text-[15px] tracking-tight leading-snug text-on-surface">{item.ingredient.catalogItem?.skuName || item.ingredient.name}</h3>
                              <span className="text-secondary text-[11px] mt-0.5">{item.ingredient.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-[#f8f8f8] rounded-xl px-2 py-1.5 border border-black/5">
                              <button onClick={() => handleUpdateWeight(item.ingredient.id, -1)} className="w-5 h-5 flex items-center justify-center text-secondary active:scale-95 transition-transform"><span className="material-symbols-outlined text-[14px]">remove</span></button>
                              <div className="flex flex-col items-center justify-center min-w-[36px]">
                                <span className="font-bold text-on-surface whitespace-nowrap text-center text-[13px]">{item.ingredient.weightGrams}g</span>
                                {item.ingredient.catalogItem?.pricingMode === 'unit' && (
                                  <span className="text-[10px] text-secondary font-medium leading-none mt-1">({Math.round(item.ingredient.weightGrams / item.ingredient.catalogItem.unitWeight)}份)</span>
                                )}
                              </div>
                              <button onClick={() => handleUpdateWeight(item.ingredient.id, 1)} className="w-5 h-5 flex items-center justify-center text-secondary active:scale-95 transition-transform"><span className="material-symbols-outlined text-[14px]">add</span></button>
                            </div>
                          </div>
                          <span className="text-[11px] text-secondary mt-1.5 inline-block bg-[#f8f8f8] px-2 py-0.5 rounded tracking-wide">{item.ingredient.type}</span>
                        </div>
                        
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {VENDOR_CATALOG.filter(c => c.abstractTerm.some(term => item.ingredient.name.toLowerCase().includes(term.toLowerCase()))).length > 1 && (
                            <button onClick={() => handleChangeBrand(item.ingredient.id, item)} className="text-[11px] font-bold text-on-surface bg-[#f8f8f8] border border-black/5 px-3 py-1.5 rounded-xl active:scale-95 transition-transform flex items-center gap-1 hover:bg-[#f0f0f0]">
                              <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                              换品牌
                            </button>
                          )}
                        </div>

                        {item.vendor?.recommendedSubstitute && (
                          <div className="mt-3 inline-flex flex-col bg-orange-50 border border-orange-100 text-orange-800 px-3 py-2 rounded-xl text-[11px]">
                            <span className="font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">star</span> 品质升级推荐:</span>
                            <span className="opacity-80 mt-0.5">可考虑替换为 '{item.vendor.recommendedSubstitute.name}'。</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Checkout Footer — employer only */}
                {!isHelper && (
                  <div className="p-4 bg-[#f8f8f8] border-t border-black/5">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[13px] font-medium text-secondary">采购状态：</span>
                      <span className="text-[12px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span> 最优选</span>
                    </div>
                    <button
                      onClick={() => handleCheckout(vendorName, items)}
                      disabled={processingCheckout === vendorName}
                      className="w-full py-3.5 bg-gradient-to-r from-[#FF5A1F] to-[#FF9054] text-white text-[15px] font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:shadow-none"
                    >
                      {processingCheckout === vendorName ? (
                        <>
                          <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                          处理中...
                        </>
                      ) : (
                        `在 ${vendorName} 结算`
                      )}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
        {/* ── Send to helper — employer only ───────────────────── */}
        {!isHelper && procurementPlan.length > 0 && (
          <button
            onClick={handleSendToHelper}
            className="w-full py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style={{
              background: "linear-gradient(135deg, #25D366, #128C7E)",
              color: "white",
              boxShadow: "0 8px 24px rgba(37,211,102,0.3)",
            }}
          >
            <span style={{ fontSize: 20 }}>📲</span>
            一键发送给工人姐姐 (WhatsApp)
          </button>
        )}

        {/* ── Supplier Tier Showcase ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold tracking-tight">精选供货商</h2>
            <span className="text-[11px] text-secondary">按会员等级解锁</span>
          </div>

          {/* Anonymous banner */}
          {userTier === 'anonymous' && (
            <div className="mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: "rgba(255,90,31,0.06)", border: "1px solid rgba(255,90,31,0.15)" }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <div className="flex-1">
                <p className="font-semibold text-[13px]" style={{ color: "#FF5A1F" }}>访客模式 · 基础超市</p>
                <p className="text-[11px] text-gray-500 mt-0.5">登录后解锁精选供货商，会员享米其林直供</p>
              </div>
              <button onClick={() => navigate('/signin')}
                className="text-[11px] px-3 py-1.5 rounded-full font-semibold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #FF5A1F, #FF8C54)" }}>
                登录
              </button>
            </div>
          )}

          <div style={{
            background: "#0a0a0a",
            borderRadius: 20,
            padding: "16px 16px 20px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <SupplierPanel region="hk" />
          </div>
        </section>

      </main>
    </div>
  );
}
