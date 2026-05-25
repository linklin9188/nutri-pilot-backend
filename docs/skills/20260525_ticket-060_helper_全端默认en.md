# TICKET-20260525-060 — Helper 全端默认英文 + 全端语言切换 chip 补缺

## 1. 问题

老板真测 #4 (2026-05-25 凌晨): 雇主切到 helper 视角进入 "厨艺社区" tab,
页面文案是中文显示, 期望是默认英文 + 提供 EN/TL/ID 切换 chip 才符合菲佣
(母语菲律宾语 / 印尼语, 工作语英文) 使用习惯.

真因实查 5 个 Helper 页:
- HelperHome / HelperSettings: 已有 zh→en useEffect + lang chip ✅
- HelperPrep: 有 chip, 缺 zh→en useEffect ❌
- HelperCommunity: zh→en useEffect 缺 + lang chip 缺 ❌ (老板亲测痛点)
- HelperCook: zh→en useEffect 缺 + lang chip 缺 ❌

i18n 三语文案 (en/zh/tl) 这 3 页本来就齐, 不缺翻译 — 唯一缺的是 "进入时
强制 EN" 的 useEffect 和右上 chip 的语言切换入口.

## 2. 方法

照 HelperHome.tsx:73-78 + line 80-82 模式补:

```ts
// 解构追加 setLanguage + cycleLanguageForRole (HelperPrep 已有 cycle, 只补 setLanguage)
const { ..., language, setLanguage, cycleLanguageForRole } = useLanguage();

// zh→en 强制 (helper 视角不显示中文)
useEffect(() => {
  if (language === 'zh' || language === 'zh-Hant') {
    setLanguage('en');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// chip 短码 (HelperHome 风格, 非 LANGUAGE_LABEL "Filipino"/"Indonesia")
const langChip = language === 'tl' ? 'TL' : language === 'id' ? 'ID' : 'EN';
```

Header chip 样式:
```tsx
<button onClick={cycleLanguageForRole}
  className="px-3 h-8 rounded-full font-bold active:scale-95 transition-transform flex-shrink-0"
  style={{ background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', fontSize: 12 }}
  title="Switch language">
  {langChip}
</button>
```

HelperCook 特殊处理: 顶层 HelperCook 组件无渲染 (只路由 DishListScreen ↔
CookingScreen), zh→en useEffect 放顶层一次拉齐两个子屏, 每个子屏各自加
chip (3 处 header: DishListScreen + CookingScreen 主 header + CookingScreen
no-step placeholder header).

Vite build 2229 modules ✅ 零错误.

## 3. 标准 (今后新 Helper 页面)

**模板 — 任何新 helper-only 页 (`/helper*` 路由) 都必须**:

1. `const { language, setLanguage, cycleLanguageForRole, ... } = useLanguage();`
   不能只解 `t3` / `t4` 然后空跑 useLanguage — 缺 setLanguage 就没法强制英文.

2. 组件顶部 zh→en useEffect (照 HelperHome.tsx:73-78 抄):
   ```ts
   useEffect(() => {
     if (language === 'zh' || language === 'zh-Hant') setLanguage('en');
   }, []);
   ```
   eslint-disable exhaustive-deps 是故意的 — 只在 mount 跑一次, 后续用户
   主动切语言不能被这条 effect 反复覆盖.

3. Header 右上必有 lang chip — 用 `cycleLanguageForRole` 而不是直接
   `setLanguage('tl')`, 让循环顺序 (EN → TL → ID → EN) 由 context 统一控.
   短码风格用 EN/TL/ID (HelperHome 约定), 不用 LANGUAGE_LABEL 长名,
   避免 chip 过宽挤掉 header 主标题.

4. i18n 文案三语齐: t3('en text', 'zh text', 'tl text'), 即使初始进入是
   英文, 雇主切回中文时也必须能正确显示 (zh 是给雇主端 debug 用, 不能空).

**反例**: HelperCommunity 之前只解构 `t3` 就空跑 useLanguage, 翻译齐全
但语言锚定没做 → 雇主上次切了中文残留在 localStorage, 跳到 helper 社区
时按 zh 渲染了所有中文 — 这就是老板亲测看到的现象.
