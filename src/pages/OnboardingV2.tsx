/**
 * OnboardingV2.tsx — TICKET-042 §A (SPEC §0.2 老板拍板)
 *
 * 新 onboarding 流程 (~20 秒, 3 组图 + 2 问)，替代旧 QuickSetup 11 题路径。
 *
 * Step 1 (3 组多选, 每组 4 张, 每组至少 1 张)：
 *   组 1 食材大类 — 红肉 / 白肉 / 海鲜 / 素菜
 *   组 2 口味菜系 — 辣中餐 / 清淡中餐 / 西餐 / 日韩
 *   组 3 烹饪浓淡 — 清蒸鱼 / 红烧肉 / 油炸物 / 凉拌菜
 *   每张图绑一道 dishes 表 "代表菜", 选 → push dish.id 进 selectedDishIds.
 *
 * Step 2 (2 个问)：
 *   忌口 (多选 chip, 含 "无"): 海鲜 / 坚果 / 麸质 / 奶 / 蛋 / 不吃猪 / 牛 / 羊
 *     → 海鲜/坚果/麸质/奶/蛋 写 user_profiles.avoid_tags
 *     → 不吃猪/牛/羊 写 user_profiles.excluded_meats
 *     (spec §0.2 写 allergens, 但 user_profiles 实际 schema 没 allergens 列;
 *      用 avoid_tags + excluded_meats 双列等价覆盖, 算法侧 hard filter 复用)
 *   近期目标 (5 选 1): 减脂 / 增肌 / 家庭 / 学龄增长 / 老人养生
 *     → 写 user_profiles.dietary_goal
 *
 * Step 3 完成 → 算 preference_vector (userVectorFromSelectedDishes) +
 *   UPDATE user_profiles + mark onboarding_v3_done + 跳 /home.
 *
 * 12 道代表菜 dish.id (Algorithm 2 棒已为 924/924 dishes 预计算 feature_vector)：
 *
 *   组 1 食材大类：
 *     红肉   42cfc65a-e8a0-43cf-82b4-9361e124b85d  红烧肉
 *     白肉   4ca15383-429c-4826-847d-381dea7a5d85  宫保鸡丁
 *     海鲜   1f628ef1-fc09-4f9c-97a1-c9f2d60c86d7  椒盐虾
 *     素菜   87d31cc3-94da-4110-b186-b4d8009356a3  蒜香西兰花
 *
 *   组 2 口味菜系：
 *     辣中餐 d94044cf-7d16-4239-a577-8945420aeea4  麻婆豆腐
 *     清淡   a9945a8b-b53e-405f-bb38-c5447d3e5bae  清炒虾仁
 *     西餐   2d8694e7-2ed5-4c8e-b43c-ca2b43f2d8f9  经典肉酱意面
 *     日韩   77f5aae9-2a47-46c1-bc60-0f8cb1288452  日式炸鸡块
 *
 *   组 3 烹饪浓淡：
 *     清蒸鱼 6c71d29c-5a0d-4bef-b4e2-88114878be7c  清蒸鲈鱼
 *     红烧肉 9af7ced4-85d1-4038-aa5b-5a9214e16a25  不油腻红烧肉
 *     油炸物 f68f9dde-9847-432c-b496-1285567187ca  柠檬鸡片
 *     凉拌菜 1a3fead7-6f3c-4e77-b8cc-33eded80214e  凉拌黄瓜
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getUserId, setUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';
import {
  userVectorFromSelectedDishes,
  dishToVector,
  VECTOR_DIM,
} from '../lib/recommendVector';

// ─── 代表菜 catalog ─────────────────────────────────────────────────────
// TICKET-051 P0 i18n — RepDish.label 拆 zh/en/tl 三语言. dish.title_en
// fallback 不在这里做（onboarding 不读 DB 表里的 title_*, 直接走静态）.
// 后续 ticket 如要从 DB 抓 title_tl 再覆盖, 在 fetch image_url 那段 SELECT
// title_zh, title_en, title_zh_hant 并按 lang 映射即可.
interface RepDish {
  /** dishes.id (UUID) */
  id: string;
  /** UI 显示标题 zh（简体）*/
  label: string;
  /** UI 显示标题 en（英文）*/
  labelEn: string;
  /** UI 显示标题 tl（菲律宾语；fallback en）*/
  labelTl: string;
  /** UI 副标题（描述/分类）zh */
  desc?: string;
  /** UI 副标题 en */
  descEn?: string;
  /** UI 副标题 tl */
  descTl?: string;
  /** emoji fallback（image_url 加载失败时显示）*/
  emoji: string;
  /** dishes.image_url（fetch 后填充）*/
  imageUrl?: string;
  /** 维度组归属：1 / 2 / 3 */
  group: 1 | 2 | 3;
  /** 同组排序 */
  order: number;
}

