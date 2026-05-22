/**
 * TagBadge — 5-channel candidate badge (TICKET-018 §B)
 *
 * Aligns with Algorithm 018 §B planned interface:
 *   slot.candidates[] : { dish, score, tagBadges: TagBadge[] }
 *
 * 5 channels (CEO 拍板):
 *   🌶️ preference     — 用户偏好命中
 *   🌿 seasonal       — 当季食材
 *   🎋 festival       — 节庆 / 节气
 *   🎒 school_balance — 校餐平衡补
 *   💪 weekly_balance — 周营养补
 *
 * Algorithm pre-sorts by priority; UI only shows top 2 per dish to avoid clutter.
 */

export type TagBadgeKind =
  | 'preference'
  | 'seasonal'
  | 'festival'
  | 'school_balance'
  | 'weekly_balance';

export interface TagBadge {
  kind:    TagBadgeKind;
  icon:    string;
  label:   string;
  reason?: string;
}

const COLOR_MAP: Record<TagBadgeKind, string> = {
  preference:     'bg-orange-100 text-orange-700 border-orange-300',
  seasonal:       'bg-green-100 text-green-700 border-green-300',
  festival:       'bg-pink-100 text-pink-700 border-pink-300',
  school_balance: 'bg-blue-100 text-blue-700 border-blue-300',
  weekly_balance: 'bg-purple-100 text-purple-700 border-purple-300',
};

export function TagBadgeChip({ badge }: { badge: TagBadge }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${COLOR_MAP[badge.kind]}`}
      title={badge.reason}
    >
      <span>{badge.icon}</span>
      <span className="font-medium">{badge.label}</span>
    </span>
  );
}

export function TagBadgeRow({ badges }: { badges: TagBadge[] }) {
  const shown = badges.slice(0, 2);
  if (!shown.length) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {shown.map((b, i) => <TagBadgeChip key={i} badge={b} />)}
    </div>
  );
}
