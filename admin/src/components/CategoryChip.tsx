import { UserCategory } from '../lib/api';

/**
 * CategoryChip — TICKET TELEPOT-20260526-091
 *
 * 老板真测 #27 发现 admin 用户列表 94 人里 31 是 seed 假数据 + 8 是测试号,
 * 真业务数据被严重污染. 加 chip 让老板一眼看出哪些是真用户、哪些可忽略.
 *
 * 颜色约定:
 *   wechat_real → 绿色 (微信扫码登录, 强信号)
 *   other_real  → 蓝色 (有真实姓名但非 wechat)
 *   anon        → 灰色 (匿名访问, 弱信号但仍算真流量)
 *   seed        → 黄色 (DB 批量插入的演示数据)
 *   test        → 红色 (老板/团队亲手测试号)
 */
const STYLES: Record<UserCategory, { bg: string; fg: string; label: string }> = {
  wechat_real: { bg: '#dcfce7', fg: '#166534', label: '微信真用户' },
  other_real:  { bg: '#dbeafe', fg: '#1e40af', label: '其他真实' },
  anon:        { bg: '#f1f5f9', fg: '#475569', label: '匿名' },
  seed:        { bg: '#fef3c7', fg: '#92400e', label: 'Seed' },
  test:        { bg: '#fee2e2', fg: '#991b1b', label: '测试号' },
};

export default function CategoryChip({ category }: { category: UserCategory | undefined }) {
  if (!category || !(category in STYLES)) {
    return <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 11, color: '#94a3b8', background: '#f8fafc',
    }}>—</span>;
  }
  const s = STYLES[category];
  return (
    <span style={{
      display:     'inline-block',
      padding:     '2px 8px',
      borderRadius: 999,
      fontSize:    11,
      fontWeight:  600,
      color:       s.fg,
      background:  s.bg,
      whiteSpace:  'nowrap',
    }}>{s.label}</span>
  );
}

export const CATEGORY_LABELS: Record<UserCategory, string> = {
  wechat_real: '微信真用户',
  other_real:  '其他真实',
  anon:        '匿名',
  seed:        'Seed',
  test:        '测试号',
};
