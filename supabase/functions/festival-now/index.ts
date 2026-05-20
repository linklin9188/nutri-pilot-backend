// Supabase Edge Function — GET /functions/v1/festival-now
//
// TICKET-20260521-001 §C. Returns the current (or imminent) Chinese seasonal
// marker plus the in-season ingredient tags that Algorithm uses as a scoring
// axis. Two layers:
//   1) 24 节气 (solar terms) — solar-calendar, deterministic by Gregorian date.
//   2) 8 农历节日 — lunar-calendar; hard-coded Gregorian dates per year
//      (table covers 2026-2030; Algorithm bumps when extending).
//
// Selection rule: if today falls within [festival_date, festival_date + 14d]
// for a lunar festival, return that festival. Otherwise look up the current
// solar term by ranging the date against the 24-term cutoffs for the year.
// Lunar festivals win ties (more culturally salient than the surrounding term).
//
// Deploy: supabase functions deploy festival-now --no-verify-jwt

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── 24 solar terms (节气) ───────────────────────────────────────────────────
// Each year the 24 terms fall on ±1 day around a fixed Gregorian date. The
// table below uses the canonical "early-side" date which is correct for
// 2024-2030 within ±1d (Algorithm tolerates the slack — terms span ~15d each).
// Ordered by year-of-day so a date can be matched by linear scan.
//
// Each entry: { term, monthDay (MM-DD), tags }. Tags are the in-season
// ingredients Algorithm wants to boost when this term is active.
type SolarTerm = { term: string; monthDay: string; tags: string[] };

const SOLAR_TERMS: SolarTerm[] = [
  { term: "小寒", monthDay: "01-05", tags: ["羊肉", "栗子", "山药", "白萝卜"] },
  { term: "大寒", monthDay: "01-20", tags: ["糯米", "红枣", "桂圆", "红薯"] },
  { term: "立春", monthDay: "02-04", tags: ["春笋", "韭菜", "豆芽", "菠菜"] },
  { term: "雨水", monthDay: "02-19", tags: ["荠菜", "莴笋", "豆苗", "茼蒿"] },
  { term: "惊蛰", monthDay: "03-05", tags: ["梨", "蜂蜜", "莴笋", "菠菜"] },
  { term: "春分", monthDay: "03-20", tags: ["香椿", "蚕豆", "豌豆", "草莓"] },
  { term: "清明", monthDay: "04-05", tags: ["青团", "马兰头", "螺蛳", "竹笋"] },
  { term: "谷雨", monthDay: "04-20", tags: ["香椿", "蚕豆", "茶叶", "鲈鱼"] },
  { term: "立夏", monthDay: "05-05", tags: ["枇杷", "樱桃", "蚕豆", "黄瓜"] },
  { term: "小满", monthDay: "05-21", tags: ["苦菜", "黄瓜", "苦瓜", "绿豆"] },
  { term: "芒种", monthDay: "06-06", tags: ["杨梅", "桑葚", "西瓜", "绿豆"] },
  { term: "夏至", monthDay: "06-21", tags: ["凉面", "冬瓜", "西瓜", "绿豆汤"] },
  { term: "小暑", monthDay: "07-07", tags: ["丝瓜", "莲藕", "绿豆", "薏米"] },
  { term: "大暑", monthDay: "07-23", tags: ["仙草", "苦瓜", "莲子", "鸭肉"] },
  { term: "立秋", monthDay: "08-08", tags: ["秋葵", "南瓜", "茄子", "鸭肉"] },
  { term: "处暑", monthDay: "08-23", tags: ["银耳", "百合", "鸭肉", "莲藕"] },
  { term: "白露", monthDay: "09-08", tags: ["梨", "山药", "南瓜", "桂花"] },
  { term: "秋分", monthDay: "09-23", tags: ["蟹", "柚子", "石榴", "山药"] },
  { term: "寒露", monthDay: "10-08", tags: ["柿子", "板栗", "芋头", "藕"] },
  { term: "霜降", monthDay: "10-23", tags: ["柿子", "白萝卜", "山楂", "板栗"] },
  { term: "立冬", monthDay: "11-07", tags: ["羊肉", "白萝卜", "饺子", "栗子"] },
  { term: "小雪", monthDay: "11-22", tags: ["腊肉", "白菜", "栗子", "羊肉"] },
  { term: "大雪", monthDay: "12-07", tags: ["羊肉", "山药", "枸杞", "桂圆"] },
  { term: "冬至", monthDay: "12-22", tags: ["饺子", "汤圆", "羊肉", "馄饨"] },
];

