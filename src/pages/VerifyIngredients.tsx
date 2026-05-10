import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { generateProcurementList, IngredientRequirement, UserLogisticsPreferences, VENDOR_CATALOG, VENDORS_DB } from "../services/procurementEngine";
import SupplierPanel from "../components/SupplierPanel";
import { getUserTier, TIER_CONFIG } from "../lib/suppliers";

export default function VerifyIngredients() {
  const navigate = useNavigate();
  const [selectedDays, setSelectedDays] = useState<number[]>([new Date().getDay() || 7]); // 1-7 for Mon-Sun
  const [procurementPlan, setProcurementPlan] = useState<any[]>([]);

  useEffect(() => {
    // 1. Identify Ingredients from today's menu (saved from Home.tsx)
    const savedMenu = localStorage.getItem('generatedMenu');
    const savedPeople = localStorage.getItem('effectivePeople');
    
    let ingredients: IngredientRequirement[] = [];
    
    if (savedMenu && savedPeople) {
      const menu = JSON.parse(savedMenu);
      const effectivePeople = parseFloat(savedPeople);
      const daysMultiplier = Math.max(1, selectedDays.length);
      const targetMultiplier = (effectivePeople * 0.7) * daysMultiplier; // Base fullness logic * days
      
      menu.forEach((dish: any, idx: number) => {
        const title = dish.title || '';
        
        // Map dish names to real ingredients
        if (title.includes('回锅')) {
          ingredients.push({ id: `ing_${idx}_1`, name: 'Premium Pork Belly (黑豚五花肉)', type: 'Meat/Seafood', weightGrams: Math.round(150 * targetMultiplier * 1.3) });
          ingredients.push({ id: `ing_${idx}_2`, name: 'Organic Leeks (有机青蒜苗)', type: 'Produce', weightGrams: Math.round(50 * targetMultiplier) });
        } else if (title.includes('蟹')) {
          ingredients.push({ id: `ing_${idx}_1`, name: 'Live Mud Crab (鲜活青蟹)', type: 'Meat/Seafood', weightGrams: Math.round(250 * effectivePeople) }); // Crabs are heavy in shells
          ingredients.push({ id: `ing_${idx}_2`, name: 'Garlic & Chili Pack (避风塘料包)', type: 'Produce', weightGrams: 50 });
        } else if (title.includes('鸡汤')) {
           ingredients.push({ id: `ing_${idx}_1`, name: 'Aged Fish Maw (深海花胶)', type: 'Meat/Seafood', weightGrams: Math.round(30 * targetMultiplier) });
           ingredients.push({ id: `ing_${idx}_2`, name: 'Free-range Whole Chicken (清远老母鸡)', type: 'Meat/Seafood', weightGrams: Math.round(150 * targetMultiplier * 1.5) });
        } else if (title.includes('白切鸡')) {
           ingredients.push({ id: `ing_${idx}_1`, name: 'Free-range Young Chicken (散养走地鸡)', type: 'Meat/Seafood', weightGrams: Math.round(200 * targetMultiplier * 1.4) });
        } else if (title.includes('时蔬') || title.includes('西兰花')) {
           ingredients.push({ id: `ing_${idx}_1`, name: 'Organic Seasonal Greens (有机时蔬)', type: 'Produce', weightGrams: Math.round(200 * targetMultiplier) });
        } else if (title.includes('素牛排')) {
           ingredients.push({ id: `ing_${idx}_1`, name: 'Plant-based Steak (植物肉排)', type: 'Produce', weightGrams: Math.round(180 * targetMultiplier) });
        } else if (title.includes('莲子羹') || title.includes('菌菇汤')) {
           ingredients.push({ id: `ing_${idx}_1`, name: 'Premium Dried Fungi/Seeds (精选干货配料)', type: 'Produce', weightGrams: Math.round(40 * targetMultiplier) });
        } else {
           // Generic fallback
           if (dish.type === 'MEAT' || dish.type === 'SEAFOOD') {
             ingredients.push({ id: `ing_${idx}_1`, name: `${title} Main Ingredient (主力食材)`, type: 'Meat/Seafood', weightGrams: Math.round(150 * targetMultiplier * 1.2) });
           } else {
             ingredients.push({ id: `ing_${idx}_1`, name: `${title} Main Veg (有机蔬菜)`, type: 'Produce', weightGrams: Math.round(200 * targetMultiplier) });
           }
        }
      });
      
      // Always add some staples
      ingredients.push({
        id: 'ing_staple_1',
        name: 'Premium Jasmine Rice (特级茉莉香米)',
        type: 'Staples',
        weightGrams: Math.round(100 * targetMultiplier)
      });
      ingredients.push({
        id: 'ing_staple_2',
        name: 'Cold-Pressed Olive Oil (冷榨橄榄油)',
        type: 'Staples',
        weightGrams: 200
      });
      
    } else {
      // Fallback if accessed directly
      ingredients = [
        { id: 'ing_1', name: 'Premium Bluefin Tuna Slices (蓝鳍金枪鱼片)', type: 'Meat/Seafood', weightGrams: 500 },
        { id: 'ing_2', name: 'Fresh Australian Wagyu Ribeye (澳洲和牛西冷)', type: 'Meat/Seafood', weightGrams: 800 },
        { id: 'ing_3', name: 'Organic Cherry Tomatoes (有机樱桃小番茄)', type: 'Produce', weightGrams: 300 },
        { id: 'ing_4', name: 'Local Choy Sum (本地菜心)', type: 'Produce', weightGrams: 500 },
        { id: 'ing_5', name: 'Premium Jasmine Rice (特级茉莉香米)', type: 'Staples', weightGrams: 1000 },
        { id: 'ing_6', name: 'Cold-Pressed Olive Oil (冷榨橄榄油)', type: 'Staples', weightGrams: 500 },
      ];
    }

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
  }, [selectedDays]);

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

  return (
    <div className="bg-background font-sans w-full max-w-md mx-auto min-h-screen text-on-surface relative overflow-x-hidden">
      {/* Top Navigation Bar */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-5 py-4 w-full border-b border-black/5">
        <div className="flex items-center gap-3">
          <button className="active:scale-95 transition-transform duration-200 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full flex items-center justify-center" onClick={() => navigate('/')}>
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-bold tracking-tight leading-tight">智能采购</h1>
          </div>
        </div>
        {/* Tier badge */}
        <span className="text-[11px] px-3 py-1 rounded-full font-semibold"
          style={{ background: `${tierCfg.color}18`, color: tierCfg.color }}>
          {tierCfg.icon} {tierCfg.label}
        </span>
      </header>

      <main className="px-5 py-6 space-y-6 pb-24">
        {/* Days Selection */}
        <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-black/[0.02]">
          <h2 className="text-[15px] font-bold text-on-surface mb-4 tracking-tight flex items-center justify-between">
            <span>就餐日期</span>
            <span className="text-[12px] font-medium text-secondary">自动核算采购量</span>
          </h2>
          <div className="flex justify-between items-center gap-1 overflow-x-auto no-scrollbar pb-1">
            {[1, 2, 3, 4, 5, 6, 7].map((dayCode) => {
              const dayName = ["一", "二", "三", "四", "五", "六", "日"][dayCode - 1];
              const isSelected = selectedDays.includes(dayCode);
              return (
                <button
                  key={dayCode}
                  onClick={() => {
                    setSelectedDays(prev => 
                      prev.includes(dayCode) 
                        ? prev.filter(d => d !== dayCode)
                        : [...prev, dayCode]
                    );
                  }}
                  className={`flex flex-col items-center gap-1.5 min-w-[3rem] py-2.5 rounded-2xl transition-all ${
                    isSelected
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-transparent text-secondary hover:bg-black/5"
                  }`}
                >
                  <span className={`text-[14px] font-bold ${
                    isSelected ? "text-white" : "text-secondary"
                  }`}>
                    {dayName}
                  </span>
                  <div className={`w-1 h-1 rounded-full ${
                    isSelected ? "bg-white/80" : "bg-transparent"
                  }`}></div>
                </button>
              );
            })}
          </div>
        </div>

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
                {/* Checkout Footer per vendor */}
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
              </div>
            </section>
          );
        })}
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
