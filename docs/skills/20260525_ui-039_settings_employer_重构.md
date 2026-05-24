# TICKET TELEPOT-20260525-039 P1 — Settings 雇主端大重构 (第 3 棒)

**日期**: 2026-05-25
**部门**: UI
**Spec**: `docs/SPEC_settings大重构_老板拍板.md` §0 v2 / §3
**改动文件**: `src/pages/Settings.tsx`
**前置 ship**: 第 1 棒 DB commit `3d0b460` + mini 085 commit `9da93d4` + 第 2 棒 Algorithm v65 commit (嵌入向量推荐已上)

---

## 大白话 §1 头像区 (合并 UI-031c)

**问题**: 原 Settings 头像只读 `avatar_b64` (用户自传) 和 `display_name`，
没看微信 OAuth 已经填好的 `avatar_url` + `nickname` (migration 081 已加列、
backend §A wechat OAuth 已存)，所以一登录的用户看见的还是"你"占位 +
userId 短码，浪费微信数据。

**修法**: SELECT 加 `avatar_url, nickname`。
头像优先级 `avatar_b64 (用户自传) > avatar_url (微信) > 橙渐变首字母圆`。
昵称优先级 `display_name (用户改) > nickname (微信原始) > userId.slice(0,8)`。
微信 avatar_url 有可能跨域 / 防盗链失败 → 加 `onError` 兜底隐藏 img,
首字母圆兜上去。

---

## 大白话 §2 我的口味偏好 — 算法反推 chip + 手动调抽屉

**老板的方针 (spec §0.1)**: 算法范式从 "Enum 字段填表" 改成 "嵌入向量 +
余弦相似度"，第一段读懂口味 (用户选图片) 算法用嵌入向量反推，第二段
营养重排。所以 Settings 不再让用户重填一遍 spice/cuisine/budget 这些
字段——而是把算法反推的 9 字段**以 chip 形式 read-only 展示**让用户
看见"算法理解的我是这样"。想手动覆盖? 点"想手动调?" 展开抽屉。

**反推 chip 数据源** (user_profiles 9 字段):
- spice_tolerance → 🌶 完全不辣 / 微微辣 / 中辣 / 重辣
- taste_intensity → 🍵 清淡 / 适中 / 浓郁
- cuisine_preference → 🍝 中餐 / 西餐 / 日韩 / 中西混搭
- hometown_cuisine → 🏠 粤菜家乡 / 川菜家乡 / etc
- excluded_meats → 🥩 不吃 猪/牛/羊
- cooking_methods_pref → 🍳 爱 蒸·炒·炖
- budget_level → 💰 实惠 / 适中预算 / 高端

**手动调抽屉 5 字段** (advanced，直接 upsert user_profiles, 单字段保存):
1. cooking_methods_pref (多选 chip 6 项 蒸/炒/炖/煮/烤/炸)
2. excluded_meats (多选 chip 5 项 猪/牛/羊/鸡/鸭)
3. excluded_ingredients (多选 chip 7 项 苦瓜/茄子/香菜/豆腐/葱/姜/蒜)
4. cooking_frequency_per_week (range slider 1-7)
5. budget_level (单选 3 项)

前 4 个反推字段 (hometown / cuisine / spice / taste_intensity) 这版
**不给覆盖入口**——它们继续走 onboarding 图片选 + QuickSetup + intent
反推。第 4 棒 onboarding 重做完成后这部分数据会被更稳定地填好。

---

## 大白话 §3 家庭成员独立卡 — 12 字段

**之前**: FamilyMember 只有 4 字段 (id / name / lifeStage / needs)，
信息密度不够，算法侧拿不到 BMI / 过敏 / 慢病 / 体质 / 孕期等关键维度。

**这次**: FamilyMember 类型升级到 spec §1.2 的 12 字段 (后 11 全 optional
向前兼容老 localStorage 数据)。卡片头部 3 核心信息: 头像 + 名字 +
关系 chip + 健康目标 chip。点开抽屉显示 12 字段编辑器:

