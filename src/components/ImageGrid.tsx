import { motion } from 'motion/react';

// TICKET-005 v3 — 图片驱动 onboarding 通用网格。短期用 emoji + 文字 placeholder
// 让 build 通过；后续 push 图片时把 img 字段填上 /public/onboarding/*.jpg 即可，
// 渲染端会自动优先 img 再回退到 emoji。

export interface ImageGridOption {
  value: string;
  label: string;
  desc?: string;
  emoji?: string;
  img?: string;
}

export interface ImageGridProps {
  options: ImageGridOption[];
  multi: boolean;
  selected: string[];
  onToggle: (value: string) => void;
  cols?: 2 | 3;
}

export default function ImageGrid({ options, multi, selected, onToggle, cols = 2 }: ImageGridProps) {
  const gridCols = cols === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${gridCols} gap-3 flex-1`}>
      {options.map((opt, idx) => {
        const sel = selected.includes(opt.value);
        return (
          // TICKET-028 §C — 卡片"活感"微动:
          //   mount: fade-in + slide-from-bottom (staggered 30ms per index)
          //   hover: scale 1.04 + 阴影 lift
          //   active selected: 内卡 scale 1.05 + ring (CSS class)
          //   tap: scale 0.96 (whileTap, 已有)
          // 不依赖 Tailwind animate-* plugin — 用 framer-motion initial/animate.
          <motion.button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.30, delay: idx * 0.03, ease: 'easeOut' }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className={`flex flex-col items-center justify-center text-center p-4 rounded-2xl transition-shadow relative overflow-hidden ${sel ? 'ring-2 ring-[#FF5A1F]' : ''}`}
            style={sel
              ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F', boxShadow: '0 0 24px rgba(255,90,31,0.25)', minHeight: opt.img ? 168 : 132 }
              : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', minHeight: opt.img ? 168 : 132 }
            }>
            {opt.img ? (
              <img src={opt.img} alt={opt.label}
                className="w-full h-24 object-cover rounded-xl mb-2 transition-transform duration-300 hover:scale-[1.03]" />
            ) : (
              <span className="text-[44px] leading-none mb-2 transition-transform duration-200">{opt.emoji ?? '🍽'}</span>
            )}
            <span className="text-white font-semibold" style={{ fontSize: 13, lineHeight: 1.3 }}>{opt.label}</span>
            {opt.desc && (
              <span className="text-white/45 font-light mt-1" style={{ fontSize: 11, lineHeight: 1.3 }}>{opt.desc}</span>
            )}
            {multi && sel && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#FF5A1F' }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>check</span>
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