const REP_DISHES: RepDish[] = [
  // 组 1 食材大类
  { id: '42cfc65a-e8a0-43cf-82b4-9361e124b85d', label: '红烧肉',        labelEn: 'Braised Pork Belly',  labelTl: 'Braised Pork Belly',  desc: '🥩 红肉', descEn: '🥩 Red meat',  descTl: '🥩 Pulang karne', emoji: '🥩', group: 1, order: 1 },
  { id: '4ca15383-429c-4826-847d-381dea7a5d85', label: '宫保鸡丁',      labelEn: 'Kung Pao Chicken',    labelTl: 'Kung Pao Manok',      desc: '🐔 白肉', descEn: '🐔 White meat', descTl: '🐔 Puting karne', emoji: '🐔', group: 1, order: 2 },
  { id: '1f628ef1-fc09-4f9c-97a1-c9f2d60c86d7', label: '椒盐虾',        labelEn: 'Salt & Pepper Shrimp', labelTl: 'Hipon sa Asin at Paminta', desc: '🦐 海鲜', descEn: '🦐 Seafood', descTl: '🦐 Pagkaing-dagat', emoji: '🦐', group: 1, order: 3 },
  { id: '87d31cc3-94da-4110-b186-b4d8009356a3', label: '蒜香西兰花',    labelEn: 'Garlic Broccoli',     labelTl: 'Broccoli sa Bawang',  desc: '🥬 素菜', descEn: '🥬 Vegetable', descTl: '🥬 Gulay', emoji: '🥬', group: 1, order: 4 },
  // 组 2 口味菜系
  { id: 'd94044cf-7d16-4239-a577-8945420aeea4', label: '麻婆豆腐',      labelEn: 'Mapo Tofu',           labelTl: 'Mapo Tofu',           desc: '🌶 辣中餐', descEn: '🌶 Spicy Chinese', descTl: '🌶 Maanghang na Tsino', emoji: '🌶', group: 2, order: 1 },
  { id: 'a9945a8b-b53e-405f-bb38-c5447d3e5bae', label: '清炒虾仁',      labelEn: 'Stir-fried Shrimp',   labelTl: 'Ginisang Hipon',      desc: '🍵 清淡中餐', descEn: '🍵 Light Chinese', descTl: '🍵 Magaang Tsino', emoji: '🍵', group: 2, order: 2 },
  { id: '2d8694e7-2ed5-4c8e-b43c-ca2b43f2d8f9', label: '经典肉酱意面',  labelEn: 'Spaghetti Bolognese', labelTl: 'Spaghetti Bolognese', desc: '🍝 西餐', descEn: '🍝 Western', descTl: '🍝 Kanluraning pagkain', emoji: '🍝', group: 2, order: 3 },
  { id: '77f5aae9-2a47-46c1-bc60-0f8cb1288452', label: '日式炸鸡块',    labelEn: 'Japanese Karaage',    labelTl: 'Karaage (Pritong Manok)', desc: '🍱 日韩', descEn: '🍱 Japan/Korea', descTl: '🍱 Hapon/Korea', emoji: '🍱', group: 2, order: 4 },
  // 组 3 烹饪浓淡
  { id: '6c71d29c-5a0d-4bef-b4e2-88114878be7c', label: '清蒸鲈鱼',      labelEn: 'Steamed Sea Bass',    labelTl: 'Pinasingawan na Apahap', desc: '🐟 清蒸', descEn: '🐟 Steamed', descTl: '🐟 Pasingawan', emoji: '🐟', group: 3, order: 1 },
  { id: '9af7ced4-85d1-4038-aa5b-5a9214e16a25', label: '不油腻红烧肉',  labelEn: 'Light Braised Pork',  labelTl: 'Magaang Braised Pork', desc: '🍖 红烧', descEn: '🍖 Red-braised', descTl: '🍖 Pinula', emoji: '🍖', group: 3, order: 2 },
  { id: 'f68f9dde-9847-432c-b496-1285567187ca', label: '柠檬鸡片',      labelEn: 'Lemon Chicken',       labelTl: 'Manok na may Limon',  desc: '🍤 油炸', descEn: '🍤 Fried', descTl: '🍤 Pritong', emoji: '🍤', group: 3, order: 3 },
  { id: '1a3fead7-6f3c-4e77-b8cc-33eded80214e', label: '凉拌黄瓜',      labelEn: 'Smashed Cucumber Salad', labelTl: 'Pipinong Salad',   desc: '🥗 凉拌', descEn: '🥗 Cold dish', descTl: '🥗 Malamig na ulam', emoji: '🥗', group: 3, order: 4 },
];

