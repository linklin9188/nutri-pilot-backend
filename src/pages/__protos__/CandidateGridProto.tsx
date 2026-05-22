/**
 * CandidateGridProto — TICKET-018 §D DEV-only prototype
 *
 * Mock 5-candidate lunch_main grid. Frozen interface preview for Algorithm
 * 018 §B: slots[].candidates[] = { dish, score, tagBadges }. UI 019 will
 * wire this layout to real weeklyMenu.days[].slots[].candidates[] once
 * Algorithm 018 ships the new return shape.
 *
 * Route: /__proto__/candidate-grid (DEV only — App.tsx gates with
 * import.meta.env.DEV). Prod build excludes this file entirely.
 */
import { useState } from 'react';
import { TagBadgeRow, type TagBadge } from '../../components/TagBadge';

interface SlotChoice {
  dish:      { title: string; description: string; image?: string };
  score:     number;
  tagBadges: TagBadge[];
}

const MOCK_CANDIDATES: SlotChoice[] = [
  {
    dish:  { title: '红烧牛腩', description: '酱香入味 · 软糯不柴' },
    score: 0.92,
    tagBadges: [
      { kind: 'preference',     icon: '🌶️', label: '偏好', reason: '你常点红肉 + 微辣' },
      { kind: 'seasonal',       icon: '🌿', label: '当季', reason: '初夏炖煮菜' },
    ],
  },
  {
    dish:  { title: '宫保鸡丁', description: '花生脆 · 微辣 · 经典川菜' },
    score: 0.87,
    tagBadges: [
      { kind: 'preference',     icon: '🌶️', label: '偏好', reason: '你常点白肉 + 微辣' },
    ],
  },
  {
    dish:  { title: '清蒸鲈鱼', description: '葱姜清香 · 鲜嫩本味' },
    score: 0.81,
    tagBadges: [
      { kind: 'weekly_balance', icon: '💪', label: '补蛋白', reason: '本周海鲜未达标' },
      { kind: 'seasonal',       icon: '🌿', label: '当季', reason: '5 月鲈鱼肥美' },
    ],
  },
  {
    dish:  { title: '青团', description: '艾草糯米 · 豆沙馅' },
    score: 0.76,
    tagBadges: [
      { kind: 'festival',       icon: '🎋', label: '节气', reason: '清明应景' },
    ],
  },
  {
    dish:  { title: '什锦蔬菜煲', description: '5 色蔬菜 · 高纤低卡' },
    score: 0.70,
    tagBadges: [
      { kind: 'school_balance', icon: '🎒', label: '校餐补', reason: '昨日学校缺纤维' },
      { kind: 'weekly_balance', icon: '💪', label: '补纤维', reason: '本周纤维未达标' },
    ],
  },
];

export default function CandidateGridProto() {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);

  return (
    <div className="min-h-screen max-w-md mx-auto px-5 pt-12 pb-24" style={{ background: '#FAF7F2' }}>
      <header className="mb-5">
        <h1 className="font-black" style={{ fontSize: 24 }}>中午吃什么？</h1>
        <p className="mt-1" style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
          5 候选 · 算法推荐 · <span className="font-bold">DEV PROTOTYPE</span>
        </p>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
        {MOCK_CANDIDATES.map((c, idx) => {
          const isPrimary = idx === 0;
          const isPicked = pickedIdx === idx;
          return (
            <button
              key={idx}
              onClick={() => setPickedIdx(idx)}
              className="rounded-2xl flex-shrink-0 text-left p-3 active:scale-[0.97] transition-all"
              style={{
                width: 168,
                background: 'white',
                border: isPicked
                  ? '2px solid #FF5A1F'
                  : isPrimary
                    ? '2px solid #FF8C54'
                    : '1px solid rgba(0,0,0,0.08)',
                boxShadow: isPicked
                  ? '0 6px 20px rgba(255,90,31,0.30)'
                  : isPrimary
                    ? '0 4px 14px rgba(255,140,84,0.15)'
                    : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              {isPrimary && (
                <div className="inline-block rounded-full px-2 py-0.5 mb-2"
                  style={{ background: '#FF8C54', color: 'white', fontSize: 10, fontWeight: 700 }}>
                  ⭐ 首选
                </div>
              )}
              <div className="w-full rounded-xl mb-2 flex items-center justify-center"
                style={{ aspectRatio: '1', background: 'rgba(255,90,31,0.08)', fontSize: 36 }}>
                🍽️
              </div>
              <p className="font-bold" style={{ fontSize: 14 }}>{c.dish.title}</p>
              <p className="mt-0.5" style={{ fontSize: 11, color: 'rgba(0,0,0,0.50)' }}>{c.dish.description}</p>
              <TagBadgeRow badges={c.tagBadges} />
              <p className="mt-2" style={{ fontSize: 10, color: 'rgba(0,0,0,0.40)' }}>
                匹配度 {(c.score * 100).toFixed(0)}%
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setPickedIdx(null)}
          className="flex-1 py-3 rounded-2xl font-bold active:scale-95"
          style={{ background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.65)', fontSize: 14 }}
        >
          🔄 换一道
        </button>
        <button
          disabled={pickedIdx === null}
          className="flex-1 py-3 rounded-2xl font-bold text-white active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 14 }}
        >
          ✓ 就这个
        </button>
      </div>

      <div className="mt-8 rounded-2xl p-3" style={{ background: 'rgba(255,165,0,0.08)', border: '1px dashed rgba(255,165,0,0.30)' }}>
        <p className="font-bold mb-1" style={{ fontSize: 11, color: '#B45309' }}>⚠️ DEV PROTOTYPE</p>
        <p style={{ fontSize: 10, color: '#92400E', lineHeight: 1.5 }}>
          5-candidate grid layout preview for Algorithm 018 §B. Mock data only.
          UI 019 wires this to real weeklyMenu.days[].slots[].candidates[] after
          Algorithm ships generateWeekPlan new return shape.
        </p>
      </div>
    </div>
  );
}
