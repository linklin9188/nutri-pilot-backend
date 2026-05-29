# Playbook — 真菲佣 invite code 绑定真测

> 5/30 真菲佣到位时照这个走。每步标了**老板做** vs **菲佣做** vs **我后台 verify**。

---

## 0. 真测前我会做的 (~10 分钟)

- 我 DB 实查你当前的 invite code 是多少 (你账号 e174164e... 5/28 时 invite 是 `921656` / `195313`,migration 105 dedup 后只剩 1 个,具体我会现查)
- 我准备一个 SQL 一键看绑定状态的小脚本,菲佣绑定后立刻能 verify

---

## 1. 老板这边 — 拿 invite code + 发给菲佣

**做**: 自己手机 / 电脑打开 `nothinkeats.com` 用你账号登录 → 右下角 ⚙️ → Settings

**找**: 滚动到"工人 / 助理"卡片 → "**工人加入码 (6 位)**" 那一行 → 看到一个 6 位橙色数字 (例 `921656`)

**3 种发法 (任选,推荐 1)**:

1. **WhatsApp 一键 (推荐)**: 在 invite code 下方点绿色 "📲 发给 工人姐姐 / Send to helper" 按钮 → WhatsApp 自动打开,文案预填好链接 `nothinkeats.com/login?invite=921656` → 选菲佣联系人发送
   - **优势**: 菲佣点链接直接进 app + 邀请码已预填 + 已选 helper 角色,不用手输
2. **复制 link 兜底**: 点链接按钮旁边 "复制链接",微信 / SMS / 任何方式发给菲佣
3. **手动报码**: 直接告诉菲佣 6 位数字,菲佣手输

---

## 2. 菲佣这边 — 手机端绑定 (3 分钟)

### 路径 A — 点你发的 WhatsApp 链接 (最顺)

1. 菲佣手机收到 WhatsApp 链接 → 点链接
2. 浏览器打开 `nothinkeats.com/login?invite=921656`
3. 看到 Login 页 → "Helper / Worker" tab 已自动选中
4. **点 "Continue as guest / 先看看" 按钮** → 系统创建匿名 helper userId
5. 看到 invite code 输入框 → **6 位已预填好**了 → 点 "Join / Sumali"
6. ✅ 绿色 toast "Linked to employer's household 🎉"
7. 自动跳 /helper 主页 → **应看到你的菜单**

### 路径 B — 菲佣手输 (兜底)

1. 菲佣手机打开 `nothinkeats.com` (或装 PWA)
2. Login 页 → 点 "Helper / Worker" tab → 点 "Continue as guest / 先看看"
3. 进 /helper 主页 → 顶部看到橙色 chip **"Bind to your employer"** → 点
4. 跳到 /helper-settings → "🔗 EMPLOYER BINDING" section → 点 "Enter employer invite code"
5. 展开输入框 → 输 6 位数字 → 点 "Join" 绿色按钮
6. ✅ "Linked to employer's household 🎉"
7. 返回 /helper 主页 → 看到你的菜单

---

## 3. 真测验收清单 (菲佣绑定后立刻测)

**菲佣手机** (菲佣点 4 个页验证不空):
- [ ] `/helper` 主页 → 看到今日 breakfast / lunch / dinner 菜品卡 (英文菜名 + 真菜图)
- [ ] 底部 "Shopping" tab → `/prep` → 看到今日食材清单
- [ ] 底部 "Cook" tab → `/cook` → 看到菜品列表,点一道进 step-by-step
- [ ] 底部 "Settings" tab → 看到 "🔗 EMPLOYER BINDING" 显示绿色 ✅ "Linked"
- [ ] 主页 "COMMUNITY" 区 → 应看到 3 张 Tagalog 卡片 (Maria/Rosa/Liza 等真菲律宾名)

**老板手机** (老板自查绑定真生效):
- [ ] Settings → "工人加入码" 旁边的 "工人名字" 字段应该自动显示菲佣 display_name
- [ ] dev role switch 切菲佣端 → 看到的菜单跟菲佣手机看的一致

**我后台 verify** (你告诉我后我立刻跑):
```sql
-- 实查 household_members 是否真有这一行
SELECT hm.*, h.employer_id, h.invite_code, up.display_name
FROM household_members hm
JOIN households h ON hm.household_id = h.id
LEFT JOIN user_profiles up ON up.id = hm.helper_id
WHERE h.employer_id = '<你的userId前缀如 e174164e>';
```

---

## 4. 可能踩坑 + 我的应对

| 症状 | 真因 | 修法 |
|---|---|---|
| 菲佣输 invite 报 "Code not found" | invite code 输错 / 老板生成的 code 跟我以为的不一致 | 我现场再查 households 表确认真 code |
| 菲佣 ✅ 绑定但 /helper 主页空白 | RLS 拒了 household_members INSERT (Smell 3 历史) | 我跑 DB 验证 INSERT 是否真写进, RLS 已修 (migration 025) 不该再有 |
| 菲佣 ✅ 绑定但雇主 Settings 看不到菲佣名字 | Settings 加载逻辑只查 helper_id IN (...) 没 join, 或缓存 | 我看 Settings 拉 helper 显示路径, 必要时 hot-fix |
| 雇主 dev 切菲佣端看不到菜单 | fallback 把雇主自己 userId 当 employer 自己查 (今天 commit `8f79795` `d1eb96e` 已修), 跟真菲佣场景不冲突 | 已 ship, 测前硬刷 |
| 菲佣点 WhatsApp link 直接报 404 | Railway 没 redeploy 最新 commit | 我看 Railway dashboard 确认 |

---

## 5. 真测后必做

无论真测顺不顺,我都会立刻 sediment 经验:

- **顺**: skill 笔记 "真菲佣 invite 第一次跑通 - 现实数据流" 存 docs/skills/
- **卡**: feedback memory 记真因 + 修法,下次踩同样坑直接复用

---

## 6. 我现在等你

明天菲佣到位,你跟我说 "开始真测",我立刻:
1. 现查你最新 invite code
2. 监控 Railway redeploy 状态
3. 实时 DB query 跟踪每一步 (菲佣 INSERT user_profiles → INSERT household_members → SELECT 雇主 user_weekly_menus)
4. 任何一步卡住我立刻定位真因

不需要你提前准备任何东西,链接和码我现场给你。
