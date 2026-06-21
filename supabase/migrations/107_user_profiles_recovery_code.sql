-- 107 — 雇主账号"找回码" (TICKET-116, 老板 6/19 拍板 "先上找回码兜底")
--
-- 背景: custom auth, userId 只存 localStorage. 换手机/换浏览器/清缓存 → userId 丢
-- → 看不到原数据 (数据在云端但"认不出是你"). 微信 openid 是唯一稳定锚, 但 136 个号
-- 只 3 个有 + 微信登录未确认稳. 给雇主一个不依赖微信的跨设备找回手段.
--
-- 形态: 雇主设置页显示一串 8 位找回码 (截图保存), 换设备在登录页输码 → 查回 userId
-- → setUserId 数据回来. 字符集去掉易混 0/O/1/I/L. 存规范化大写 8 位, 显示插横线.
--
-- 安全: user_profiles 已 anon-first (ALL USING(true)), 前端直查不降级现有安全水位.
-- 30^8 ≈ 6.5e11 空间, 暴力不现实. unique 防撞 (多个 NULL 不冲突, partial index).

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS recovery_code text;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_recovery_code_uniq
  ON user_profiles (recovery_code)
  WHERE recovery_code IS NOT NULL;
