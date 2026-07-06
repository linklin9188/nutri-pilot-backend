/**
 * FamilyDishPicker — 「勾出你家常吃的菜」冷启动种子页 (ALGO v74 配套)。
 *
 * 产品根因: 菜单不像"我家的菜"是因为算法只有画像推测、没有真实信号。
 * 这页让用户花 2 分钟把家里常吃的菜勾成收藏 (nutri_favorites)，
 * scoreForWeek 对收藏 +1.00，菜单立刻变成"家常菜轮换 + 少量新菜"。
 *
 * 复用既有设施: favorites.ts (localStorage + user_favorite_dishes 云同步)、
 * HeartButton (多实例自动同步)、dishes 表 ilike 搜索。0 AI 调用。
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { loadFavorites } from '../lib/favorites';
import { HeartButton } from '../components/HeartButton';

interface PickerDish {
  id: string;
  title_zh: string;
  title_en: string | null;
  image_url: string | null;
  course_type: string | null;
  main_ingredient: string | null;
  origin_cuisine: string | null;
}

const PICKER_FIELDS = 'id, title_zh, title_en, image_url, course_type, main_ingredient, origin_cuisine';

// 默认浏览池按主料分组展示，让用户"看着就想起我家吃什么"。
const ING_GROUPS: Array<{ label: string; match: (ing: string) => boolean }> = [
  { label: '猪肉', match: i => i.includes('猪') || i.includes('排骨') || i.includes('五花') },
  { label: '鸡鸭', match: i => i.includes('鸡') || i.includes('鸭') },
  { label: '牛羊', match: i => i.includes('牛') || i.includes('羊') },
  { label: '鱼虾海鲜', match: i => /鱼|虾|蟹|贝|鱿|蚝|蛤/.test(i) },
  { label: '蛋豆腐', match: i => i.includes('蛋') || i.includes('豆腐') },
  { label: '蔬菜', match: () => true }, // 兜底组
];

export default function FamilyDishPicker() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerDish[]>([]);
  const [pool, setPool] = useState<PickerDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [favCount, setFavCount] = useState(() => loadFavorites().length);

  // 收藏数实时同步 (HeartButton toggle 后 favorites.ts dispatch 事件)
  useEffect(() => {
    const sync = () => setFavCount(loadFavorites().length);
    window.addEventListener('nutri-favorites-changed', sync);
    return () => window.removeEventListener('nutri-favorites-changed', sync);
  }, []);

  // 默认浏览池: 主菜 + 素菜为主，随机序让每次进来看到不同的菜唤起记忆
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dishes')
        .select(PICKER_FIELDS)
        .in('course_type', ['main_protein', 'veggie_dish', 'soup'])
        .not('image_url', 'is', null)
        .limit(300);
      if (cancelled || !data) { setLoading(false); return; }
      const shuffled = [...(data as PickerDish[])].sort(() => Math.random() - 0.5);
      setPool(shuffled);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 搜索: 300ms debounce ilike title_zh / title_en
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('dishes')
        .select(PICKER_FIELDS)
        .or(`title_zh.ilike.%${q}%,title_en.ilike.%${q}%`)
        .limit(20);
      setResults((data as PickerDish[]) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const grouped = useMemo(() => {
    const used = new Set<string>();
    return ING_GROUPS.map(g => {
      const items = pool.filter(d => {
        if (used.has(d.id)) return false;
        const ing = d.main_ingredient ?? '';
        if (!g.match(ing)) return false;
        used.add(d.id);
        return true;
      }).slice(0, 12);
      return { label: g.label, items };
    }).filter(g => g.items.length > 0);
  }, [pool]);

  const renderCard = (d: PickerDish) => (
    <div key={d.id} className="relative rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
      {d.image_url ? (
        <img src={d.image_url} alt={d.title_zh} loading="lazy" className="w-full h-24 object-cover" />
      ) : (
        <div className="w-full h-24 bg-gray-100" />
      )}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[13px] font-medium text-gray-800 truncate">{d.title_zh}</span>
        <HeartButton dish={d} sourceTag="家常菜" size={20} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#FAF7F2]/95 backdrop-blur px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <span className="material-symbols-outlined text-gray-500">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900">勾出您家常吃的菜</h1>
        </div>
        <p className="text-[13px] text-gray-500 mt-1 ml-8">
          点亮 ❤️，一周菜单就围着这些菜轮换——比让算法猜准得多
        </p>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜菜名，比如：羊肉焖饭 / 番茄炒蛋"
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] focus:outline-none focus:border-orange-400"
        />
      </div>

      <div className="px-4">
        {query.trim() ? (
          results.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 mt-2">{results.map(renderCard)}</div>
          ) : (
            <p className="text-center text-gray-400 text-sm mt-8">没搜到「{query.trim()}」——换个写法试试</p>
          )
        ) : loading ? (
          <p className="text-center text-gray-400 text-sm mt-8">加载中…</p>
        ) : (
          grouped.map(g => (
            <div key={g.label} className="mt-4">
              <h2 className="text-[14px] font-semibold text-gray-700 mb-2">{g.label}</h2>
              <div className="grid grid-cols-2 gap-3">{g.items.map(renderCard)}</div>
            </div>
          ))
        )}
      </div>

      {/* Bottom bar: 计数 + 完成 */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3 flex items-center justify-between">
        <span className="text-[14px] text-gray-600">
          已勾 <b className="text-orange-500">{favCount}</b> 道{favCount < 8 ? '（建议 8 道以上）' : ''}
        </span>
        <button
          onClick={() => navigate('/weekly')}
          disabled={favCount === 0}
          className="rounded-xl bg-orange-500 disabled:bg-gray-300 text-white text-[14px] font-semibold px-5 py-2.5"
        >
          生成本周菜单
        </button>
      </div>
    </div>
  );
}