// GROUP_TITLES 现在按 lang 在组件内取（见 currentGroupTitle）.
const GROUP_TITLES: Record<1 | 2 | 3, { title: { zh: string; en: string; tl: string }; sub: { zh: string; en: string; tl: string }; emoji: string }> = {
  1: { title: { zh: '哪些菜你家爱吃？', en: 'What does your family love?', tl: 'Ano ang gusto ng pamilya mo?' }, sub: { zh: '食材大类 · 多选，至少 1 张', en: 'Ingredients · pick at least 1', tl: 'Sangkap · pumili ng kahit 1' }, emoji: '🍽' },
  2: { title: { zh: '什么风味更对胃口？', en: 'Which flavors suit you?', tl: 'Anong lasa ang gusto mo?' }, sub: { zh: '口味菜系 · 多选，至少 1 张', en: 'Cuisines · pick at least 1', tl: 'Pagluluto · pumili ng kahit 1' }, emoji: '🌶' },
  3: { title: { zh: '偏清淡还是浓郁？', en: 'Light or rich cooking?', tl: 'Magaan o malasa?' }, sub: { zh: '烹饪手法 · 多选，至少 1 张', en: 'Cooking style · pick at least 1', tl: 'Paraan ng pagluluto · pumili ng kahit 1' }, emoji: '🐟' },
};

// ─── 忌口 chip ──────────────────────────────────────────────────────────
interface AvoidOption {
  value: string;
  label: string;
  labelEn: string;
  labelTl: string;
  emoji: string;
  /** kind=meat → 写 excluded_meats; kind=allergen → 写 avoid_tags; kind=none → 单选清空 */
  kind: 'meat' | 'allergen' | 'none';
}

const AVOID_OPTIONS: AvoidOption[] = [
  { value: 'seafood', label: '海鲜', labelEn: 'Seafood',  labelTl: 'Pagkaing-dagat', emoji: '🦐', kind: 'allergen' },
  { value: 'nuts',    label: '坚果', labelEn: 'Nuts',     labelTl: 'Mani',           emoji: '🥜', kind: 'allergen' },
  { value: 'gluten',  label: '麸质', labelEn: 'Gluten',   labelTl: 'Gluten',         emoji: '🌾', kind: 'allergen' },
  { value: 'milk',    label: '奶',   labelEn: 'Dairy',    labelTl: 'Gatas',          emoji: '🥛', kind: 'allergen' },
  { value: 'eggs',    label: '蛋',   labelEn: 'Eggs',     labelTl: 'Itlog',          emoji: '🥚', kind: 'allergen' },
  { value: 'pork',    label: '不吃猪', labelEn: 'No pork', labelTl: 'Walang baboy',  emoji: '🐷', kind: 'meat' },
  { value: 'beef',    label: '不吃牛', labelEn: 'No beef', labelTl: 'Walang baka',   emoji: '🐮', kind: 'meat' },
  { value: 'lamb',    label: '不吃羊', labelEn: 'No lamb', labelTl: 'Walang tupa',   emoji: '🐑', kind: 'meat' },
  { value: 'none',    label: '无',   labelEn: 'None',     labelTl: 'Wala',           emoji: '✓',  kind: 'none' },
];

