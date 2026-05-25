# TICKET-077 P0 — Inalca F&B 唯一真合作供应商真化 + 公司介绍卡 + 删 mock + 删 Pricing 空气卖点

## 问题

老板真测 #20 发现 3 个集中爆发的诚信漏洞:

1. **3 家 mock 采购点欺骗用户** — VerifyIngredients.tsx `SHOPS_BY_GROUP` 硬编码"街市肉档 / 百佳 / City'super 肉品"等 12 家假合作店, 给用户造成"我们已经接好这些渠道"的错觉, 但实际一行 API 都没接.
2. **Pricing 卖了 Excel 但又把 Excel 当 Pro 升级卖点** — Excel 真做了 (handleExportExcel + xlsx import), 已在免费版可用; 但 ProGate 弹卡仍写"升级 Pro 解锁 Excel 导出" — 这把已 ship 的免费功能伪装成 Pro 差异化, 用户付费后没增量价值.
3. **没真供应商品牌介绍** — 老板手里有第一家真供应商 (Bright View Trading 代理的 Inalca F&B, 意大利 Cremonini 集团 60 年品牌, 5 个意大利 SKU 已在 DB 但 supplier status='pending', UI 完全不显), 错过最大的信任背书机会.

## 方法

**核心: 加 status='preview' 中间态**, 介于 pending (DB 有但 UI 不显) 和 active (UI 显示 + 真下单) 之间:

- DB migration 092: 给 suppliers 表加 15 个新字段 (13 个公司介绍 + 2 个 API 对接规划) + 删除非 Inalca placeholder + UPDATE Inalca row 全字段 + status='preview' + RLS 扩 anon 也能读 preview.
- 前端 `loadActiveOrPreviewSuppliers()` 拉 active+preview 两态 supplier.
- 顶部 strip "合作供应商 · N 家" + 点卡 → SupplierBrandModal 显示品牌故事 + 信任认证 (IFS Food / BRC / EU Organic) + Coming Soon API 对接 banner.
- preview supplier 的 "一键下单" 按钮改成 "即将开放", 点了弹小卡片 "敬请期待", **不**调真 supplier-order-track edge fn, **不**走 mailto / tel.

**红线 (老板紧急修订 §1-5)**: 销售联系方式 (Irish 名/邮/电) = 老板核心机密 = 商业机密, DB 字段保留但前端**绝不渲染**; 不提 "Bright View Trading" 代理公司名 (用户不需知中间商); 不露 website_url (避免用户绕过我们直接联系供应商); 不露 address_* (那是仓库地址, 用户不需知); description 改用户视角卖点 (60 年品牌 + Cremonini + 直采源头价格优势利用市场认知差).

**Pricing 卖点切换**: MembershipBenefits.tsx 把 "一键采购清单" desc 里 "一键导出 Excel" 字眼删 (Excel 是免费功能不再当 Pro 卖点); "高端食材采购源" desc 从 "City'super、SOLE、HKTVmall Premium" (没真合作) 改成 "意大利 Inalca · Cremonini 集团" (真合作) — 现在用户去 /verify 真能看到 PREVIEW chip. ProGate 弹卡文案同步 "Excel" → "高端食材采购源 · 一键直送合作供应商".

## 标准

**今后凡显示给用户的供应商必须四件套全齐**:
1. **status** — pending (不显) / preview (显示介绍但 Coming Soon) / active (真下单)
2. **公司简介** — description 三语 (用户视角卖点, 不提中间商不露公司机密)
3. **信任认证** — certifications text[] (IFS Food / BRC 等)
4. **品牌背书** — parent_brand + founded_year

没有这四件套的不显, 直接 status='pending' 退到 DB 后台.

**凡 Pricing 卖点必须功能真做完**:
- 已做完的不要当 Pro 升级差异化 (Excel 这种是基线功能), 应放 "免费版即享"
- Pro 卖点必须是用户付费后才能解锁的真增量 (高端食材直采 / 米其林菜单 / 家宴 / 港式祛湿)
- 没做完的功能标 "即将上线" + 在 MembershipBenefits 显式声明 + 不在 hero 文案做暗示性承诺

**销售联系方式商业机密红线**:
- DB 可以存 sales_contact_name / email / mobile / website_url (老板后台备查)
- 前端组件**禁止 import / 渲染**这些字段
- "联系销售"按钮永远不要用 mailto: / tel: 跳邮箱 — 那等于把销售邮箱给所有用户
- 真要联系销售走 in-app form, 后端转发, 前端永远拿不到销售真实联系方式
