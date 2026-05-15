/**
 * NutritionRadar — 6-axis nutrition radar card.
 *
 * Computes 6 dimensions aligned with 《中国居民膳食指南》/ 膳食宝塔 from a
 * weekly menu, renders them as an inline-SVG hexagon, and shows a one-line
 * "boost suggestion" pointing to the weakest axis.
 *
 * Self-contained: no chart library, no DB write — purely derives from the
 * cached `weeklyMenu` passed in.
 */

interface NutritionAxis {
  key:   'protein' | 'veggie' | 'grain' | 'calcium' | 'variety' | 'light';
  label: string;
  value: number;     // 0–100
  hint:  string;
}

const PROTEIN_INGS  = ['pork','beef','lamb','chicken','duck','turkey','fish','shrimp','crab','squid','scallop','clam','oyster','salmon','tuna','cod','seabass','hairtail','egg','tofu'];
const PLANT_INGS    = ['veggie','vegetable','mushroom','bean'];
const CALCIUM_KW    = /(豆腐|豆浆|芝士|奶酪|牛奶|沙丁鱼|小鱼干|芝麻|西兰花|菠菜|芥蓝|芥菜|油菜|上海青)/;
const STAPLE_TYPES_KW = /(米饭|面|粉|粥|饼|包|饺|馒头|薯|燕麦|杂粮)/;

export function computeHealthMetrics(weeklyMenu: any): { score: number; axes: NutritionAxis[] } | null {
  if (!weeklyMenu?.days) return null;
  const days = weeklyMenu.days as any[];
  if (days.length === 0) return null;

  const allDinner: any[] = days.flatMap(d => d.dishes ?? []);
  const allLunch:  any[] = days.flatMap(d => d.lunchDishes ?? []);
  const all       = [...allDinner, ...allLunch];
  const totalDishes = Math.max(all.length, 1);

  const proteinDays = days.filter(d =>
    (d.dishes ?? []).some((x: any) => PROTEIN_INGS.includes((x.main_ingredient ?? '').toLowerCase()))
  ).length;
  const protein = Math.min(100, Math.round((proteinDays / 7) * 100));

  const veggieDays = days.filter(d => {
    const todayPlant = [...(d.dishes ?? []), ...(d.lunchDishes ?? [])]
      .filter((x: any) => PLANT_INGS.some(p => (x.main_ingredient ?? '').includes(p)) || (x.course_type === 'veggie_dish'));
    return todayPlant.length >= 2;
  }).length;
  const veggie = Math.min(100, Math.round((veggieDays / 7) * 100));

  const stapleKinds = new Set<string>();
  for (const dish of allLunch) {
    if ((dish.course_type ?? '') !== 'staple') continue;
    const m = (dish.title_zh ?? '').match(STAPLE_TYPES_KW);
    if (m) stapleKinds.add(m[0]);
  }
  const grain = Math.min(100, Math.round((stapleKinds.size / 4) * 100));

  const calciumDays = days.filter(d => {
    const today = [...(d.dishes ?? []), ...(d.lunchDishes ?? [])];
    return today.some((x: any) => CALCIUM_KW.test(x.title_zh ?? ''));
  }).length;
  const calcium = Math.min(100, Math.round((calciumDays / 7) * 100));

  const uniqueIngs = new Set(all.map(d => (d.main_ingredient ?? 'other').toLowerCase()));
  const variety = Math.min(100, Math.round((uniqueIngs.size / Math.max(totalDishes * 0.6, 1)) * 100));

  const lightCount = all.filter(d => (d.flavor_tags ?? []).includes('light')).length;
  const heavyCount = all.filter(d => {
    const tags = d.flavor_tags ?? [];
    return tags.includes('fried') || tags.includes('spicy') || tags.includes('salty');
  }).length;
  const lightScore = Math.max(0, Math.min(100, Math.round(((lightCount - heavyCount) / totalDishes) * 100 + 60)));

  const axes: NutritionAxis[] = [
    { key: 'protein', label: '蛋白',   value: protein, hint: `${proteinDays}/7 天 有优质蛋白` },
    { key: 'veggie',  label: '蔬果',   value: veggie,  hint: `${veggieDays}/7 天 蔬果充足` },
    { key: 'grain',   label: '谷薯',   value: grain,   hint: `主食 ${stapleKinds.size} 种` },
    { key: 'calcium', label: '钙',     value: calcium, hint: `${calciumDays}/7 天 含钙食材` },
    { key: 'variety', label: '多样',   value: variety, hint: `${uniqueIngs.size} 种食材 / ${totalDishes} 道菜` },
    { key: 'light',   label: '低油盐', value: lightScore, hint: `清淡 ${lightCount} · 油盐重 ${heavyCount}` },
  ];

  const score = Math.round(axes.reduce((s, a) => s + a.value, 0) / 6);
  return { score, axes };
}

const BOOST_HINTS: Record<NutritionAxis['key'], string> = {
  protein: '加一道蛋类菜或豆腐鱼蛋',
  veggie:  '多加一道绿叶蔬菜',
  grain:   '换成杂粮饭 / 多换主食种类',
  calcium: '加豆腐 / 菠菜 / 紫菜',
  variety: '换掉重复的主蛋白（如猪肉换鱼）',
  light:   '少炒多蒸/煮，加一道清淡汤',
};

function buildBoostSuggestion(axes: NutritionAxis[], score: number): string | null {
  if (score >= 90) return null;
  const sorted = [...axes].sort((a, b) => a.value - b.value).filter(a => a.value < 90);
  if (sorted.length === 0) return null;
  const weakest = sorted[0];
  return `${weakest.label} 弱：${BOOST_HINTS[weakest.key]}`;
}