// ─── 目标 5 选 1 ─────────────────────────────────────────────────────────
interface GoalOption {
  value: string;
  label: string;
  labelEn: string;
  labelTl: string;
  desc: string;
  descEn: string;
  descTl: string;
  emoji: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  { value: 'fat_loss',        label: '减脂',     labelEn: 'Fat loss',      labelTl: 'Pagpapayat',          desc: '低脂低热量', descEn: 'Low fat & calories', descTl: 'Mababang taba',     emoji: '🏃' },
  { value: 'muscle_gain',     label: '增肌',     labelEn: 'Muscle gain',   labelTl: 'Pagpapalaki ng muscle', desc: '高蛋白',     descEn: 'High protein',       descTl: 'Mataas na protina', emoji: '💪' },
  { value: 'general',         label: '家庭',     labelEn: 'Family',        labelTl: 'Pamilya',             desc: '均衡日常',   descEn: 'Balanced everyday',  descTl: 'Balanseng araw-araw', emoji: '🏠' },
  { value: 'child_growth',    label: '学龄增长', labelEn: 'Child growth',  labelTl: 'Paglaki ng bata',     desc: '高钙均衡',   descEn: 'High calcium',       descTl: 'Mataas na calcium', emoji: '🧒' },
  { value: 'elder_wellness',  label: '老人养生', labelEn: 'Elder wellness', labelTl: 'Kalusugan ng matanda', desc: '低盐低油',  descEn: 'Low salt & oil',     descTl: 'Mababang asin/langis', emoji: '👵' },
];

