import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { dishToIngredients, aggregateIngredients, type AggregatedIngredient } from "../lib/dishIngredients";
import * as XLSX from "xlsx";
import BottomTabBar from "../components/BottomTabBar";
import { useLanguage } from "../contexts/LanguageContext";

// Keep in sync with useWeeklyMenu ALGO_VERSION
const WEEKLY_ALGO_VERSION = 'v15';

// ── Category grouping ─────────────────────────────────────────────────────────
const CATEGORY_GROUPS: { label: string; emoji: string; categories: string[] }[] = [
  { label: '肉禽蛋', emoji: '🥩', categories: ['pork', 'beef', 'poultry', 'egg'] },
  { label: '海鲜水产', emoji: '🐟', categories: ['seafood'] },
  { label: '蔬菜豆腐', emoji: '🥬', categories: ['veggie', 'tofu', 'other'] },
  { label: '主食调味', emoji: '🌾', categories: ['carb', 'condiment'] },
];

// Per-group store recommendations. Three picks each, ordered street → super → premium
// so the user has a value-vs-quality choice. IDs reference src/lib/suppliers.ts;
// keep them in sync if a supplier is renamed there.
interface ShopPick {
  name:   string;    // brand name shown on the chip
  emoji:  string;
  tier:   '街市' | '超市' | '高端' | '线上';
  blurb:  string;    // one-line value prop
  color:  string;    // tier accent color
}

const SHOPS_BY_GROUP: Record<string, ShopPick[]> = {
  '肉禽蛋': [
    { name: '街市肉档',         emoji: '🥩', tier: '街市', blurb: '当日宰杀，砍切到位',     color: '#FF8C54' },
    { name: '百佳',             emoji: '🛒', tier: '超市', blurb: '门店密集，价格稳定',     color: '#3B82F6' },
    { name: "City'super 肉品",  emoji: '✨', tier: '高端', blurb: '和牛 / 安格斯精选',       color: '#FFB347' },
  ],
  '海鲜水产': [
    { name: '街市鱼档',         emoji: '🐟', tier: '街市', blurb: '活鲜捞起，老板代杀',     color: '#FF8C54' },
    { name: 'HKTVmall Premium', emoji: '🌊', tier: '线上', blurb: '冷链直送，到家不化',     color: '#16a34a' },
    { name: 'SOLE 海鲜',        emoji: '🦞', tier: '高端', blurb: '挪威三文鱼 / 法国生蚝',   color: '#FFB347' },
  ],
  '蔬菜豆腐': [
    { name: '街市菜档',         emoji: '🥬', tier: '街市', blurb: '本地农场当日采',         color: '#FF8C54' },
    { name: '惠康有机',         emoji: '🛒', tier: '超市', blurb: '有机认证，价格友好',     color: '#3B82F6' },
    { name: 'Pacific Organic',  emoji: '🌱', tier: '高端', blurb: '欧盟标准 / 日本时蔬',     color: '#FFB347' },
  ],
  '主食调味': [
    { name: '百佳粮油',         emoji: '🛒', tier: '超市', blurb: '米面油醋一站补齐',       color: '#3B82F6' },
    { name: '华润万家',         emoji: '🏬', tier: '超市', blurb: '内地粮油副食专区',       color: '#3B82F6' },
    { name: 'HKTVmall 粮油',    emoji: '📦', tier: '线上', blurb: '大件下单送到家',         color: '#16a34a' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// Use local-time date strings so they match the values stored in weekly_menu
// (which is also generated in local time). toISOString() would shift the
// value to the previous day for users east of UTC.
function formatLocalDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getTodayLocal(): string {
  return formatLocalDate(new Date());
}

function getWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return formatLocalDate(monday);
}

function readHeadcount(): { adults: number; kids: number } {
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '2', 10);
  const kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);
  return { adults, kids };
}

function loadWeekMenu(): any | null {
  const weekStart = getWeekStart();
  const prefix = `weekly_menu_${WEEKLY_ALGO_VERSION}_${weekStart}`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw); } catch { /* ignore */ }
      }
    }
  }
  return null;
}

function getDishes(mode: 'today' | 'week'): any[] {
  const weekMenu = loadWeekMenu();
  if (!weekMenu) return [];

  const days: any[] = weekMenu.days ?? [];

  if (mode === 'week') {
    return days.flatMap((d: any) => [...(d.dishes ?? []), ...(d.lunchDishes ?? [])]);
  }

  // Today: find the entry matching today's date (local time)
  const today = getTodayLocal();
  const todayEntry = days.find((d: any) => d.date === today) ?? days[0];
  if (!todayEntry) return [];
  return [...(todayEntry.dishes ?? []), ...(todayEntry.lunchDishes ?? [])];
}

function formatWeight(ing: AggregatedIngredient): string {
  if (ing.unit === 'piece') {
    const count = Math.round(ing.weightGrams / 60);
    return `×${count}个`;
  }
  if (ing.weightGrams >= 1000) {
    return `${(ing.weightGrams / 1000).toFixed(1)}kg`;
  }
  return `${ing.weightGrams}g`;
}