// ── Hexagon SVG (inline, no chart lib) ─────────────────────────────────────
function NutritionHexagon({ axes }: { axes: NutritionAxis[] }) {
  if (axes.length !== 6) return null;

  const size       = 220;
  const cx         = size / 2;
  const cy         = size / 2;
  const radius     = 64;
  const labelOff   = 22;

  const angles = [-90, -30, 30, 90, 150, 210].map(a => (a * Math.PI) / 180);

  const point = (val: number, i: number) => {
    const r = radius * (val / 100);
    return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) };
  };
  const labelPoint = (i: number) => {
    const r = radius + labelOff;
    return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) };
  };
  const polyStr = (vals: number[]) => vals.map((v, i) => {
    const p = point(v, i); return `${p.x},${p.y}`;
  }).join(' ');

  const rings = [25, 50, 75, 100].map(v => Array(6).fill(v));
  const targetVals  = Array(6).fill(90);
  const currentVals = axes.map(a => a.value);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 280, margin: '0 auto', display: 'block' }}>
      {rings.map((vs, ringI) => (
        <polygon key={ringI} points={polyStr(vs)} fill="none"
          stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
      ))}
      {angles.map((_, i) => {
        const outer = point(100, i);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y}
          stroke="rgba(0,0,0,0.05)" strokeWidth={1} />;
      })}
      <polygon points={polyStr(targetVals)} fill="none"
        stroke="rgba(255,90,31,0.35)" strokeWidth={1.2} strokeDasharray="3 3" />
      <polygon points={polyStr(currentVals)} fill="rgba(16,185,129,0.18)"
        stroke="#10b981" strokeWidth={2} strokeLinejoin="round" />
      {currentVals.map((v, i) => {
        const p = point(v, i);
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#10b981" />;
      })}
      {axes.map((a, i) => {
        const lp = labelPoint(i);
        const anchor = i === 0 ? 'middle' : i === 3 ? 'middle' : (i === 1 || i === 2) ? 'start' : 'end';
        return (
          <g key={a.key}>
            <text x={lp.x} y={lp.y} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: '#1a1a1a' }}>
              {a.label}
            </text>
            <text x={lp.x} y={lp.y + 12} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: 9, fill: 'rgba(0,0,0,0.45)' }}>
              {Math.round(a.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Public card component ───────────────────────────────────────────────────
export function NutritionRadarCard({ weeklyMenu, dark = false }: { weeklyMenu: any; dark?: boolean }) {
  const health = computeHealthMetrics(weeklyMenu);
  if (!health) return null;

  // Dark variant for WeeklyMenu's dark-themed page; light variant for white-bg context.
  const bg     = dark ? "rgba(255,255,255,0.06)" : "white";
  const border = dark ? "1px solid rgba(255,255,255,0.10)" : "none";
  const shadow = dark ? "none" : "0 8px 28px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)";
  const labelColor   = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.42)";
  const titleColor   = dark ? "white" : "#1a1a1a";
  const dividerColor = dark ? "rgba(255,255,255,0.85)" : "#1a1a1a";

  const boost = buildBoostSuggestion(health.axes, health.score);

  return (
    <div className="rounded-3xl p-5" style={{ background: bg, border, boxShadow: shadow }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p style={{
            fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
            color: labelColor, fontWeight: 600,
          }}>
            Nutrition · 本周
          </p>
          <p className="font-serif font-black mt-0.5" style={{
            fontSize: 19, color: titleColor, letterSpacing: "-0.005em",
          }}>
            营养雷达
          </p>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-serif font-black" style={{
            fontSize: 30, color: titleColor, lineHeight: 1,
          }}>
            {health.score}
          </span>
          <span style={{ fontSize: 12, color: labelColor }}>/100</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full font-bold"
            style={{
              fontSize: 10,
              background: health.score >= 80 ? "rgba(52,211,153,0.18)" : health.score >= 65 ? "rgba(251,191,36,0.18)" : "rgba(248,113,113,0.18)",
              color:      health.score >= 80 ? "#10b981"            : health.score >= 65 ? "#f59e0b"            : "#ef4444",
            }}>
            {health.score >= 80 ? "优秀" : health.score >= 65 ? "良好" : "待改善"}
          </span>
        </div>
      </div>

      {/* The hexagon uses fixed dark text — wrap it in a near-white pill on the
          dark variant so the labels remain readable. */}
      <div style={dark ? { background: "rgba(255,255,255,0.92)", borderRadius: 16, padding: "8px 4px" } : {}}>
        <NutritionHexagon axes={health.axes} />
      </div>

      {boost ? (
        <div className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2"
          style={{
            background: dark ? "rgba(255,90,31,0.12)" : "rgba(255,90,31,0.06)",
            border: "1px solid rgba(255,90,31,0.25)",
          }}>
          <span style={{ fontSize: 14 }}>💡</span>
          <p className="flex-1" style={{
            fontSize: 11.5,
            color: dark ? "#FFB57A" : "#7a3000",
            lineHeight: 1.4,
          }}>
            差 {90 - health.score} 分到 90 · <span className="font-bold">{boost}</span>
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2"
          style={{
            background: dark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.25)",
          }}>
          <span style={{ fontSize: 14 }}>🎉</span>
          <p style={{
            fontSize: 11.5,
            color: dark ? "#5eead4" : "#047857",
            lineHeight: 1.4,
          }}>
            本周营养已达 <span className="font-bold">优秀</span> 标准
          </p>
        </div>
      )}

      <p className="mt-2 text-center" style={{ fontSize: 10, color: labelColor }}>
        ●&nbsp;本周 &nbsp;&nbsp; ┄ 90 分参考 &nbsp;&nbsp; · 依据《中国居民膳食指南》
      </p>
    </div>
  );
}

// Re-export the hexagon for any consumer that wants just the SVG
export { NutritionHexagon };
