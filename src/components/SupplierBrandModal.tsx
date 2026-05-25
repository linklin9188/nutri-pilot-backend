/**
 * SupplierBrandModal — 公司介绍卡 (TICKET-077 P0)
 *
 * 显示供应商品牌故事 + 信任认证 + API 对接规划。
 *
 * ⚠️ 老板红线 (2026-05-25 紧急修订):
 *   - 销售联系方式 (sales_contact_name / email / mobile) = 老板核心机密, 绝不渲染
 *   - 不提 "Bright View Trading" 代理公司名 (用户不需知中间商)
 *   - 不露 website_url (避免用户绕过我们直接联系供应商)
 *   - 不露 address_* (那是仓库地址, 用户不需知)
 *   - "Coming Soon" 按钮不要 mailto: / tel: — 改成弹小卡片"敬请期待"
 *
 * 渲染内容 (聚焦"为什么这家高级" + "让用户放心"):
 *   - 国旗 + name (DB name 已是 "Inalca · 意大利顶级肉品")
 *   - parent_brand (品牌背书, e.g. Cremonini Group)
 *   - founded_year (信任背书)
 *   - description (三语用户视角文案 — 60 年品牌 + 欧洲最大 + 直采源头价格优势)
 *   - certifications chip 列表 (IFS Food / BRC / EU Organic 信任背书)
 *   - API 对接 banner (即将开放, 期待感)
 */

import { useLanguage } from '../contexts/LanguageContext';
import type { SupplierWithBrand } from '../lib/suppliers';

interface Props {
  open:      boolean;
  supplier:  SupplierWithBrand | null;
  onClose:   () => void;
}

// ISO-2 → emoji 国旗 (按需扩展, 当前只用 IT)
function countryFlag(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return '🌍';
  const A = 0x1F1E6;
  const a = 'A'.charCodeAt(0);
  const cc = iso2.toUpperCase();
  return String.fromCodePoint(A + (cc.charCodeAt(0) - a)) + String.fromCodePoint(A + (cc.charCodeAt(1) - a));
}

export default function SupplierBrandModal({ open, supplier, onClose }: Props) {
  const { t, t3 } = useLanguage();
  if (!open || !supplier) return null;

  const desc = t3(
    supplier.description_en ?? '',
    supplier.description_zh ?? '',
    supplier.description_tl ?? '',
  );

  // 是否显示"即将开放在线下单" banner — preview 状态或 api_integration_status !== 'integrated'
  const showApiBanner = supplier.status === 'preview'
    || (supplier.api_integration_status != null && supplier.api_integration_status !== 'integrated');

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 -8px 32px rgba(0,0,0,0.18)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span style={{ fontSize: 26 }}>{countryFlag(supplier.country_origin)}</span>
              <h2 className="font-bold text-[18px] leading-tight">{supplier.name}</h2>
            </div>
            {supplier.parent_brand && (
              <p className="text-[12px] text-gray-500 mt-0.5">{supplier.parent_brand}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-black/5 active:scale-95 transition-transform flex-shrink-0"
            aria-label={t('Close', '关闭')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Description (用户视角卖点) */}
        {desc && (
          <p className="text-[13.5px] leading-relaxed text-gray-700 mb-4">
            {desc}
          </p>
        )}

        {/* 价格优势卖点 — 利用市场认知差 (老板亲手画的产品差异)
            香港用户只知 HKTVmall / Citysuper 零售, 不知 Inalca 这种 B2B 源头. */}
        <div
          className="rounded-2xl p-3 mb-4 flex items-start gap-2.5"
          style={{
            background: 'linear-gradient(135deg, rgba(255,179,71,0.16) 0%, rgba(255,90,31,0.10) 100%)',
            border: '1px solid rgba(255,90,31,0.20)',
          }}
        >
          <span style={{ fontSize: 22 }}>💎</span>
          <div className="flex-1">
            <p className="text-[12.5px] leading-snug" style={{ color: '#7a3000' }}>
              {t3(
                'Same premium Italian sourcing, direct from origin — better pricing than local luxury retail.',
                '同款意大利顶级食材, 直采源头, 价格更优于本地高端零售。',
                'Parehong premium na Italian sourcing, direkta sa pinagmulan — mas magandang presyo kaysa sa lokal na luxury retail.',
              )}
            </p>
          </div>
        </div>

        {/* Trust badges — certifications chip 列表 */}
        {supplier.certifications && supplier.certifications.length > 0 && (
          <div
            className="rounded-2xl p-3 mb-4"
            style={{
              background: 'rgba(22,163,74,0.06)',
              border: '1px solid rgba(22,163,74,0.20)',
            }}
          >
            <p className="font-bold text-[12px] mb-2" style={{ color: '#16a34a' }}>
              ✅ {t3('Trust Certifications', '信任认证', 'Mga Sertipikasyon')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {supplier.certifications.map(cert => (
                <span
                  key={cert}
                  className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{
                    background: 'white',
                    border: '1px solid rgba(22,163,74,0.30)',
                    color: '#16a34a',
                  }}
                >
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Founded year — 信任背书 */}
        {supplier.founded_year && (
          <div className="flex items-center gap-2 text-[13px] text-gray-600 mb-4">
            <span style={{ fontSize: 18 }}>📅</span>
            <span>
              {t3(
                `Founded ${supplier.founded_year} · ${new Date().getFullYear() - supplier.founded_year} years of heritage`,
                `${supplier.founded_year} 年成立 · ${new Date().getFullYear() - supplier.founded_year} 年品牌`,
                `Itinatag ${supplier.founded_year} · ${new Date().getFullYear() - supplier.founded_year} taon ng pamana`,
              )}
            </span>
          </div>
        )}

        {/* API 对接规划 banner — 期待感 (老板紧急修订 §4) */}
        {showApiBanner && (
          <div
            className="rounded-2xl p-3.5 mt-2"
            style={{
              background: 'linear-gradient(135deg, rgba(255,90,31,0.08) 0%, rgba(255,140,84,0.04) 100%)',
              border: '1px dashed rgba(255,90,31,0.35)',
            }}
          >
            <p className="font-bold text-[13px] flex items-center gap-1.5" style={{ color: '#FF5A1F' }}>
              <span style={{ fontSize: 16 }}>🔗</span>
              {t3('Online ordering coming soon', '即将开放在线下单', 'Online ordering coming soon')}
            </p>
            <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: 'rgba(0,0,0,0.55)' }}>
              {t3(
                "We're integrating with the supplier's system. Once live, you can order directly in-app.",
                '我们正在为您接入供应商系统, 上线后可在 app 内一键直采, 第一时间通知您。',
                'Inaayos namin ang sistema ng supplier. Kapag live, maaari kang mag-order direkta sa app.',
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
