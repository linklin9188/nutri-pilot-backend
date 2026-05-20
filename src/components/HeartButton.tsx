/**
 * HeartButton — small inline icon button to toggle a dish into 收藏 (favorites).
 *
 * Drop-in: pass the dish + a source tag (e.g. '家宴' / '本周菜单' / '祛湿'),
 * and the button manages persistence + visual state itself.
 *
 *   <HeartButton dish={{...}} sourceTag="家宴" size={20} />
 *
 * Listens to 'nutri-favorites-changed' so multiple instances of the same dish
 * across the page stay in sync after toggling.
 */

import { useEffect, useState } from "react";
import { isFavorited, toggleFavorite, type FavoriteDish } from "../lib/favorites";

type DishLike = Partial<FavoriteDish> & { id: string; title_zh: string };

interface Props {
  dish: DishLike;
  sourceTag?: string;
  size?: number;          // px height of the heart icon
  className?: string;
}

export function HeartButton({ dish, sourceTag, size = 18, className = "" }: Props) {
  const [on, setOn] = useState(() => isFavorited(dish.id));

  useEffect(() => {
    const sync = () => setOn(isFavorited(dish.id));
    window.addEventListener("nutri-favorites-changed", sync);
    return () => window.removeEventListener("nutri-favorites-changed", sync);
  }, [dish.id]);

  return (
    <button
      onClick={e => {
        e.stopPropagation();
        const next = toggleFavorite({
          id:               dish.id,
          title_zh:         dish.title_zh,
          title_en:         dish.title_en,
          image_url:        dish.image_url,
          course_type:      dish.course_type,
          main_ingredient:  dish.main_ingredient,
          origin_cuisine:   dish.origin_cuisine,
          source_tag:       sourceTag,
        });
        setOn(next);
      }}
      className={`active:scale-90 transition-transform p-1 ${className}`}
      // TICKET-052 §B — tooltip 区分 ❤️ 收藏 vs 😋 评分。收藏 = 永久保存
      // 这道菜到 '我的最爱'；评分 = 告诉算法你的口味（在 ✅ 我做了 popup 里）。
      title={on ? "已收藏 · 点击移除（在'我的最爱'里）" : "保存这道菜，以后可在'我的最爱'里再找到"}
      aria-label={on ? "Remove from My Favorites" : "Save to My Favorites for later"}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: size,
          color: on ? "#EF4444" : "rgba(0,0,0,0.30)",
          fontVariationSettings: on ? "'FILL' 1" : "'FILL' 0",
        }}
      >
        favorite
      </span>
    </button>
  );
}