1. name (text input)
2. relation (4 列 chip - 我自己/配偶/儿子/女儿/父亲/母亲/其他)
3. gender (2 列 chip - 男/女)
4-6. age_years / height_cm / weight_kg (3 列 number input)
7. dietary_goal (3 列 6 项 chip - 日常均衡/增肌/减脂/备孕/学龄增长/老人养生)
8. allergens (多选 chip 8 项 海鲜/坚果/麸质/奶/蛋/猪/牛/羊) - 标红表示硬过滤
9. chronic_diseases (多选 chip 4 项 高血压/糖尿病/痛风/高胆固醇)
10. dietary_mode (3 列 5 项 chip - 杂食/素食/纯素/清真/犹太洁食)
11. tcm_constitution (chip 8 体质)
12. pregnancy_status (chip 6 项，**仅 gender=female 才显示**)

外加保留 lifeStage 选项 (LIFE_STAGES) + 老 needs 标签 (NEED_GROUPS)
**因算法侧 familyPrefs.ts 仍读这两个字段**。新的 12 字段是"未来给
算法用的"，老两个是"现在算法在用的"。两者并存到 Algorithm 下一棒
统一切换。

**删除按钮带 window.confirm 二次确认** (spec 要求 with confirm dialog)。

**"+ 添加家人" 按钮**: 复用现有 `addMember()`，新建 row + 自动 `setOpenId`
打开抽屉填资料 (spec §3 末尾)。

---

## ⚠️ Storage 决策: localStorage 而非 household_members

**Schema 现状阻挡 DB 写**:
- `household_members.helper_id` 类型 text + NOT NULL + FK→user_profiles.id
  (migration 025 修 Smell 3 时这么定的, 因 helper 必有 user_profiles row)
- 家人不是 helper, 没 user_profiles row → INSERT 会被 FK 拒
- 真要写 DB 须先 INSERT 假 user_profiles row (synthetic id), schema 进一步
  改造 (helper_id NULLABLE 或加 family_member_id 列), 是 Database 棒的活

**本棒 (UI) 决定**: 继续走 localStorage `nutri_family_members`，
算法侧 `familyPrefs.ts` 同款读取路径不变。在 FamilyMember type 上新增的
11 字段 JSON 序列化进 localStorage 即可，未来 DB 棒落地把这些字段
一对一搬迁就行——type 已经按 spec §1.2 设计好了。

**Spec §3 措辞** "编辑保存 → update household_members" 是老板的目标态，
本棒兑现的是 UI 形态 + 数据结构，DB 持久化排到后续棒不破当前路径。

---

## 不变量检查 ✅

- `auth.users` 不动 ✅
- userId 用 `getUserId()` ✅ (没新增 localStorage.getItem 直读)
- 不动 `useWeeklyMenu.ts` / `scoreDish` ✅ (Algorithm v65 第 2 棒在做)
- 主色保持橙 #FF5A1F ✅
- 不 fix 无关 TS errors ✅ (HelperSettings.tsx:75 .catch 老错误未触)
- 抽屉收起为默认 ✅ (`advancedOpen=false` 初始, member 卡 `openId=null`)

---

## 真测路径 (老板验证)

1. 无痕窗口打开 `nothinkeats.com/login` → 微信登录
2. `/settings`:
   - 顶部头像区: 应看见**真微信头像** + **真昵称** (不是"你" + userId 短码)
   - 滚下 "我的口味偏好" 卡 → 点开 → 顶部一个"🤖 算法理解到的你"反推 chip 区
   - 点 "想手动调? 点这里 →" → 出现 5 字段 advanced 抽屉
   - 调一个 chip / slider → 立即出现"✓ 已保存" 状态
   - 滚下"家庭成员档案" → 卡片头部应看见 名字 + 关系 chip + 健康目标 chip
   - 点开任一成员卡 → 应看见 12 字段表单 (age/height/weight + 6 个 chip group)
   - "🗑 移除此成员" → 弹 confirm dialog
   - "+ 添加家庭成员" → 新建 + 自动展开抽屉
3. **回滚兼容**: 老用户 (localStorage 已有 `nutri_family_members` 4 字段
   旧 JSON) 进 Settings 也应正常显示 (11 字段 optional, undefined safe)

---

## Vite build ✅

```
✓ 2227 modules transformed.
dist/assets/index-CS3ZkswY.js   1,666.30 kB │ gzip: 516.54 kB
✓ built in 2.10s
```

(同前 chunk-size 警告与本 ticket 无关)