function buildShoppingText(grouped: { group: string; items: AggregatedIngredient[] }[], needToBuy: AggregatedIngredient[]): string {
  const lines = ['🛒 本周采购清单\n'];
  for (const { group, items } of grouped) {
    const needed = items.filter(i => needToBuy.some(n => n.nameZh === i.nameZh));
    if (needed.length === 0) continue;
    lines.push(group);
    for (const item of needed) {
      lines.push(`  • ${item.nameZh} ${formatWeight(item)}`);
    }
    lines.push('');
  }
  lines.push('— 由 NutriPilot 生成');
  return lines.join('\n');
}

// "🥩 肉禽蛋" → "肉禽蛋"
function extractGroupLabel(prefixed: string): string {
  return prefixed.replace(/^\S+\s*/, '');
}

function SupplierRow({ groupLabel }: { groupLabel: string }) {
  const shops = SHOPS_BY_GROUP[groupLabel];
  if (!shops || shops.length === 0) return null;

  return (
    <div className="mt-2.5 mx-1">
      <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
        推荐采购点 · 3 家
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {shops.map((s, i) => (
          <div
            key={i}
            className="flex-shrink-0 bg-white rounded-2xl p-3 shadow-sm"
            style={{ width: 150, borderLeft: `3px solid ${s.color}` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[18px]">{s.emoji}</span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${s.color}1A`, color: s.color }}
              >
                {s.tier}
              </span>
            </div>
            <p className="font-bold text-[12px] leading-tight">{s.name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerifyIngredients() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mode, setMode] = useState<'today' | 'week'>('week');
  const [ingredients, setIngredients] = useState<AggregatedIngredient[]>([]);
  const [dishCount, setDishCount] = useState(0);
  // true = "已有"，false = "需要买"
  const [haveIt, setHaveIt] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const { adults, kids } = readHeadcount();
    const dishes = getDishes(mode);
    setDishCount(dishes.length);

    const allRaw = dishes.flatMap(dish => dishToIngredients(dish, adults, kids));
    const aggregated = aggregateIngredients(allRaw);
    setIngredients(aggregated);
    setHaveIt({}); // reset checks when mode changes
  }, [mode]);

  const toggleHave = (nameZh: string) => {
    setHaveIt(prev => ({ ...prev, [nameZh]: !prev[nameZh] }));
  };

  // Group by category
  const grouped = CATEGORY_GROUPS.map(g => ({
    group: `${g.emoji} ${g.label}`,
    emoji: g.emoji,
    label: g.label,
    items: ingredients.filter(i => g.categories.includes(i.category)),
  })).filter(g => g.items.length > 0);

  const needToBuy = ingredients.filter(i => !haveIt[i.nameZh]);
  const haveCount = ingredients.filter(i => haveIt[i.nameZh]).length;

  const handleExportExcel = () => {
    const today = new Date().toISOString().slice(0, 10);
    const title = mode === 'week' ? '本周采购清单' : '今日采购清单';

    // Sheet 1: 待购清单
    const buyRows = needToBuy.map(i => ({
      '类别': grouped.find(g => g.items.some(it => it.nameZh === i.nameZh))?.group ?? '',
      '食材': i.nameZh,
      '用量': formatWeight(i),
      '用于菜品': i.dishes.join('、'),
      '状态': '待购',
    }));

    // Sheet 2: 已有清单
    const haveRows = ingredients.filter(i => haveIt[i.nameZh]).map(i => ({
      '类别': grouped.find(g => g.items.some(it => it.nameZh === i.nameZh))?.group ?? '',
      '食材': i.nameZh,
      '用量': formatWeight(i),
      '用于菜品': i.dishes.join('、'),
      '状态': '已有',
    }));

    const wb = XLSX.utils.book_new();

    const wsBuy = XLSX.utils.json_to_sheet(buyRows.length > 0 ? buyRows : [{ '类别': '', '食材': '（无待购食材）', '用量': '', '用于菜品': '', '状态': '' }]);
    wsBuy['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsBuy, '待购清单');

    if (haveRows.length > 0) {
      const wsHave = XLSX.utils.json_to_sheet(haveRows);
      wsHave['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, wsHave, '家中已有');
    }

    XLSX.writeFile(wb, `${title}_${today}.xlsx`);
  };

  const handleCopy = async () => {
    const text = buildShoppingText(grouped, needToBuy);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: share via WhatsApp
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const isHelper = localStorage.getItem("nutri_role") === "helper";
  // Employer view shows the bottom tab bar; lift the footer above it.
  const footerBottomClass = isHelper ? 'bottom-0' : 'bottom-[60px]';

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
          <h1 className="text-[18px] font-bold">{t('Shopping List', '采购清单')}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {t(
              `${mode === 'week' ? 'This week' : 'Today'} · ${dishCount} dishes · ${ingredients.length} items`,
              `${mode === 'week' ? '本周' : '今日'} · ${dishCount} 道菜 · ${ingredients.length} 种食材`
            )}
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-full text-[12px] font-bold"
          style={{
            background: haveCount === ingredients.length && ingredients.length > 0
              ? 'rgba(37,211,102,0.12)' : 'rgba(255,90,31,0.10)',
            color: haveCount === ingredients.length && ingredients.length > 0 ? '#25D366' : '#FF5A1F',
          }}
        >
          {haveCount}/{ingredients.length} {t('have', '已有')}
        </div>
      </header>

      <main className={`flex-1 px-4 py-4 space-y-4 ${isHelper ? 'pb-36' : 'pb-52'}`}>
        {/* Mode toggle */}
        <div className="bg-white rounded-2xl p-1.5 flex gap-1 shadow-sm">
          {(['today', 'week'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                mode === m ? 'bg-[#FF5A1F] text-white shadow' : 'text-gray-400'
              }`}
            >
              {m === 'today'
                ? t("Today's menu", '今日菜单')
                : t("This week's menu", '本周菜单')}
            </button>
          ))}
        </div>

        {/* Empty state — message + CTA differ by role */}
        {ingredients.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">shopping_basket</span>
            {isHelper ? (
              <>
                <p className="font-medium">{t('No menu yet', '还没有菜单')}</p>
                <p className="text-sm mt-1">
                  {t('Ask the employer to generate the menu first',
                     '请等雇主在首页生成菜单')}
                </p>
                <button
                  onClick={() => navigate('/helper')}
                  className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                >
                  {t('Back to tasks', '返回任务')}
                </button>
              </>
            ) : (
              <>
                <p className="font-medium">还没有菜单</p>
                <p className="text-sm mt-1">
                  请先在首页生成{mode === 'week' ? '本周' : '今日'}菜单
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                >
                  去生成菜单
                </button>
              </>
            )}
          </div>
        )}

        {/* Category groups */}
        {grouped.map(({ group, items }) => (
          <section key={group}>
            <p className="text-[13px] font-bold text-gray-500 mb-2 px-1">{group}</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {items.map((item, i) => {
                const have = !!haveIt[item.nameZh];
                return (
                  <button
                    key={item.nameZh}
                    onClick={() => toggleHave(item.nameZh)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all active:scale-[0.99] ${
                      i !== items.length - 1 ? 'border-b border-black/[0.05]' : ''
                    }`}
                    style={{ background: have ? 'rgba(37,211,102,0.04)' : 'white' }}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: have ? '#ef4444' : 'rgba(0,0,0,0.08)' }}
                    >
                      {have && (
                        <span
                          className="material-symbols-outlined text-white"
                          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                        >
                          check
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 text-left">
                      <p
                        className="font-semibold text-[15px]"
                        style={{
                          color: have ? '#ef4444' : '#1a1a1a',
                          textDecoration: have ? 'line-through' : 'none',
                        }}
                      >
                        {item.nameZh}
                      </p>
                      {item.dishes.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                          {item.dishes.slice(0, 2).join(' · ')}
                          {item.dishes.length > 2 ? ` +${item.dishes.length - 2}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Weight + status */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[14px] font-bold"
                        style={{
                          color: have ? '#ef4444' : '#1a1a1a',
                          textDecoration: have ? 'line-through' : 'none',
                        }}
                      >
                        {formatWeight(item)}
                      </span>
                      <span className="text-[10px] font-semibold" style={{ color: have ? '#ef4444' : 'rgba(0,0,0,0.3)' }}>
                        {have ? '已有 ✓' : '需购买'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Supplier recommendations for this group — 3 picks (街市/超市/高端) */}
            <SupplierRow groupLabel={items.length > 0 ? extractGroupLabel(group) : ''} />
          </section>
        ))}
      </main>

      {/* Footer */}
      {ingredients.length > 0 && (
        <div className={`fixed ${footerBottomClass} left-0 right-0 max-w-md mx-auto bg-white border-t border-black/5 px-5 py-4 space-y-3`}>
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[15px]">
                {needToBuy.length > 0 ? `还需购买 ${needToBuy.length} 种食材` : '食材准备完毕 🎉'}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {haveCount > 0 ? `${haveCount} 种已有 · ` : ''}{needToBuy.length} 种待购
              </p>
            </div>
            <div className="flex items-center gap-2">
              {needToBuy.length > 0 && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-full text-[12px] font-bold transition-all active:scale-95"
                  style={{
                    background: copied ? 'rgba(37,211,102,0.1)' : 'rgba(0,0,0,0.06)',
                    color: copied ? '#25D366' : '#555',
                  }}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  {copied ? '已复制' : '复制'}
                </button>
              )}
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-bold text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                导出 Excel
              </button>
            </div>
          </div>

          {/* WhatsApp send for helpers */}
          {isHelper && needToBuy.length > 0 && (
            <button
              onClick={() => {
                const text = buildShoppingText(grouped, needToBuy);
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full py-3 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white' }}
            >
              <span style={{ fontSize: 18 }}>📲</span>
              发送至 WhatsApp
            </button>
          )}
        </div>
      )}

      <BottomTabBar />
    </div>
  );
}