// ── 8 lunar festivals (Gregorian-equivalent dates for 2026-2030) ────────────
// Algorithm: lookup `LUNAR_FESTIVALS[year][name]` → Gregorian date. Add a year
// row when extending past 2030. The 14-day window per festival means "in
// season for that festival's cultural moment."
type LunarFestival = { name: string; date: string; tags: string[]; windowDays?: number };

const LUNAR_FESTIVALS: Record<number, LunarFestival[]> = {
  2026: [
    { name: "除夕",   date: "2026-02-16", tags: ["饺子", "鱼", "年糕", "汤圆"], windowDays: 3 },
    { name: "元宵节", date: "2026-03-03", tags: ["汤圆", "元宵", "糯米", "桂花"] },
    { name: "清明节", date: "2026-04-05", tags: ["青团", "馓子", "艾草", "竹笋"] },
    { name: "端午节", date: "2026-06-19", tags: ["粽子", "咸鸭蛋", "黄鳝", "雄黄"] },
    { name: "七夕",   date: "2026-08-19", tags: ["巧果", "瓜果", "莲藕", "桂花"] },
    { name: "中秋节", date: "2026-09-25", tags: ["月饼", "桂花", "柚子", "螃蟹"] },
    { name: "重阳节", date: "2026-10-19", tags: ["菊花", "重阳糕", "茱萸", "栗子"] },
    { name: "腊八节", date: "2027-01-15", tags: ["腊八粥", "腊八蒜", "豆类", "干果"] },
  ],
  2027: [
    { name: "除夕",   date: "2027-02-05", tags: ["饺子", "鱼", "年糕", "汤圆"], windowDays: 3 },
    { name: "元宵节", date: "2027-02-20", tags: ["汤圆", "元宵", "糯米", "桂花"] },
    { name: "清明节", date: "2027-04-05", tags: ["青团", "馓子", "艾草", "竹笋"] },
    { name: "端午节", date: "2027-06-08", tags: ["粽子", "咸鸭蛋", "黄鳝", "雄黄"] },
    { name: "七夕",   date: "2027-08-08", tags: ["巧果", "瓜果", "莲藕", "桂花"] },
    { name: "中秋节", date: "2027-09-15", tags: ["月饼", "桂花", "柚子", "螃蟹"] },
    { name: "重阳节", date: "2027-10-08", tags: ["菊花", "重阳糕", "茱萸", "栗子"] },
    { name: "腊八节", date: "2028-01-04", tags: ["腊八粥", "腊八蒜", "豆类", "干果"] },
  ],
  2028: [
    { name: "除夕",   date: "2028-01-25", tags: ["饺子", "鱼", "年糕", "汤圆"], windowDays: 3 },
    { name: "元宵节", date: "2028-02-09", tags: ["汤圆", "元宵", "糯米", "桂花"] },
    { name: "清明节", date: "2028-04-04", tags: ["青团", "馓子", "艾草", "竹笋"] },
    { name: "端午节", date: "2028-05-28", tags: ["粽子", "咸鸭蛋", "黄鳝", "雄黄"] },
    { name: "七夕",   date: "2028-07-27", tags: ["巧果", "瓜果", "莲藕", "桂花"] },
    { name: "中秋节", date: "2028-10-03", tags: ["月饼", "桂花", "柚子", "螃蟹"] },
    { name: "重阳节", date: "2028-10-26", tags: ["菊花", "重阳糕", "茱萸", "栗子"] },
    { name: "腊八节", date: "2029-01-23", tags: ["腊八粥", "腊八蒜", "豆类", "干果"] },
  ],
  2029: [
    { name: "除夕",   date: "2029-02-12", tags: ["饺子", "鱼", "年糕", "汤圆"], windowDays: 3 },
    { name: "元宵节", date: "2029-02-27", tags: ["汤圆", "元宵", "糯米", "桂花"] },
    { name: "清明节", date: "2029-04-04", tags: ["青团", "馓子", "艾草", "竹笋"] },
    { name: "端午节", date: "2029-06-15", tags: ["粽子", "咸鸭蛋", "黄鳝", "雄黄"] },
    { name: "七夕",   date: "2029-08-16", tags: ["巧果", "瓜果", "莲藕", "桂花"] },
    { name: "中秋节", date: "2029-09-22", tags: ["月饼", "桂花", "柚子", "螃蟹"] },
    { name: "重阳节", date: "2029-10-16", tags: ["菊花", "重阳糕", "茱萸", "栗子"] },
    { name: "腊八节", date: "2030-01-11", tags: ["腊八粥", "腊八蒜", "豆类", "干果"] },
  ],
  2030: [
    { name: "除夕",   date: "2030-02-02", tags: ["饺子", "鱼", "年糕", "汤圆"], windowDays: 3 },
    { name: "元宵节", date: "2030-02-17", tags: ["汤圆", "元宵", "糯米", "桂花"] },
    { name: "清明节", date: "2030-04-05", tags: ["青团", "馓子", "艾草", "竹笋"] },
    { name: "端午节", date: "2030-06-04", tags: ["粽子", "咸鸭蛋", "黄鳝", "雄黄"] },
    { name: "七夕",   date: "2030-08-05", tags: ["巧果", "瓜果", "莲藕", "桂花"] },
    { name: "中秋节", date: "2030-09-11", tags: ["月饼", "桂花", "柚子", "螃蟹"] },
    { name: "重阳节", date: "2030-10-05", tags: ["菊花", "重阳糕", "茱萸", "栗子"] },
    { name: "腊八节", date: "2031-01-01", tags: ["腊八粥", "腊八蒜", "豆类", "干果"] },
  ],
};

