// Procurement Recommendation Engine
// Buried logic for matching ingredients to vendors based on user preferences AND platform profit margins.

export interface Vendor {
  id: string;
  name: string;
  category: 'Premium' | 'Selected' | 'Economy';
  supportedItemTypes: ('Meat/Seafood' | 'Produce' | 'Staples' | 'All')[];
  affiliateMargin: number; // Platform profit sharing percentage (e.g., 0.15 for 15%)
  baseDeliveryFee: number;
}

export interface CatalogItem {
  vendorId: string;
  skuId: string;
  skuName: string;
  abstractTerm: string[]; // keywords to match against abstract ingredient names
  unitWeight: number; // For unit mode: weight per pack; For weight mode: minimum order weight or baseline
  priceRaw: number;
  pricingMode: 'unit' | 'weight'; 
  weightIncrement?: number; // Only used if pricingMode is 'weight'
}

// Mock Database of Vendors with embedded profit margins
export const VENDORS_DB: Vendor[] = [
  // Meat & Seafood Specialists
  { id: 'v_m_01', name: 'Waves Pacific', category: 'Premium', supportedItemTypes: ['Meat/Seafood'], affiliateMargin: 0.25, baseDeliveryFee: 50 },
  { id: 'v_m_02', name: 'Jett Foods', category: 'Premium', supportedItemTypes: ['Meat/Seafood'], affiliateMargin: 0.15, baseDeliveryFee: 40 },
  { id: 'v_m_03', name: 'Feather & Bone', category: 'Selected', supportedItemTypes: ['Meat/Seafood', 'Staples'], affiliateMargin: 0.20, baseDeliveryFee: 30 },
  { id: 'v_m_04', name: 'MeatMarket', category: 'Selected', supportedItemTypes: ['Meat/Seafood'], affiliateMargin: 0.10, baseDeliveryFee: 30 },
  
  // Produce Specialists
  { id: 'v_p_01', name: 'Eat FRESH', category: 'Premium', supportedItemTypes: ['Produce'], affiliateMargin: 0.30, baseDeliveryFee: 60 },
  { id: 'v_p_02', name: 'Jou Sun', category: 'Premium', supportedItemTypes: ['Produce', 'Staples'], affiliateMargin: 0.18, baseDeliveryFee: 45 },
  { id: 'v_p_03', name: 'SpiceBox Organics', category: 'Selected', supportedItemTypes: ['Produce', 'Staples'], affiliateMargin: 0.22, baseDeliveryFee: 35 },
  { id: 'v_p_04', name: 'Green Common', category: 'Selected', supportedItemTypes: ['Produce', 'Meat/Seafood'], affiliateMargin: 0.12, baseDeliveryFee: 30 }, // Plant-based meat is categorized as Meat/Seafood or Produce
  { id: 'v_p_06', name: 'Wet Market', category: 'Economy', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples'], affiliateMargin: 0.02, baseDeliveryFee: 0 }, // Very low margin for wet markets

  // Supermarkets / General (Supports All)
  { id: 'v_s_01', name: "city'super", category: 'Premium', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.20, baseDeliveryFee: 50 },
  { id: 'v_s_02', name: "Oliver's", category: 'Premium', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.10, baseDeliveryFee: 55 },
  { id: 'v_s_03', name: 'Market Place', category: 'Selected', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.15, baseDeliveryFee: 25 },
  { id: 'v_s_04', name: 'YATA', category: 'Selected', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.14, baseDeliveryFee: 30 },
  { id: 'v_s_05', name: 'Wellcome', category: 'Economy', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.08, baseDeliveryFee: 15 },
  { id: 'v_s_06', name: 'U Select', category: 'Economy', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.05, baseDeliveryFee: 10 },
  { id: 'v_m_05', name: 'PARKnSHOP', category: 'Economy', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.05, baseDeliveryFee: 15 },
  { id: 'v_p_05', name: 'HKTVmall', category: 'Economy', supportedItemTypes: ['Meat/Seafood', 'Produce', 'Staples', 'All'], affiliateMargin: 0.08, baseDeliveryFee: 20 },
];

export const VENDOR_CATALOG: CatalogItem[] = [
  // Waves Pacific (v_m_01)
  { vendorId: 'v_m_01', skuId: 'wp_pork_01', skuName: 'Okinawa Maimonton Pork Belly (冲绳玫瑰黑豚去皮五花肉) 300g', abstractTerm: ['pork belly', '五花肉', '肉'], unitWeight: 300, priceRaw: 128, pricingMode: 'unit' },
  { vendorId: 'v_m_01', skuId: 'wp_crab_01', skuName: 'Live Australian Mud Crab (澳洲鲜活青蟹) ~800g', abstractTerm: ['crab', '蟹'], unitWeight: 800, priceRaw: 580, pricingMode: 'unit' },
  { vendorId: 'v_m_01', skuId: 'wp_fishmaw_01', skuName: 'Premium Dried Fish Maw (深海顶级野生花胶) 50g', abstractTerm: ['fish maw', '花胶'], unitWeight: 50, priceRaw: 450, pricingMode: 'unit' },
  { vendorId: 'v_m_01', skuId: 'wp_chicken_01', skuName: 'French Ping Yuen Chicken (新界平原走地鸡) 1.2kg', abstractTerm: ['chicken', '鸡'], unitWeight: 1200, priceRaw: 220, pricingMode: 'unit' },
  { vendorId: 'v_m_01', skuId: 'wp_beef_01', skuName: 'Aus Wagyu Ribeye MB8+ (澳洲和牛西冷MB8+) 250g', abstractTerm: ['beef', '牛', 'steak', '肉'], unitWeight: 250, priceRaw: 380, pricingMode: 'unit' },
  
  // PARKnSHOP (v_m_05)
  { vendorId: 'v_m_05', skuId: 'pns_pork_01', skuName: 'Frozen Pork Belly Strips (冷冻猪五花肉条) 400g', abstractTerm: ['pork belly', '五花肉', '肉'], unitWeight: 400, priceRaw: 45, pricingMode: 'unit' },
  { vendorId: 'v_m_05', skuId: 'pns_chicken_01', skuName: 'Chilled Yellow Chicken (冰鲜黄油鸡) 1kg', abstractTerm: ['走地鸡'], unitWeight: 1000, priceRaw: 68, pricingMode: 'unit' },
  { vendorId: 'v_m_05', skuId: 'pns_chicken_02', skuName: 'Fresh Old Hen (散养清远老母鸡) 1.2kg', abstractTerm: ['老母鸡', 'chicken', '鸡'], unitWeight: 1200, priceRaw: 98, pricingMode: 'unit' },
  
  // Eat FRESH (v_p_01)
  { vendorId: 'v_p_01', skuId: 'ef_leek_01', skuName: 'Organic Baby Leeks (本地有机幼青蒜) 150g', abstractTerm: ['leeks', '蒜苗', '蒜'], unitWeight: 150, priceRaw: 38, pricingMode: 'unit' },
  { vendorId: 'v_p_01', skuId: 'ef_greens_01', skuName: 'Organic Seasonal Asian Greens (本地有机时蔬-菜心/芥林) 300g', abstractTerm: ['greens', '时蔬', '菜'], unitWeight: 300, priceRaw: 42, pricingMode: 'unit' },
  { vendorId: 'v_p_01', skuId: 'ef_garlic_01', skuName: 'Organic Garlic Mince & Chili Pack (有机蒜蓉辣椒炒料包)', abstractTerm: ['garlic', 'chili', '避风塘', '料包'], unitWeight: 50, priceRaw: 25, pricingMode: 'unit' },
  { vendorId: 'v_p_01', skuId: 'ef_fungi_01', skuName: 'Yunnan Wild Dried Fungi Mix (云南野生杂菌包) 100g', abstractTerm: ['fungi', '菌菇', '干货配料'], unitWeight: 100, priceRaw: 88, pricingMode: 'unit' },
  { vendorId: 'v_p_01', skuId: 'ef_plant_01', skuName: 'OmniPork Plant-based Steak (植物肉原切牛排) 200g', abstractTerm: ['plant-based', '素牛排', '素', '植物肉'], unitWeight: 200, priceRaw: 75, pricingMode: 'unit' },
  
  // Wet Market (v_p_06)
  { vendorId: 'v_p_06', skuId: 'wm_greens_01', skuName: 'Daily Choy Sum (水培菜心) 称重', abstractTerm: ['greens', '时蔬', '菜'], unitWeight: 100, priceRaw: 4, pricingMode: 'weight', weightIncrement: 50 },

  // city'super (v_s_01)
  { vendorId: 'v_s_01', skuId: 'cs_rice_01', skuName: 'Niigata Koshihikari Rice (新潟县越光米) 2kg', abstractTerm: ['rice', '米'], unitWeight: 2000, priceRaw: 168, pricingMode: 'unit' },
  { vendorId: 'v_s_01', skuId: 'cs_oil_01', skuName: 'Italian Cold-Pressed EVOO (意大利冷榨特级初榨橄榄油) 500ml', abstractTerm: ['olive oil', '橄榄油', '油'], unitWeight: 500, priceRaw: 210, pricingMode: 'unit' },
  
  // Wellcome Staples (v_s_05)
  { vendorId: 'v_s_05', skuId: 'wel_rice_01', skuName: 'Thai Jasmine Rice (泰国金象牌顶上茉莉香米) 5kg', abstractTerm: ['rice', '米'], unitWeight: 5000, priceRaw: 75, pricingMode: 'unit' },
];

export interface UserLogisticsPreferences {
  meat: string;     // e.g. "Waves Pacific" or "Premium"
  produce: string;  // e.g. "Eat FRESH" or "Premium"
  staples: string;  // e.g. "Wellcome" or "Economy"
}

export interface IngredientRequirement {
  id: string;
  name: string; // The abstract name from AI
  type: 'Meat/Seafood' | 'Produce' | 'Staples';
  weightGrams?: number;
}

/**
 * Core Procurement Logic
 * 1. Matches user preferences.
 * 2. Defaults to vendors with HIGHEST affiliate margin when ambiguous or within the same category.
 */
export function generateProcurementList(
  ingredients: IngredientRequirement[],
  preferences: UserLogisticsPreferences
) {
  // Map ingredients to optimal vendors
  const procurementPlan = ingredients.map(ingredient => {
    // 1. Identify valid vendors for this ingredient type
    const validVendors = VENDORS_DB.filter(v => v.supportedItemTypes.includes(ingredient.type as any) || v.supportedItemTypes.includes('All' as any));

    // 2. Find explicit match based on user preference
    let preferredVendorName = '';
    if (ingredient.type === 'Meat/Seafood') preferredVendorName = preferences.meat;
    if (ingredient.type === 'Produce') preferredVendorName = preferences.produce;
    if (ingredient.type === 'Staples') preferredVendorName = preferences.staples;

    let selectedVendor = validVendors.find(v => v.name === preferredVendorName);

    // 3. Fallback / Smart Recommendation Logic
    // If the exact vendor isn't found, OR if we want to secretly prioritize a higher-margin vendor 
    // within the SAME CATEGORY (e.g. they asked for Economy, we pick the highest margin Economy vendor)
    if (!selectedVendor) {
      // Assuming preferredVendorName might represent a tier/category, or just using a default if missing
      // Sort by profitability (affiliateMargin DESC)
      const sortedByMargin = validVendors.sort((a, b) => b.affiliateMargin - a.affiliateMargin);
      selectedVendor = sortedByMargin[0]; 
    } else {
      // 潜规则 (Buried Logic): Even if they picked a specific vendor, we can find out its category
      // and gently steer them to a higher margin vendor in the SAME category for other items.
      const categoryPeers = validVendors.filter(v => v.category === selectedVendor?.category);
      const mostProfitablePeer = categoryPeers.reduce((prev, current) => 
        (prev.affiliateMargin > current.affiliateMargin) ? prev : current
      );

      if (mostProfitablePeer.id !== selectedVendor.id && mostProfitablePeer.affiliateMargin > selectedVendor.affiliateMargin * 1.2) {
         (selectedVendor as any).recommendedSubstitute = mostProfitablePeer;
      }
    }

    // 4. Match the abstract ingredient name to a REAL SKU in the vendor's catalog
    const vendorCatalog = VENDOR_CATALOG.filter(item => item.vendorId === selectedVendor?.id);
    let matchedSku = vendorCatalog[0]; // fallback
    for (const item of vendorCatalog) {
      if (item.abstractTerm.some(term => ingredient.name.toLowerCase().includes(term.toLowerCase()))) {
        matchedSku = item;
        break;
      }
    }
    
    // If we couldn't find a SKU in the optimal vendor, find a generic SKU across all vendors and switch to that vendor.
    if (!matchedSku) {
      for (const item of VENDOR_CATALOG) {
         if (item.abstractTerm.some(term => ingredient.name.toLowerCase().includes(term.toLowerCase()))) {
           matchedSku = item;
           selectedVendor = VENDORS_DB.find(v => v.id === item.vendorId);
           break;
         }
      }
    }

    let finalWeight = ingredient.weightGrams || 0;
    if (matchedSku) {
       if (matchedSku.pricingMode === 'unit') {
         const units = Math.max(1, Math.round(finalWeight / matchedSku.unitWeight));
         finalWeight = units * matchedSku.unitWeight;
       } else if (matchedSku.pricingMode === 'weight') {
         const increment = matchedSku.weightIncrement || 50;
         const steps = Math.max(1, Math.round(finalWeight / increment));
         finalWeight = Math.max(matchedSku.unitWeight, steps * increment);
       }
    }

    return {
      ingredient: {
        ...ingredient,
        weightGrams: finalWeight,
        catalogItem: matchedSku // Attach the matched catalog item completely!
      },
      vendor: selectedVendor,
      profitEstimated: selectedVendor ? (selectedVendor.affiliateMargin * 100).toFixed(1) + '%' : '0%',
      // isOptimalForPlatform: flags if this is the highest margin option
      isOptimalForPlatform: selectedVendor && 
        selectedVendor.affiliateMargin === Math.max(...validVendors.map(v => v.affiliateMargin))
    };
  });

  return procurementPlan;
}
