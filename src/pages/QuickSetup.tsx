import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import { syncProfileToDB } from "../lib/profileSync";
import ImageGrid, { ImageGridOption } from "../components/ImageGrid";
import NumberStepper from "../components/NumberStepper";

// TICKET-005 v3 — 图片驱动 onboarding（11 题，条件渲染实际 8-9 步）。
// 文案铁律：所有标题都是问句 + "怎么吃 / 喜欢" 视角，绕过用户自我描述偏差。
// 收集 9 个 axis（Algorithm 073 axis 32-40），不动 schema，全 localStorage。

type Condition = 'has_red_or_white' | 'has_beef' | 'has_chicken' | 'has_seafood_class';

interface QuestionV3 {
  id: string;
  emoji: string;
  question: string;
  sub: string;
  multi: boolean;
  minSelect?: number;
  maxSelect?: number;  // UI 015 §C — 上限 (Q5 wellness 限 3 个)
  cols?: 2 | 3;
  chips?: boolean;
  condition?: Condition;
  options: ImageGridOption[];
}

const QUESTIONS_V3: QuestionV3[] = [
  // Q0 — 家庭组合：UI 015 §A: 4 选项扩展为 6 选项 (含 custom 自定义双 stepper)。
  // 新 img path q0_solo_w_kid / q0_couple_1kid / q0_couple_2kids / q0_couple_3kids /
  // q0_three_gen / q0_custom 由 Database 012 灌入；ship 前用 emoji 占位（ImageGrid
  // 自动 fallback），ship 后 CEO 把 img 字段加回（5 min swap）。
  {
    id: 'table_style',
    emoji: '🍽',
    question: '你家是几口人？',
    sub: '挑最像你家的组合 — 我顺手算人数 / 餐量 / 复杂度。最后一项可自定义。',
    multi: false,
    cols: 2,
    options: [
      // TODO(database-012): swap img: '/onboarding/q0_*.jpg' 回字段（6 张图 ship 后）
      { value: 'solo_w_kid',   label: '1 大 1 小',     desc: '单亲家庭',  emoji: '👤👶' },
      { value: 'couple_1kid',  label: '2 大 1 小',     desc: '三口之家',  emoji: '👫👶' },
      { value: 'couple_2kids', label: '2 大 2 小',     desc: '四口之家',  emoji: '👫👶👶' },
      { value: 'couple_3kids', label: '2 大 3 小',     desc: '多孩家庭',  emoji: '👫👶👶👶' },
      { value: 'three_gen',    label: '4 大 2 小',     desc: '三代同堂',  emoji: '👴👵👶👶' },
      { value: 'custom',       label: '自定义 N 大 M 小', desc: '点开调',  emoji: '✏️' },
    ],
  },

  // Q1 — 蛋白大类（多选 ≥1）
  {
    id: 'protein_main_class',
    emoji: '🥩',
    question: '平时你家更喜欢吃哪些类？',
    sub: '可多选，至少 1 个。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'red_meat',   label: '红肉拼盘', desc: '牛 · 羊 · 猪',     img: '/onboarding/q1_beef.jpg' },
      { value: 'white_meat', label: '白肉拼盘', desc: '鸡 · 鸭',          img: '/onboarding/q1_chicken.jpg' },
      { value: 'seafood',    label: '海鲜拼盘', desc: '虾蟹 · 鱼 · 贝',   img: '/onboarding/q1_seafood.jpg' },
      { value: 'veggie',     label: '素食拼盘', desc: '豆腐 · 蔬菜',      img: '/onboarding/q1_veg.jpg' },
      { value: 'other',      label: '✏️ 其他',  desc: '自填',             emoji: '✏️' },
    ],
  },

  // Q2 — 主食偏好（多选 ≥1）
  {
    id: 'staple_pref',
    emoji: '🍚',
    question: '你更喜欢吃哪种主食？',
    sub: '可多选。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'rice',   label: '米饭',     img: '/onboarding/q2_rice.jpg' },
      { value: 'noodle', label: '面条馒头', img: '/onboarding/q2_noodle.jpg' },
      { value: 'congee', label: '粥',       img: '/onboarding/q2_porridge.jpg' },
      { value: 'grain',  label: '杂粮',     desc: '红薯 · 玉米 · 燕麦', img: '/onboarding/q2_grain.jpg' },
      { value: 'other',  label: '✏️ 其他',  desc: '自填',                emoji: '✏️' },
    ],
  },

  // Q3 — 肉类（仅 Q1 含红/白显示）
  {
    id: 'protein_pref',
    emoji: '🐮',
    question: '平时你更喜欢吃哪些肉？',
    sub: '可多选，至少 1 个。',
    multi: true,
    minSelect: 1,
    condition: 'has_red_or_white',
    cols: 3,
    options: [
      { value: 'pork',    label: '猪', img: '/onboarding/q1_pork.jpg' },
      { value: 'chicken', label: '鸡', img: '/onboarding/q1_chicken.jpg' },
      { value: 'duck',    label: '鸭', img: '/onboarding/q1_duck.jpg' },
      { value: 'lamb',    label: '羊', img: '/onboarding/q1_lamb.jpg' },
      { value: 'beef',    label: '牛', img: '/onboarding/q1_beef.jpg' },
      { value: 'other',   label: '✏️ 其他', emoji: '✏️' },
    ],
  },

  // Q4 — 牛肉做法（仅 Q3 含牛显示）
  {
    id: 'beef_style',
    emoji: '🥩',
    question: '牛肉你更喜欢怎么吃？',
    sub: '可多选 — 不同做法对应不同菜系。',
    multi: true,
    condition: 'has_beef',
    cols: 2,
    options: [
      { value: 'spicy_stirfry', label: '小炒黄牛肉', desc: '湘 · 川辣',     img: '/onboarding/q4_beef_stir.jpg' },
      { value: 'steak',         label: '煎牛排',     desc: '西 · 北',       img: '/onboarding/q4_beef_steak.jpg' },
      { value: 'stewed',        label: '炖牛腩',     desc: '粤 · 港清',     img: '/onboarding/q4_beef_stew.jpg' },
      { value: 'braised',       label: '红烧牛肉',   desc: '江浙 · 北家常', img: '/onboarding/q4_beef_braised.jpg' },
      { value: 'other',         label: '✏️ 其他',     desc: '自填',          emoji: '✏️' },
    ],
  },

  // Q5 — 健康目标（UI 015 §C 新增，Q4 后插入，原 Q5/Q6/... 序号视觉后移）
  // 多选可空，最多 3 个。Algorithm 016 detectChannels 用 wellness_goals 数据驱动
  // 💪 weekly_补 channel（备孕→叶酸蛋白；增肌→高蛋白；控糖→is_low_sugar；…）。
  // 8 项 emoji chip 风格（与 strict_avoid 同 chip 路径），保持视觉一致。
  {
    id: 'wellness_goals',
    emoji: '💪',
    question: '有什么是身体特别想补的吗？',
    sub: '可不选；最多选 3 个。',
    multi: true,
    minSelect: 0,
    maxSelect: 3,
    chips: true,
    cols: 2,
    options: [
      { value: 'prenatal',    emoji: '🤰', label: '备孕',     desc: '叶酸 + 优质蛋白' },
      { value: 'lactation',   emoji: '👶', label: '哺乳',     desc: '补钙 + 蛋白质' },
      { value: 'muscle_gain', emoji: '💪', label: '增肌',     desc: '高蛋白' },
      { value: 'fat_loss',    emoji: '🥗', label: '减脂',     desc: '低油 + 高纤' },
      { value: 'low_sugar',   emoji: '🩸', label: '控糖',     desc: '糖尿病 / 餐后稳' },
      { value: 'low_sodium',  emoji: '🧂', label: '控盐',     desc: '高血压' },
      { value: 'low_purine',  emoji: '🦴', label: '控嘌呤',   desc: '痛风 / 高尿酸' },
      { value: 'skip',        emoji: '⚪', label: '都行',     desc: '没特别需求' },
    ],
  },

  // Q6 — 鸡肉做法（仅 Q3 含鸡显示）
  {
    id: 'chicken_style',
    emoji: '🍗',
    question: '鸡肉你更喜欢怎么吃？',
    sub: '可多选。',
    multi: true,
    condition: 'has_chicken',
    cols: 2,
    options: [
      { value: 'poached',        label: '白切鸡', desc: '粤式',     img: '/onboarding/q5_chicken_white.jpg' },
      { value: 'spicy_diced',    label: '辣子鸡', desc: '川式',     img: '/onboarding/q5_chicken_spicy.jpg' },
      { value: 'three_cup',      label: '三杯鸡', desc: '台式',     img: '/onboarding/q5_chicken_threecup.jpg' },
      { value: 'yellow_braised', label: '黄焖鸡', desc: '北 · 江浙', img: '/onboarding/q5_chicken_braised.jpg' },
      { value: 'other',          label: '✏️ 其他', desc: '自填',     emoji: '✏️' },
    ],
  },

  // Q6 — 海鲜做法（仅 Q1 含海鲜显示）
  {
    id: 'seafood_style',
    emoji: '🦐',
    question: '海鲜你更喜欢怎么做？',
    sub: '可多选。',
    multi: true,
    condition: 'has_seafood_class',
    cols: 2,
    options: [
      { value: 'steamed',  label: '清蒸',     img: '/onboarding/q6_seafood_steam.jpg' },
      { value: 'braised',  label: '红烧',     img: '/onboarding/q6_seafood_braise.jpg' },
      { value: 'salted',   label: '椒盐',     img: '/onboarding/q6_seafood_salt.jpg' },
      { value: 'blanched', label: '白灼',     img: '/onboarding/q6_seafood_boil.jpg' },
      { value: 'other',    label: '✏️ 其他',   desc: '自填', emoji: '✏️' },
    ],
  },

  // Q7 — 蔬菜做法（多选 ≥1）
  {
    id: 'veggie_method',
    emoji: '🥬',
    question: '蔬菜你更喜欢怎么做？',
    sub: '可多选。',
    multi: true,
    minSelect: 1,
    cols: 2,
    options: [
      { value: 'stirfry',   label: '清炒',     img: '/onboarding/q7_veg_stir.jpg' },
      { value: 'dry_fried', label: '干煸',     img: '/onboarding/q7_veg_dry.jpg' },
      { value: 'cold',      label: '凉拌',     img: '/onboarding/q7_veg_cold.jpg' },
      { value: 'soup',      label: '煲汤',     img: '/onboarding/q7_veg_soup.jpg' },
      { value: 'other',     label: '✏️ 其他',   desc: '自填', emoji: '✏️' },
    ],
  },

  // Q8 — 浓淡（单选）
  {
    id: 'oil_level',
    emoji: '🥄',
    question: '你更喜欢清淡还是浓郁？',
    sub: '我按这个调味重轻。',
    multi: false,
    cols: 2,
    options: [
      { value: 'rich',   label: '浓郁',     desc: '重油红烧肉',  img: '/onboarding/q8_oil_heavy.jpg' },
      { value: 'medium', label: '中等',     desc: '日常家常',    img: '/onboarding/q8_oil_normal.jpg' },
      { value: 'light',  label: '极清',     desc: '白灼 · 清蒸', img: '/onboarding/q8_oil_light.jpg' },
      { value: 'other',  label: '✏️ 其他',   desc: '自填',        emoji: '✏️' },
    ],
  },

  // Q9 — 早餐风格（独立 axis，单选）
  {
    id: 'breakfast_cuisine',
    emoji: '🥯',
    question: '早餐你更喜欢吃什么？',
    sub: '早餐口味跟午晚常常不一样 — HK 妈妈早西午晚中很常见。',
    multi: false,
    cols: 2,
    options: [
      { value: 'chinese', label: '中式',     desc: '包子 · 粥 · 油条 · 豆浆', img: '/onboarding/q9_breakfast_chinese.jpg' },
      { value: 'western', label: '西式',     desc: '三明治 · 牛奶 · 麦片',    img: '/onboarding/q9_breakfast_western.jpg' },
      { value: 'hk',      label: '港式',     desc: '菠萝包 · 奶茶 · 多士',    img: '/onboarding/q9_breakfast_hk.jpg' },
      { value: 'simple',  label: '简单',     desc: '鸡蛋 · 燕麦',             img: '/onboarding/q9_breakfast_simple.jpg' },
      { value: 'other',   label: '✏️ 其他',   desc: '自填',                    emoji: '✏️' },
    ],
  },

  // Q10 — 完全不能吃（chips 多选可空，14 chips：海鲜系 + 8 大食物过敏原 +
  // 宗教文化 + 个人不喜欢 + 其他自填）。'other' chip 选中后在 chip 网格下方
  // 显示 input，commit 时把 'other' 转写成 'other:<用户文本>'。
  {
    id: 'strict_avoid',
    emoji: '🚫',
    question: '有什么是完全不能吃的吗？',
    sub: '可空可多选（真过敏 / 宗教 / 不喜欢）。',
    multi: true,
    minSelect: 0,
    chips: true,
    cols: 2,
    options: [
      // 海鲜系
      { value: 'seafood',       label: '海鲜过敏（虾蟹贝）',          emoji: '🦐' },
      { value: 'fish',          label: '鱼过敏',                      emoji: '🐟' },
      // 8 大食物过敏原
      { value: 'dairy',         label: '牛奶/乳制品过敏',             emoji: '🥛' },
      { value: 'eggs',          label: '鸡蛋过敏',                    emoji: '🥚' },
      { value: 'gluten',        label: '麸质过敏（小麦大麦）',        emoji: '🌾' },
      { value: 'soy',           label: '大豆过敏',                    emoji: '🫘' },
      { value: 'tree_nuts',     label: '树坚果过敏（杏仁核桃腰果）',  emoji: '🌰' },
      { value: 'peanut',        label: '花生过敏',                    emoji: '🥜' },
      // 宗教 / 文化
      { value: 'pork_religion', label: '宗教不吃猪',                  emoji: '🚫' },
      { value: 'no_beef_lamb',  label: '不吃牛羊',                    emoji: '🐄' },
      { value: 'vegetarian',    label: '严格素食',                    emoji: '🥦' },
      // 个人不喜欢
      { value: 'cilantro',      label: '香菜',                        emoji: '🌿' },
      { value: 'innards',       label: '内脏',                        emoji: '🫀' },
      // 兜底自填
      { value: 'other',         label: '其他（自填）',                emoji: '➕' },
    ],
  },
];

