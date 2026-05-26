/**
 * DishImage — TICKET-095 hot-fix
 *
 * 老板真测追问 (5/27): "之前的图片和菜名要一致的问题解决了吗?"
 *
 * 真因实查 3 层:
 * - DB image_url 跟 dish_id 强绑 → ✅ 已修 (TICKET-085)
 * - getFallbackImage() unsplash 池轮播 → ✅ DB 100% 有图后已不触发
 * - 但 Home.tsx / Community.tsx onError 写死 1 张 unsplash URL → ⚠️ 图加载失败
 *   会显示固定的"番茄炒蛋样图" (错配感更强)
 *
 * 修法: 用纯色 placeholder 取代错 unsplash, 不假装是菜图. 橙底 + 菜名首字
 * + 餐盘 emoji, 视觉上能 communicate "图加载失败但这是 X 菜".
 */

import { useState } from 'react';

interface Props {
  src?: string | null;
  alt: string;
  /** 菜名 — 用于 fallback placeholder 显示首字 */
  title?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 颜色池 — 跟 MEMBER_COLORS 同色系，但稍亮 (菜图占位用).
 * 按 title 字符串 hash 稳定挑色 (同菜永远同色).
 */
const PLACEHOLDER_COLORS = [
  'linear-gradient(135deg, #FF8C54, #FF5A1F)',  // 橙
  'linear-gradient(135deg, #FFB347, #FF8C00)',  // 暖橙
  'linear-gradient(135deg, #FFD580, #FFA94D)',  // 浅橙
  'linear-gradient(135deg, #FF6B6B, #EE5253)',  // 红
  'linear-gradient(135deg, #FFA07A, #FA8072)',  // 鲑红
];

function hashTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = ((h << 5) - h + title.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function DishImage({ src, alt, title, className, style }: Props) {
  const [failed, setFailed] = useState(false);

  const validSrc = src && src.trim() && !failed;

  if (validSrc) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        onError={() => setFailed(true)}
      />
    );
  }

  // Placeholder: 橙底 + 菜名首字 + 🍽 emoji
  const displayTitle = (title || alt || '').trim();
  const initial = displayTitle.charAt(0) || '🍽';
  const colorIdx = hashTitle(displayTitle) % PLACEHOLDER_COLORS.length;
  const bg = PLACEHOLDER_COLORS[colorIdx];

  return (
    <div
      className={`${className ?? ''} flex flex-col items-center justify-center`}
      style={{
        background: bg,
        color: 'white',
        ...style,
      }}
      aria-label={alt}
    >
      <span style={{ fontSize: '1.8em', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {initial}
      </span>
      <span style={{ fontSize: '0.6em', opacity: 0.7, marginTop: '0.2em' }}>🍽</span>
    </div>
  );
}
