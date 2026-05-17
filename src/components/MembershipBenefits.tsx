/**
 * MembershipBenefits — single source of truth for what 爱吃 Pro unlocks.
 *
 * Used by Pricing (the upsell page) and Settings (the post-onboarding
 * "what am I paying for" surface). Keeping the list here means both
 * surfaces drift together, and the launch-status badges (已上线 / 即将
 * 上线) are honest on every screen.
 *
 * Legal-isolation note (user direction 2026-05-17):
 *   - Every benefit carries an explicit launch status. Features marked
 *     即将上线 are NOT promises of a date; the disclaimer at the bottom
 *     of the block calls this out plainly.
 *   - Wellness-flavored items (祛湿调理, 学校营养补全) carry a
 *     "饮食参考，非医疗建议" footnote — keeps us out of medical-device
 *     / health-product regulatory territory.
 *   - Subscription terms (cancel / renewal) link to /terms rather than
 *     getting buried in microcopy.
 */

import { Link } from 'react-router-dom';

export type BenefitStatus = 'live' | 'coming_soon';

export interface MembershipBenefit {
  emoji:       string;
  title:       string;
  desc:        string;
  status:      BenefitStatus;
  /** Optional in-app destination, shown as a tappable chevron when the
   *  user already is Pro. Free users always navigate to /pricing. */
  href?:       string;
  /** When set, renders a small "*" superscript that ties to the
   *  matching footnote at the bottom of the block. */
  footnote?:   'wellness' | 'school';
}

/** Source of truth — ordered for the upsell page (high-perceived-value first). */
export const BENEFITS: MembershipBenefit[] = [
  {
    emoji: '📅',
    title: '整周菜单解锁',
    desc:  '免费版只能看今天，会员可滑动浏览 7 天完整菜单 + 一周营养均衡总览',
    status: 'live',
    href:  '/weekly',
  },
  {
    emoji: '🛒',
    title: '一键采购清单',
    desc:  '整周菜品自动汇总采购清单 · 分类 / 分日 · 一键导出 Excel · 标记已有',
    status: 'live',
    href:  '/verify',
  },
  {
    emoji: '🚚',
    title: '一键采购自动下单',
    desc:  '清单直接下单 HKTV / 百佳 / Foodpanda · 食材送上门',
    status: 'coming_soon',
  },
  {
    emoji: '⭐',
    title: '米其林灵感菜单',
    desc:  '主厨级菜谱、精致摆盘、高端食材组合 — 在家也能吃得讲究',
    status: 'live',
  },
  {
    emoji: '🧑‍🍳',
    title: '米其林大厨上门',
    desc:  '按场次预约职业厨师到家做饭，从米其林菜单里挑当晚菜品',
    status: 'coming_soon',
  },
  {
    emoji: '🎉',
    title: '家宴菜单',
    desc:  '在家请客 10–20 人 · 按场合 / 忌口 / 孕妇·助长高自动排菜',
    status: 'live',
    href:  '/banquet',
  },
  {
    emoji: '🌿',
    title: '港式祛湿调理 · 节气养生',
    desc:  '按节气和身体感受推汤水：冬瓜薏米 / 五指毛桃 / 川贝雪梨 …',
    status: 'live',
    href:  '/pro/wellness',
    footnote: 'wellness',
  },
  {
    emoji: '🎒',
    title: '学校营养补全',
    desc:  '输入孩子在校菜单，按当日缺口推 3 道家常晚餐补齐营养',
    status: 'live',
    href:  '/pro/school-balance',
    footnote: 'school',
  },
  {
    emoji: '💎',
    title: '高端食材采购源',
    desc: "City'super、SOLE、HKTVmall Premium 直送 · 品质可追溯",
    status: 'coming_soon',
  },
  {
    emoji: '🔄',
    title: '无限菜品替换',
    desc:  '不喜欢的菜，一键 AI 换一道 — 免费版每天 1 次，会员无限',
    status: 'live',
  },
  {
    emoji: '👨‍👩‍👧',
    title: '无限家庭成员档案',
    desc:  '家中每位成员（孕妇 / 长辈 / 儿童 / 工人）分别建档，菜单按当日在家人数自动调整',
    status: 'live',
  },
];

interface Props {
  /** Whether the viewer is already Pro — controls the headline + chip styles. */
  isPro?: boolean;
  /** Hide the disclaimer block (e.g. when embedding next to a richer Terms link). */
  hideDisclaimer?: boolean;
}

export default function MembershipBenefits({ isPro = false, hideDisclaimer = false }: Props) {
  return (
    <section className="bg-white rounded-3xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-bold text-[14px] text-gray-500">
          {isPro ? '已解锁权益' : '会员权益清单'}
        </h3>
        <span className="text-[10px] text-gray-400">
          {BENEFITS.length} 项 · {BENEFITS.filter(b => b.status === 'live').length} 已上线
        </span>
      </div>

      <div className="space-y-3">
        {BENEFITS.map(b => {
          const liveStyle      = { background: 'rgba(22,163,74,0.10)',  color: '#16a34a' };
          const comingStyle    = { background: 'rgba(255,140,84,0.12)', color: '#c2410c' };
          return (
            <div key={b.title} className="flex items-start gap-3">
              <span className="text-[22px] flex-shrink-0">{b.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-[14px]" style={{ color: '#1a1a1a' }}>
                    {b.title}
                    {b.footnote && <sup className="text-[10px] text-gray-400 ml-0.5">*</sup>}
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={b.status === 'live' ? liveStyle : comingStyle}>
                    {b.status === 'live' ? '已上线' : '即将上线'}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!hideDisclaimer && (
        <div className="mt-5 pt-4 border-t border-black/5 space-y-1.5">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-gray-500 font-semibold">* 健康提示：</span>
            「祛湿调理 / 节气养生 / 学校营养补全」均为日常饮食参考，<b>不构成医疗建议、不替代专业营养师或医师诊断</b>。
            特殊健康状况（孕期 / 哺乳期 / 慢性病 / 食物过敏）请先咨询专业人士。
          </p>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-gray-500 font-semibold">关于「即将上线」：</span>
            标注「即将上线」的功能为未来规划，<b>不承诺具体上线时间</b>，订阅价格已含未来功能但不保证全部按期可用。已上线功能不会因新增功能而减少。
          </p>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-gray-500 font-semibold">订阅与续费：</span>
            订阅按所选周期一次性扣款，到期前可随时在 Stripe 客户中心取消，下一周期不再扣款。已支付期款项不退还。详见
            {' '}<Link to="/terms" className="underline hover:text-gray-700">服务条款</Link>
            {' '}与
            {' '}<Link to="/privacy" className="underline hover:text-gray-700">隐私政策</Link>。
          </p>
        </div>
      )}
    </section>
  );
}