// ─── 主组件 ──────────────────────────────────────────────────────────────
export default function OnboardingV2() {
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  /** step 0=组1选菜, 1=组2选菜, 2=组3选菜, 3=2 问页, 4=完成中 */
  const [step, setStep] = useState<number>(0);

  /** 已选 dish.id（跨 3 组累加，最终去重）*/
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>([]);

  /** 忌口选中集合（含 'none'）*/
  const [avoidSet, setAvoidSet] = useState<string[]>([]);

  /** 目标 5 选 1 */
  const [goal, setGoal] = useState<string>('general');

  /** dish image_url fetch 结果（id → url）*/
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  /** 提交中 loading */
  const [saving, setSaving] = useState<boolean>(false);

  /** 错误提示 */
  const [errorMsg, setErrorMsg] = useState<string>('');

  // ── 启动：fetch 12 道代表菜的 image_url ───────────────────────────────
  useEffect(() => {
    const ids = REP_DISHES.map(d => d.id);
    supabase
      .from('dishes')
      .select('id, image_url')
      .in('id', ids)
      .then(({ data, error }) => {
        if (error) {
          console.warn('[OnboardingV2] fetch image_url failed:', error.message);
          return;
        }
        if (!data) return;
        const map: Record<string, string> = {};
        for (const r of data) {
          if (r.image_url) map[r.id] = r.image_url;
        }
        setImageUrls(map);
      });
  }, []);

  // ── 当前组（仅 step 0/1/2 用）────────────────────────────────────────
  const currentGroup = (step + 1) as 1 | 2 | 3;
  const currentGroupDishes = useMemo(
    () => REP_DISHES.filter(d => d.group === currentGroup).sort((a, b) => a.order - b.order),
    [currentGroup],
  );
  const currentGroupTitle = GROUP_TITLES[currentGroup];
  const currentGroupSelectedCount = useMemo(
    () => currentGroupDishes.filter(d => selectedDishIds.includes(d.id)).length,
    [currentGroupDishes, selectedDishIds],
  );

  // ── toggle 选菜 ───────────────────────────────────────────────────────
  const toggleDish = (id: string) => {
    setSelectedDishIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  // ── toggle 忌口（'none' 互斥）────────────────────────────────────────
  const toggleAvoid = (value: string) => {
    setAvoidSet(prev => {
      if (value === 'none') {
        // 选"无" → 清空其他
        return prev.includes('none') ? [] : ['none'];
      }
      // 选其他 → 移除"无"
      const without = prev.filter(x => x !== 'none');
      return without.includes(value)
        ? without.filter(x => x !== value)
        : [...without, value];
    });
  };

  // ── 下一步（组 1/2/3 流转 + 进入 2 问页）─────────────────────────────
  const goNext = () => {
    setErrorMsg('');
    if (step < 3) {
      // 校验当前组至少 1 张
      if (currentGroupSelectedCount < 1) {
        setErrorMsg(t3(
          'Pick at least 1 dish per group',
          '每组至少选 1 张你家爱吃的',
          'Pumili ng kahit 1 bawat grupo',
        ));
        return;
      }
      setStep(step + 1);
    }
  };

  // ── 提交：算 vector + UPDATE user_profiles + 跳 /home ────────────────
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg('');

    try {
      // 1. ensure userId（按 QuickSetup pattern）
      let uid = getUserId();
      if (!uid) {
        uid = crypto.randomUUID();
        setUserId(uid);
        localStorage.setItem('isLoggedIn', 'true');
      }

      // 2. fetch 选中菜的 feature_vector
      const uniqueIds = Array.from(new Set(selectedDishIds));
      const { data: dishRows, error: fetchErr } = await supabase
        .from('dishes')
        .select('id, feature_vector, cuisine_zh:origin_cuisine, origin_cuisine, main_ingredient, cook_method, spice_level, title_zh')
        .in('id', uniqueIds);

      if (fetchErr) {
        console.warn('[OnboardingV2] fetch feature_vector failed:', fetchErr.message);
      }

      // 3. 收集 feature_vector（DB 缺失则现算 dishToVector fallback）
      const vectors: number[][] = [];
      if (dishRows) {
        for (const row of dishRows) {
          const fv = (row as { feature_vector?: unknown }).feature_vector;
          if (Array.isArray(fv) && fv.length === VECTOR_DIM) {
            vectors.push(fv.map(x => Number(x)));
          } else {
            // 兜底（理论不会触发, Algorithm 2 棒 924/924 已 ship）
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vectors.push(dishToVector(row as any));
          }
        }
      }

      const userVector = userVectorFromSelectedDishes(vectors);

      // 4. 拆 avoidSet → avoid_tags + excluded_meats
      const avoidTags: string[] = [];
      const excludedMeats: string[] = [];
      for (const v of avoidSet) {
        if (v === 'none') continue;
        const opt = AVOID_OPTIONS.find(o => o.value === v);
        if (!opt) continue;
        if (opt.kind === 'meat') excludedMeats.push(v);
        else if (opt.kind === 'allergen') avoidTags.push(v);
      }

      // 5. UPSERT user_profiles（id 是 text 主键, 不是 auth.users FK）
      const profilePayload = {
        id: uid,
        preference_vector: userVector,
        dietary_goal: goal,
        avoid_tags: avoidTags,
        excluded_meats: excludedMeats,
        onboarding_version: 'v3_onboarding_v2',
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[OnboardingV2] upsert profile failed:', upsertErr.message);
        setErrorMsg(t3('Save failed, please retry', '保存失败，请重试', 'Hindi na-save, subukan muli'));
        setSaving(false);
        return;
      }

      // 6. mark onboarding done（RootRedirect guard 用）+ 兼容 v3_done
      localStorage.setItem('onboarding_v3_done', 'true');
      localStorage.setItem('onboarding_v2_done', 'true');
      localStorage.removeItem('needs_v3_onboarding');
      localStorage.removeItem('needs_v2_onboarding');

      // 7. legacy compat keys（下游 reader 复用 QuickSetup pattern）
      localStorage.setItem('userDiet', goal === 'general' ? 'comfort' : goal);
      if (avoidTags.length || excludedMeats.length) {
        localStorage.setItem('userAvoid', [...avoidTags, ...excludedMeats].join(','));
      } else {
        localStorage.setItem('userAvoid', 'none');
      }

      // 8. 触发全局 prefs 变更事件 + 跳 / (RootRedirect 检测 onboarding_v3_done
      //    后 render <Home />; 没单独 /home 路由)
      window.dispatchEvent(new Event('nutri-prefs-changed'));
      navigate('/');
    } catch (e) {
      console.error('[OnboardingV2] finish failed:', e);
      setErrorMsg(t3(
        'Save failed, please check your connection and retry',
        '保存失败，请检查网络后重试',
        'Hindi na-save, suriin ang koneksyon at subukan muli',
      ));
      setSaving(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────
  const totalSteps = 4; // 组1 / 组2 / 组3 / 2问

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: '#0a0a0a' }}>

      {/* 背景渐变 */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.18) 0%, transparent 65%)',
          position: 'absolute', inset: 0,
        }} />
      </div>

      {/* 进度条 */}
      <div className="relative z-10 px-6 pt-14 pb-2">
        <div className="flex items-center gap-2 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: '#FF5A1F' }}
                animate={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }}
                transition={{ duration: 0.4 }} />
            </div>
          ))}
        </div>
        <p className="text-white/30 text-[12px]" style={{ letterSpacing: '0.06em' }}>
          {Math.min(step + 1, totalSteps)} / {totalSteps}
        </p>
      </div>

      {/* 主内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex-1 flex flex-col px-6 pt-6 pb-10 relative z-10">

          {step <= 2 ? (
            // ── Step 1/2/3：选菜组 ────────────────────────────────────
            <>
              <div className="mb-6">
                <span className="text-[40px] leading-none">{currentGroupTitle.emoji}</span>
                <h2 className="mt-3 font-serif font-black text-white leading-tight"
                  style={{ fontSize: 26, letterSpacing: '0.01em' }}>
                  {t3(currentGroupTitle.title.en, currentGroupTitle.title.zh, currentGroupTitle.title.tl)}
                </h2>
                <p className="mt-2 text-white/40 font-light" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                  {t3(currentGroupTitle.sub.en, currentGroupTitle.sub.zh, currentGroupTitle.sub.tl)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 flex-1">
                {currentGroupDishes.map((d, idx) => {
                  const sel = selectedDishIds.includes(d.id);
                  const url = imageUrls[d.id];
                  return (
                    <motion.button
                      key={d.id}
                      onClick={() => toggleDish(d.id)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.30, delay: idx * 0.04, ease: 'easeOut' }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      className={`flex flex-col items-center justify-start text-center p-3 rounded-2xl transition-shadow relative overflow-hidden ${sel ? 'ring-2 ring-[#FF5A1F]' : ''}`}
                      style={sel
                        ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F', boxShadow: '0 0 24px rgba(255,90,31,0.25)', minHeight: 200 }
                        : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', minHeight: 200 }
                      }>
                      {url ? (
                        <img src={url} alt={t3(d.labelEn, d.label, d.labelTl)}
                          className="w-full h-32 object-cover rounded-xl mb-2"
                          onError={(e) => {
                            // 加载失败 → 隐藏 img, 露出 emoji fallback
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }} />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center rounded-xl mb-2"
                          style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <span className="text-[44px] leading-none">{d.emoji}</span>
                        </div>
                      )}
                      <span className="text-white font-semibold mt-1"
                        style={{ fontSize: 14, lineHeight: 1.3 }}>
                        {t3(d.labelEn, d.label, d.labelTl)}
                      </span>
                      {d.desc && (
                        <span className="text-white/45 font-light mt-1"
                          style={{ fontSize: 11, lineHeight: 1.3 }}>
                          {t3(d.descEn ?? d.desc, d.desc, d.descTl ?? d.desc)}
                        </span>
                      )}
                      {sel && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: '#FF5A1F' }}>
                          <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>check</span>
                        </motion.span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {errorMsg && (
                <p className="mt-3 text-center" style={{ color: '#FF9054', fontSize: 13 }}>
                  {errorMsg}
                </p>
              )}

              <button
                onClick={goNext}
                disabled={currentGroupSelectedCount < 1}
                className="mt-5 w-full py-3.5 rounded-2xl font-bold text-white active:scale-95 transition-transform"
                style={{
                  background: currentGroupSelectedCount >= 1 ? '#FF5A1F' : 'rgba(255,255,255,0.10)',
                  color: currentGroupSelectedCount >= 1 ? '#fff' : 'rgba(255,255,255,0.30)',
                  fontSize: 15,
                  letterSpacing: '0.04em',
                }}>
                {currentGroupSelectedCount >= 1
                  ? t3(
                      `${currentGroupSelectedCount} selected · Next →`,
                      `已选 ${currentGroupSelectedCount} 张 · 下一步 →`,
                      `${currentGroupSelectedCount} napili · Sunod →`,
                    )
                  : t3('Pick at least 1', '至少选 1 张', 'Pumili ng kahit 1')}
              </button>
            </>
          ) : (
            // ── Step 4：2 问页 ───────────────────────────────────────
            <>
              <div className="mb-5">
                <span className="text-[40px] leading-none">📝</span>
                <h2 className="mt-3 font-serif font-black text-white leading-tight"
                  style={{ fontSize: 26, letterSpacing: '0.01em' }}>
                  {t3('Last two questions', '最后两题', 'Huling dalawang tanong')}
                </h2>
                <p className="mt-2 text-white/40 font-light" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                  {t3(
                    'Allergies + goal — algorithm uses them for hard filter & nutrition re-rank',
                    '忌口 + 近期目标 — 算法用来做硬过滤和营养重排',
                    'Allergy + layunin — ginagamit ng algorithm para sa filter at nutrisyon',
                  )}
                </p>
              </div>

              {/* 忌口 */}
              <div className="mb-6">
                <p className="text-white font-semibold mb-3" style={{ fontSize: 15 }}>
                  {t3(
                    'Avoid (multi-select, tap "None" if none)',
                    '忌口（多选，没有就选「无」）',
                    'Iwasan (maraming pwede, i-tap ang "Wala" kung wala)',
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {AVOID_OPTIONS.map(opt => {
                    const sel = avoidSet.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleAvoid(opt.value)}
                        className="px-3.5 py-2.5 rounded-full active:scale-95 transition-transform flex items-center gap-1.5"
                        style={sel
                          ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F', fontSize: 13, color: '#fff' }
                          : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)', fontSize: 13, color: 'rgba(255,255,255,0.75)' }
                        }>
                        <span>{opt.emoji}</span>
                        <span>{t3(opt.labelEn, opt.label, opt.labelTl)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 目标 5 选 1 */}
              <div className="mb-6">
                <p className="text-white font-semibold mb-3" style={{ fontSize: 15 }}>
                  {t3('Current goal (single select)', '近期目标（单选）', 'Layunin (isa lang)')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {GOAL_OPTIONS.map(opt => {
                    const sel = goal === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setGoal(opt.value)}
                        className="p-3 rounded-2xl active:scale-95 transition-transform text-left"
                        style={sel
                          ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F' }
                          : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }
                        }>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                          <span className="text-white font-semibold" style={{ fontSize: 14 }}>{t3(opt.labelEn, opt.label, opt.labelTl)}</span>
                        </div>
                        <p className="text-white/45 mt-1" style={{ fontSize: 11 }}>{t3(opt.descEn, opt.desc, opt.descTl)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {errorMsg && (
                <p className="mb-3 text-center" style={{ color: '#FF9054', fontSize: 13 }}>
                  {errorMsg}
                </p>
              )}

              <button
                onClick={finish}
                disabled={saving}
                className="mt-2 w-full py-3.5 rounded-2xl font-bold text-white active:scale-95 transition-transform"
                style={{
                  background: saving ? 'rgba(255,90,31,0.50)' : '#FF5A1F',
                  fontSize: 15,
                  letterSpacing: '0.04em',
                }}>
                {saving
                  ? t3('Saving…', '保存中…', 'Sini-save…')
                  : t3('Done → See this week menu', '完成 → 看本周菜单', 'Tapos → Tingnan ang menu')}
              </button>

              <button
                onClick={() => setStep(2)}
                disabled={saving}
                className="mt-3 w-full py-2.5 rounded-2xl font-light active:scale-95 transition-transform"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.55)',
                }}>
                {t3('← Back to dish selection', '← 返回改菜单', '← Bumalik sa pagpili')}
              </button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
