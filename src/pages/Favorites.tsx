/**
 * Favorites — the user's saved dishes ("我的收藏菜单") index page.
 *
 * Grouped by source_tag so the user remembers where they picked each dish
 * up (家宴 / 本周菜单 / 祛湿 / 学校营养 / 扫一扫 / …). Each row has a
 * remove (heart) button and an "add to this week's menu" shortcut which
 * appends the dish to localStorage.generatedMenu (used by Home + Prep + Cook).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomTabBar from "../components/BottomTabBar";
import { HeartButton } from "../components/HeartButton";
import {
  loadFavorites, groupFavoritesByTag, type FavoriteDish,
} from "../lib/favorites";

export default function Favorites() {
  const navigate = useNavigate();
  const [favs, setFavs] = useState<FavoriteDish[]>(() => loadFavorites());

  // Keep the page in sync if the user toggles a heart somewhere else.
  useEffect(() => {
    const sync = () => setFavs(loadFavorites());
    window.addEventListener("nutri-favorites-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nutri-favorites-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const grouped = groupFavoritesByTag();

  function addToWeeklyMenu(dish: FavoriteDish) {
    // Append to generatedMenu — the local cache used by Home / Prep / Cook.
    // Doesn't write to the algorithm-generated weekly_menu_<ALGO_VERSION>
    // cache; this is a manual one-shot 'cook me this' for the next meal.
    const raw = localStorage.getItem("generatedMenu");
    let arr: any[] = [];
    try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
    if (!arr.some(d => d.id === dish.id)) {
      arr.push({
        id:       dish.id,
        title_zh: dish.title_zh,
        title_en: dish.title_en,
        image_url:dish.image_url,
        course_type:     dish.course_type,
        main_ingredient: dish.main_ingredient,
        origin_cuisine:  dish.origin_cuisine,
      });
      localStorage.setItem("generatedMenu", JSON.stringify(arr));
      window.dispatchEvent(new Event("nutri-prefs-changed"));
    }
    navigate("/");
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
          <h1 className="text-[18px] font-bold">我的收藏</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{favs.length} 道菜 · 按场景分组</p>
        </div>
        <span className="text-[20px]">❤️</span>
      </header>

      <main className="flex-1 px-4 py-4 space-y-5 pb-28">
        {favs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">favorite_border</span>
            <p className="font-medium">还没有收藏</p>
            <p className="text-sm mt-1 leading-relaxed">
              在菜单 / 家宴 / 祛湿 / 学校营养 等页面点 ❤️<br />
              把喜欢的菜攒在这里，下次直接做
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
            >
              去发现菜
            </button>
          </div>
        ) : (
          grouped.map(({ tag, items }) => (
            <section key={tag}>
              <p className="text-[13px] font-bold text-gray-500 mb-2 px-1">{tag} · {items.length}</p>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {items.map((dish, i) => (
                  <div
                    key={dish.id}
                    className={`flex items-center gap-3 px-3 py-3 ${
                      i !== items.length - 1 ? 'border-b border-black/[0.05]' : ''
                    }`}
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: "rgba(0,0,0,0.05)" }}>
                      {dish.image_url ? (
                        <img src={dish.image_url} alt={dish.title_zh}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[20px]">🍽️</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[14px] truncate">{dish.title_zh}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {dish.origin_cuisine ?? '家常'}
                        {dish.course_type ? ` · ${dish.course_type}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => addToWeeklyMenu(dish)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-bold"
                      style={{ background: 'rgba(255,90,31,0.12)', color: '#FF5A1F' }}
                    >
                      + 菜单
                    </button>
                    <HeartButton dish={dish} sourceTag={dish.source_tag} size={18} />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