// Q0 家庭组合 → 人数 / 复杂度 解析表。
// UI 014: 6 → 4 收敛 (solo/couple/family/gather)。
// UI 015 §A: 4 → 6 重写以家庭组合为 axis (solo_w_kid / couple_1kid / couple_2kids /
// couple_3kids / three_gen / custom)。cuisine 维度仍由 Q9 + Q1 + Q8 推断，这里为 null。
// custom 走特殊路径：adults / kids 从 state.customAdults / customKids 读，不查表。
const TABLE_STYLE_MAP: Record<string, { adults: number; kids: number; elders: number; cuisine: string | null; complexity: string }> = {
  solo_w_kid:   { adults: 1, kids: 1, elders: 0, cuisine: null, complexity: 'simple'   },
  couple_1kid:  { adults: 2, kids: 1, elders: 0, cuisine: null, complexity: 'standard' },
  couple_2kids: { adults: 2, kids: 2, elders: 0, cuisine: null, complexity: 'standard' },
  couple_3kids: { adults: 2, kids: 3, elders: 0, cuisine: null, complexity: 'rich'     },
  three_gen:    { adults: 4, kids: 2, elders: 2, cuisine: null, complexity: 'rich'     },
  // custom 在 finish() 里跳过查表
};

// dietary_goal fallback — v3 没有显式 goal 题，统一 'maintain'。Algorithm
// 通过 9 个新 axis 推断个性化，不再依赖 goal 单值列做核心区分。
function deriveDietaryGoal(_answers: Record<string, any>): string | null {
  return 'maintain';
}

