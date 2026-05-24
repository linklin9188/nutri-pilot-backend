-- TICKET-034: Settings §2 嵌入向量基础 — dish + user feature vector 列
-- 20 维构成: cuisine(5) + spice(1) + main_ingredient family(8) + cooking_method(6)
-- 算法: cosine similarity 用户 vector vs dish vector → 营养重排 → 过敏过滤
-- 老板拍板"manual 20 维 不用 Gemini embedding / pgvector" (SPEC §0.3)

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS feature_vector numeric[];

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preference_vector numeric[];

COMMENT ON COLUMN dishes.feature_vector IS '20 维 manual feature vector for cosine-similarity recommendation (cuisine 5 + spice 1 + ingredient family 8 + cooking 6). 预计算 by scripts/compute-dish-feature-vector.ts.';
COMMENT ON COLUMN user_profiles.preference_vector IS 'user 20 维偏好向量, onboarding 3 组图选菜后由 userVectorFromSelectedDishes 写入. 缺失则算法 fallback 到旧 scoreDish 路径 (forward-compat).';