const DEFAULT_LUNAR_WINDOW_DAYS = 14;

// ── selection helpers ───────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function pickLunarFestival(today: Date): LunarFestival | null {
  const year = today.getUTCFullYear();
  // The festival list for year `Y` includes 腊八 in (Y+1) — also scan the
  // previous year's list (for 腊八 that crossed Jan 1).
  const candidates = [
    ...(LUNAR_FESTIVALS[year] ?? []),
    ...(LUNAR_FESTIVALS[year - 1] ?? []),
  ];
  for (const f of candidates) {
    const fDate = new Date(f.date + "T00:00:00Z");
    const window = f.windowDays ?? DEFAULT_LUNAR_WINDOW_DAYS;
    const elapsed = daysBetween(today, fDate);
    if (elapsed >= 0 && elapsed <= window) return f;
  }
  return null;
}

function pickSolarTerm(today: Date): SolarTerm {
  const year = today.getUTCFullYear();
  const todayMD = isoDay(today).slice(5);     // "MM-DD"
  // Latest term whose monthDay <= today. Wraps to last term of prior year
  // if today is before the first term of this year (i.e. Jan 1 – Jan 4).
  let chosen = SOLAR_TERMS[SOLAR_TERMS.length - 1];   // default: 冬至
  for (const t of SOLAR_TERMS) {
    if (t.monthDay <= todayMD) chosen = t;
    else break;
  }
  return chosen;
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  try {
    // Allow ?date=YYYY-MM-DD override for Algorithm testing.
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const today = dateParam
      ? new Date(dateParam + "T00:00:00Z")
      : new Date();
    if (isNaN(today.getTime())) {
      return json({ error: "invalid date param (expected YYYY-MM-DD)" }, 400);
    }

    const lunar = pickLunarFestival(today);
    if (lunar) {
      return json({
        festival:  lunar.name,
        kind:      "lunar",
        date:      lunar.date,
        tags:      lunar.tags,
        as_of:     isoDay(today),
      });
    }

    const term = pickSolarTerm(today);
    return json({
      festival:  term.term,
      kind:      "solar_term",
      tags:      term.tags,
      as_of:     isoDay(today),
    });
  } catch (e) {
    console.error("festival-now failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