// taste_pref fallback — 从 oil_level 推。light→light, rich→null (default), medium→null。
function deriveTastePref(answers: Record<string, any>): string | null {
  if (answers.oil_level === 'light') return 'light';
  return null;
}

function shouldShow(q: QuestionV3, answers: Record<string, any>): boolean {
  if (!q.condition) return true;
  const pmc = (answers.protein_main_class ?? []) as string[];
  const pp  = (answers.protein_pref ?? []) as string[];
  if (q.condition === 'has_red_or_white')  return pmc.includes('red_meat') || pmc.includes('white_meat');
  if (q.condition === 'has_beef')          return pp.includes('beef');
  if (q.condition === 'has_chicken')       return pp.includes('chicken');
  if (q.condition === 'has_seafood_class') return pmc.includes('seafood');
  return true;
}

async function persistProfileToDb(answers: Record<string, any>): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  const dietary_goal     = deriveDietaryGoal(answers);
  const taste_pref       = deriveTastePref(answers);
  const tableStyle       = answers.table_style as string | undefined;
  const hometown_cuisine = (tableStyle && TABLE_STYLE_MAP[tableStyle]?.cuisine) ?? null;
  // avoid_tags — TICKET-006 §C：user_profiles.avoid_tags 是 text[]（v2 schema），
  // 直接写 strict_avoid 数组，不再做 enum 白名单过滤。新 axis（fish/eggs/gluten/
  // soy/tree_nuts/pork_religion/no_beef_lamb/vegetarian/other:*）由 Algorithm 006
  // 后续解析。
  const avoid_tags = (answers.strict_avoid ?? []) as string[];
  await supabase.from('user_profiles').upsert(
    {
      id:               userId,
      dietary_goal,
      taste_pref,
      hometown_cuisine,
      avoid_tags,
      updated_at:       new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
}

export default function QuickSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [multiSel, setMultiSel] = useState<string[]>([]);
  // Q10 "其他自填" 文本。仅在 strict_avoid 题 + multiSel.includes('other') 时
  // 用到；commit 时把 'other' 转写为 'other:<text>' 推入 strict_avoid 数组。
  const [otherText, setOtherText] = useState('');
  // UI 015 §A — Q0 'custom' 家庭组合双 stepper（仅 table_style === 'custom' 显示）。
  const [customAdults, setCustomAdults] = useState(2);
  const [customKids, setCustomKids] = useState(0);

  // visibleIndices 根据当前 answers 动态计算 — 比如 Q1 没选海鲜，Q6 不会出现。
  // step 索引是 QUESTIONS_V3 绝对 index，currentVisiblePos 走 visible 序（已答过 / 跳过的题数）。
  // UI 014 §D fix: totalVisible 固定为 QUESTIONS_V3.length，不再 = visibleIndices.length。
  // 之前：Q1 选了红肉触发 Q3 显示 → 分母从 7 跳到 8 → 用户看到 "1/7" 然后突然 "3/8"，体感算法
  // 在偷题。现在分母恒为 11，分子按 visible 序递增（单调），即使有 conditional 题被跳过也只是
  // 让分子最终停在 7/11 ~ 11/11 之间——比"分母跳"友好。
  const visibleIndices = QUESTIONS_V3
    .map((_, i) => (shouldShow(QUESTIONS_V3[i], answers) ? i : -1))
    .filter(i => i !== -1);
  const totalVisible = QUESTIONS_V3.length;
  const currentVisiblePos = Math.max(0, visibleIndices.indexOf(step));

  const q = QUESTIONS_V3[step];

  const goToNext = (latestAnswers: Record<string, any>) => {
    // Recompute visible list with latest answers — Q1/Q3 多选可能新增或删除
    // 后续条件题。
    const fresh = QUESTIONS_V3
      .map((_, i) => (shouldShow(QUESTIONS_V3[i], latestAnswers) ? i : -1))
      .filter(i => i !== -1);
    const pos = fresh.indexOf(step);
    if (pos < 0 || pos === fresh.length - 1) {
      finish(latestAnswers);
      return;
    }
    setStep(fresh[pos + 1]);
    setMultiSel([]);
    setOtherText('');
  };

  const handleSingle = (id: string) => {
    const next = { ...answers, [q.id]: id };
    setAnswers(next);
    // UI 015 §A — Q0 'custom' 不 auto-advance：等用户调好 stepper 再点"下一步 →"。
    if (q.id === 'table_style' && id === 'custom') return;
    // UI 015 §B — 任何单选题选 'other' 也不 auto-advance：等用户输入自填文本再点"下一步 →"。
    if (id === 'other') return;
    setTimeout(() => goToNext(next), 320);
  };

  const commitMulti = (sel: string[]) => {
    let finalSel = sel;
    // UI 015 §B — 任意多选题选了 'other'：把 'other' chip 转写为 'other:<用户输入>'，
    // 空文本则丢弃 chip。原 Q10 strict_avoid 的专属逻辑泛化到 Q1-Q7 所有多选题。
    if (sel.includes('other')) {
      const trimmed = otherText.trim();
      finalSel = sel.filter(x => x !== 'other');
      if (trimmed) finalSel.push(`other:${trimmed}`);
    }
    const next = { ...answers, [q.id]: finalSel };
    setAnswers(next);
    setMultiSel([]);
    setOtherText('');
    goToNext(next);
  };

  const toggleMulti = (id: string) => {
    setMultiSel(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      // UI 015 §C — maxSelect 上限保护（Q5 wellness 限 3 个）
      if (q.maxSelect && prev.length >= q.maxSelect) return prev;
      return [...prev, id];
    });
  };

  // Debounced auto-advance (1.8s after last tap) for multi-select.
  // minSelect>0 时必须达到才允许 debounce（minSelect:0 的 Q10 也走 debounce
  // 但首选时间窗会被 commit timer 走 — 如果用户什么都不选，下方"完成 →" 链接
  // 是出口）。
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.multi) return;
    if (multiSel.length === 0) return;
    const minSel = q.minSelect ?? 1;
    if (multiSel.length < minSel) return;
    // TICKET-006 + UI 015 §B: 用户选了 'other'（其他自填）→ 必须等用户输入 + 显式
    // 点"完成 →"，否则 1.8s debounce 会提前把 'other' commit 成空（trimmed=''→丢弃）。
    // 原 strict_avoid 专属泛化到任意 multi 题。
    if (multiSel.includes('other')) return;
    debounceRef.current = setTimeout(() => commitMulti(multiSel), 1800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiSel, step]);

  const finish = (finalAnswers: Record<string, any>) => {
    const prefs = { ...finalAnswers, setupAt: Date.now() };

    // Legacy quickPrefs — downstream useWeeklyMenu / userPrefs.ts 仍读这个 key。
    localStorage.setItem('quickPrefs', JSON.stringify(prefs));

    // ── v3 axis localStorage（Algorithm 073 axis 32-40 + UI 015 §C 加 wellness_goals）─
    const v3Axes: Array<[string, any]> = [
      ['table_style',         finalAnswers.table_style],
      ['protein_main_class',  finalAnswers.protein_main_class],
      ['staple_pref',         finalAnswers.staple_pref],
      ['protein_pref',        finalAnswers.protein_pref],
      ['beef_style',          finalAnswers.beef_style],
      ['wellness_goals',      finalAnswers.wellness_goals],
      ['chicken_style',       finalAnswers.chicken_style],
      ['seafood_style',       finalAnswers.seafood_style],
      ['veggie_method',       finalAnswers.veggie_method],
      ['oil_level',           finalAnswers.oil_level],
      ['breakfast_cuisine',   finalAnswers.breakfast_cuisine],
    ];
    v3Axes.forEach(([k, v]) => {
      if (v === undefined) return;
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });

    // UI 015 §B — 全题 'other:<text>' 拆解：从单选 string 或多选 array 中提取自填
    // 文本，存到独立 key `${axis}_custom_text`，让 Algorithm 端 prefScores 可作为
    // freeform tag 模糊匹配 dish.tags / dish.title。空文本 → removeItem。
    v3Axes.forEach(([k, v]) => {
      const ck = `${k}_custom_text`;
      let customText = '';
      if (typeof v === 'string' && v.startsWith('other:')) {
        customText = v.slice('other:'.length);
      } else if (Array.isArray(v)) {
        const entry = v.find(x => typeof x === 'string' && x.startsWith('other:'));
        if (entry) customText = entry.slice('other:'.length);
      }
      if (customText) localStorage.setItem(ck, customText);
      else localStorage.removeItem(ck);
    });

    // ── Q0 table_style → 派生 household composition ──────────────────
    // UI 015 §A: 'custom' 走 state.customAdults / customKids；其他 5 项查表。
    // 'family' fallback 保留以 backward-compat（旧 quickPrefs 可能仍存 'family' 值）。
    const tableStyle = (finalAnswers.table_style as string) ?? 'couple_2kids';
    let resolvedAdults: number;
    let resolvedKids: number;
    let resolvedElders: number;
    if (tableStyle === 'custom') {
      resolvedAdults = customAdults;
      resolvedKids   = customKids;
      resolvedElders = 0;
    } else {
      const tsMap = TABLE_STYLE_MAP[tableStyle] ?? TABLE_STYLE_MAP.couple_2kids;
      resolvedAdults = tsMap.adults;
      resolvedKids   = tsMap.kids;
      resolvedElders = tsMap.elders;
    }
    localStorage.setItem('nutri_adults', String(resolvedAdults));
    localStorage.setItem('nutri_kids',   String(resolvedKids));
    localStorage.setItem('nutri_family_pattern', tableStyle);
    const familyComp = {
      adults: resolvedAdults,
      elders: { count: resolvedElders, conditions: [] as string[] },
      kids:   Array.from({ length: resolvedKids }, () => ({ age: '7-12' })),
    };
    localStorage.setItem('family_composition', JSON.stringify(familyComp));

    // ── Legacy compat keys（下游 readers expect these） ──────────────
    const oilLevel  = finalAnswers.oil_level as string | undefined;
    const tastePref = deriveTastePref(finalAnswers);
    localStorage.setItem('userTaste', tastePref === 'light' ? 'light' : 'default');
    localStorage.setItem('userDiet',  'comfort');  // v3 没显式 goal 题
    localStorage.setItem('userSpice', oilLevel === 'rich' ? 'medium' : 'mild');
    // TICKET-006: strict_avoid 数组直接写入 localStorage（含 'other:<text>' 形式），
    // 同时把 other 文本拆出存独立 key 供 UI 回填 / 调试。
    const strictAvoidArr = (finalAnswers.strict_avoid ?? []) as string[];
    localStorage.setItem('strict_avoid', JSON.stringify(strictAvoidArr));
    const otherEntry = strictAvoidArr.find(x => x.startsWith('other:'));
    if (otherEntry) {
      localStorage.setItem('strict_avoid_other_text', otherEntry.slice('other:'.length));
    } else {
      localStorage.removeItem('strict_avoid_other_text');
    }
    localStorage.setItem('userAvoid', strictAvoidArr.length ? strictAvoidArr.join(',') : 'none');

    // 匿名 userId
    if (!localStorage.getItem('isLoggedIn')) {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userId', crypto.randomUUID());
    }
    if (!localStorage.getItem('nutri_user_id')) {
      const uid = localStorage.getItem('userId');
      if (uid) localStorage.setItem('nutri_user_id', uid);
    }

    // upsert user_profiles + 全局同步（fire-and-forget）
    persistProfileToDb(finalAnswers).catch(() => {/* offline-tolerant */});
    syncProfileToDB(getUserId()).catch(() => {/* offline-tolerant */});

    // mark v3 done + 清所有升级标记（v3 是 v2 的超集，v3 done 隐含 v2 done）
    localStorage.setItem('onboarding_v3_done', 'true');
    localStorage.setItem('onboarding_v2_done', 'true');
    localStorage.removeItem('needs_v3_onboarding');
    localStorage.removeItem('needs_v2_onboarding');

    window.dispatchEvent(new Event('nutri-prefs-changed'));
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: '#0a0a0a' }}>

      {/* Background gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.18) 0%, transparent 65%)',
          position: 'absolute', inset: 0,
        }} />
      </div>

      {/* TICKET-005 §E — v3 upgrade banner（needs_v3_onboarding 标记由 App.tsx
          RootRedirect 在检测到旧 quickPrefs 且没 onboarding_v3_done 时写入；
          QuickSetup.finish() 完工后清除）。 */}
      {localStorage.getItem('needs_v3_onboarding') === 'true' && (
        <div className="relative z-10 px-6 pt-14 pb-2">
          <div className="rounded-r p-4"
            style={{ background: 'rgba(255,90,31,0.10)', borderLeft: '4px solid #FF9054' }}>
            <p className="font-bold text-[#FF9054]" style={{ fontSize: 14 }}>🎨 升级了！我们用图片代替文字</p>
            <p className="mt-1 text-white/65 font-light" style={{ fontSize: 12, lineHeight: 1.5 }}>
              请用 3 分钟看图选你喜欢的 — 比读字快 10 倍，让推荐更懂你。
            </p>
          </div>
        </div>
      )}

      {/* Progress bar — UI 014 §D: 固定 11 段 (QUESTIONS_V3.length)，不再因
          conditional 题动态增减导致 dot 数跳。currentVisiblePos 跟分母锚定。 */}
      <div className="relative z-10 px-6 pt-14 pb-2">
        <div className="flex items-center gap-2 mb-2">
          {QUESTIONS_V3.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: '#FF5A1F' }}
                animate={{ width: i < currentVisiblePos ? '100%' : i === currentVisiblePos ? '50%' : '0%' }}
                transition={{ duration: 0.4 }} />
            </div>
          ))}
        </div>
        <p className="text-white/30 text-[12px]" style={{ letterSpacing: '0.06em' }}>
          {currentVisiblePos + 1} / {totalVisible}
        </p>
      </div>

      {/* Question body */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex-1 flex flex-col px-6 pt-6 pb-10 relative z-10">

          <div className="mb-6">
            <span className="text-[40px] leading-none">{q.emoji}</span>
            <h2 className="mt-3 font-serif font-black text-white leading-tight"
              style={{ fontSize: 26, letterSpacing: '0.01em' }}>
              {q.question}
            </h2>
            <p className="mt-2 text-white/40 font-light" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
              {q.sub}
            </p>
          </div>

          {q.chips ? (
            // Q10 — chips 风格（strict_avoid 更紧凑 + other 自填 input）
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {q.options.map(opt => {
                  const sel = multiSel.includes(opt.value);
                  return (
                    <button key={opt.value} onClick={() => toggleMulti(opt.value)}
                      className="px-4 py-2.5 rounded-full active:scale-95 transition-transform flex items-center gap-2"
                      style={sel
                        ? { background: 'rgba(255,90,31,0.20)', border: '1.5px solid #FF5A1F', fontSize: 13, color: '#fff' }
                        : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)', fontSize: 13, color: 'rgba(255,255,255,0.75)' }
                      }>
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                      {opt.desc && <span style={{ opacity: 0.55, fontSize: 11 }}>· {opt.desc}</span>}
                    </button>
                  );
                })}
              </div>
              {q.id === 'strict_avoid' && multiSel.includes('other') && (
                <div className="mt-4">
                  <input
                    type="text"
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="请输入其他过敏原（如：芒果 / 猕猴桃）"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 focus:outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,90,31,0.4)',
                      fontSize: 14,
                    }}
                  />
                  <p className="mt-2 text-white/35 font-light" style={{ fontSize: 11 }}>
                    输完后点下方"完成 →"
                  </p>
                </div>
              )}
            </div>
          ) : q.multi ? (
            <>
              <ImageGrid options={q.options} multi selected={multiSel} onToggle={toggleMulti} cols={q.cols} />
              {/* UI 015 §B — 多选 'other' input：multiSel 含 'other' 时显示文本框，
                  commit 时由 commitMulti 把 'other' 转写为 'other:<text>'。 */}
              {multiSel.includes('other') && (
                <div className="mt-4">
                  <input type="text" value={otherText} maxLength={30}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="自填（最多 30 字）"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,90,31,0.4)', fontSize: 14 }} />
                  <p className="mt-2 text-white/35 font-light" style={{ fontSize: 11 }}>
                    输完后点下方"完成 →"，或留空跳过
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <ImageGrid options={q.options} multi={false}
                selected={answers[q.id] ? [answers[q.id]] : []}
                onToggle={handleSingle} cols={q.cols} />
              {/* UI 015 §A — Q0 'custom' 双 stepper：选中 custom 后展开调 N 大 M 小 */}
              {q.id === 'table_style' && answers.table_style === 'custom' && (
                <div className="mt-5">
                  <div className="flex gap-3">
                    <NumberStepper label="大人" value={customAdults} onChange={setCustomAdults} min={1} max={10} />
                    <NumberStepper label="孩子" value={customKids}   onChange={setCustomKids}   min={0} max={6} />
                  </div>
                  <button onClick={() => goToNext(answers)}
                    className="mt-4 w-full py-3 rounded-2xl font-bold text-white"
                    style={{ background: '#FF5A1F', fontSize: 15, letterSpacing: '0.04em' }}>
                    {customAdults} 大 {customKids} 小 · 下一步 →
                  </button>
                </div>
              )}
              {/* UI 015 §B — 单选 'other' input + 下一步：仅当选中 'other' 时显示。
                  commit 时把 answers[q.id] 从 'other' 替换为 'other:<text>'，空 → 留 'other'。 */}
              {q.id !== 'table_style' && answers[q.id] === 'other' && (
                <div className="mt-4">
                  <input type="text" value={otherText} maxLength={30}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="自填（最多 30 字）"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,90,31,0.4)', fontSize: 14 }} />
                  <button onClick={() => {
                    const trimmed = otherText.trim();
                    const next = { ...answers, [q.id]: trimmed ? `other:${trimmed}` : 'other' };
                    setAnswers(next);
                    setOtherText('');
                    goToNext(next);
                  }}
                    className="mt-3 w-full py-3 rounded-2xl font-bold text-white"
                    style={{ background: '#FF5A1F', fontSize: 15, letterSpacing: '0.04em' }}>
                    {otherText.trim() ? `"${otherText.trim()}" · 下一步 →` : '跳过 · 下一步 →'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* multi-select hint + skip 链接 */}
          {q.multi && (() => {
            const minSel = q.minSelect ?? 1;
            const remaining = Math.max(0, minSel - multiSel.length);
            const allowSkip = minSel === 0;
            return (
              <div className="mt-6 flex items-center justify-between" style={{ minHeight: 36 }}>
                {multiSel.length > 0 ? (
                  remaining > 0 ? (
                    <p className="text-[#FF9054]" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
                      再选 {remaining} 项继续
                    </p>
                  ) : (
                    <p className="text-white/55" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
                      已选 {multiSel.length} 项 · 稍等带您往下走
                    </p>
                  )
                ) : <span />}
                {allowSkip ? (
                  <button onClick={() => commitMulti(multiSel)}
                    className="text-white/45 hover:text-white/75 transition-colors"
                    style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                    {multiSel.length > 0 ? '完成' : '这题先放一放'} →
                  </button>
                ) : <span />}
              </div>
            );
          })()}

          {/* Skip 整个 onboarding（只在 Q0 出现） */}
          {currentVisiblePos === 0 && (
            <button onClick={() => {
              const skipPrefs = { table_style: 'couple_2kids', oil_level: 'medium', breakfast_cuisine: 'chinese', setupAt: Date.now() };
              localStorage.setItem('quickPrefs', JSON.stringify(skipPrefs));
              localStorage.setItem('onboarding_v3_done', 'true');
              localStorage.setItem('onboarding_v2_done', 'true');
              localStorage.removeItem('needs_v3_onboarding');
              localStorage.removeItem('needs_v2_onboarding');
              localStorage.setItem('table_style', 'couple_2kids');
              localStorage.setItem('nutri_family_pattern', 'couple_2kids');
              localStorage.setItem('oil_level', 'medium');
              localStorage.setItem('breakfast_cuisine', 'chinese');
              localStorage.setItem('nutri_adults', '2');
              localStorage.setItem('nutri_kids', '2');
              localStorage.setItem('family_composition', JSON.stringify({ adults: 2, elders: { count: 0, conditions: [] }, kids: [{ age: '7-12' }, { age: '7-12' }] }));
              if (!localStorage.getItem('isLoggedIn')) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userId', crypto.randomUUID());
              }
              navigate('/');
            }}
              className="mt-4 text-center text-white/25 hover:text-white/50 transition-colors"
              style={{ fontSize: 12, letterSpacing: '0.06em' }}>
              先随便看看
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
