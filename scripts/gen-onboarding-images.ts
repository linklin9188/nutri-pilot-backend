/**
 * gen-onboarding-images.ts — TICKET-20260523-022 §B
 *
 * Generate 9 onboarding images (Q0 6 family scenes + Q1 3 dish photos) via
 * Nano Banana (gemini-2.5-flash-image) routed through gemini-proxy
 * (endpoint='image_gen').
 *
 * Output: writes JPG files to public/onboarding/ — Vite serves them at
 * /onboarding/{name}.jpg in the browser.
 *
 * Re-runs OVERWRITE existing files (placeholder swap is the entire point of
 * this ticket — Q0 currently has multiple files reusing identical bytes).
 *
 * Run:
 *   npx tsx scripts/gen-onboarding-images.ts            # all 9
 *   npx tsx scripts/gen-onboarding-images.ts --only q0  # Q0 6 only
 *   npx tsx scripts/gen-onboarding-images.ts --only q1  # Q1 3 only
 *   npx tsx scripts/gen-onboarding-images.ts --dry-run  # print prompts, no API call
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/gemini-proxy`;
const BOT_USER_ID  = 'backfill-bot-022a';
const MODEL        = 'gemini-2.5-flash-image';   // Nano Banana
const OUT_DIR      = join(process.cwd(), 'public', 'onboarding');

const ONLY_ARG = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
const DRY_RUN  = process.argv.includes('--dry-run');

// Style anchor shared across all Q0 family scenes — keeps the 6 illustrations
// visually consistent so the 6-card grid doesn't feel like 6 unrelated drawings.
const Q0_STYLE = "a warm hand-drawn cartoon illustration in soft watercolor wash, top-down view of a round wooden dining table, no faces visible / minimal facial detail to keep family members generic, neutral skin tones, cozy home interior with warm lighting, simple style, portrait orientation";

interface ImgSpec { file: string; prompt: string; aspectRatio: '2:3' | '1:1' | '4:3'; }

const Q0_SPECS: ImgSpec[] = [
  { file: 'q0_solo_w_kid.jpg',
    aspectRatio: '2:3',
    prompt:  `${Q0_STYLE}, showing 1 adult and 1 child sitting together (single parent scene), 3-4 small bowls of home-cooked food in the center.` },
  { file: 'q0_couple_1kid.jpg',
    aspectRatio: '2:3',
    prompt:  `${Q0_STYLE}, showing 2 adults and 1 child (three-person family), 4-5 small bowls of home-cooked food in the center.` },
  { file: 'q0_couple_2kids.jpg',
    aspectRatio: '2:3',
    prompt:  `${Q0_STYLE}, showing 2 adults and 2 children (four-person family), 5-6 small bowls of home-cooked food in the center.` },
  { file: 'q0_couple_3kids.jpg',
    aspectRatio: '2:3',
    prompt:  `${Q0_STYLE}, showing 2 adults and 3 children (five-person family with multiple kids), 6 small bowls of home-cooked food in the center.` },
  { file: 'q0_three_gen.jpg',
    aspectRatio: '2:3',
    prompt:  `${Q0_STYLE}, showing 4 adults (2 grandparents + 2 parents) and 2 children (three-generation household), 7-8 small bowls of home-cooked food in the center.` },
  { file: 'q0_custom.jpg',
    aspectRatio: '2:3',
    prompt:  `An abstract puzzle-piece collage in the same warm watercolor style, with simple emoji silhouettes representing various household compositions (single, couple, family, group), no faces, neutral and inviting, suggesting "build your own".` },
];

const Q1_STYLE = "professional food photography, top-down view, natural daylight, no human hands, white ceramic plate, no chopsticks, clean wooden table surface, shallow depth of field, appetizing presentation, square orientation 1024x1024";

const Q1_SPECS: ImgSpec[] = [
  { file: 'q1_beef_stew.jpg',
    aspectRatio: '1:1',
    prompt: `${Q1_STYLE}, a Hong Kong-style beef brisket stew with daikon radish in rich red-brown broth, served in a small Chinese clay pot, garnished with green scallion tops.` },
  { file: 'q1_chicken_poached.jpg',
    aspectRatio: '1:1',
    prompt: `${Q1_STYLE}, a Cantonese white-cut chicken arranged neatly on the plate with pale golden skin, accompanied by a small dipping dish of ginger-scallion sauce on the side.` },
  { file: 'q1_shrimp.jpg',
    aspectRatio: '1:1',
    prompt: `${Q1_STYLE}, a Cantonese steamed shrimp dish — pink curled shrimp arranged around the edge of the plate, with a small dish of soy-based dipping sauce, fresh lemon wedge garnish.` },
];

async function generateImage(spec: ImgSpec): Promise<string> {
  const body = {
    user_id: BOT_USER_ID,
    endpoint: 'image_gen',
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: spec.prompt }] }],
    generationConfig: {
      responseModalities: ['Image'],
      imageConfig: { aspectRatio: spec.aspectRatio },
    },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      const wrap = await res.json();
      const parts = wrap?.data?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
      const b64 = imgPart?.inline_data?.data ?? imgPart?.inlineData?.data;
      if (!b64) {
        // No image returned — log full response for debugging, throw.
        console.error('   no inline_data in response:', JSON.stringify(wrap).slice(0, 400));
        throw new Error('no inline_data');
      }
      return b64;
    }
    if ([429, 502, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 8000;
      console.log(`   ⏳ proxy ${res.status} (attempt ${attempt}/3) — sleep ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const errText = await res.text();
    throw new Error(`proxy ${res.status}: ${errText.slice(0, 200)}`);
  }
  throw new Error('exhausted retries');
}

async function main() {
  console.log(`\n🎨 Onboarding image generation — DRY=${DRY_RUN}  ONLY=${ONLY_ARG ?? 'all'}\n`);

  let specs: ImgSpec[] = [];
  if (!ONLY_ARG || ONLY_ARG === 'q0') specs = specs.concat(Q0_SPECS);
  if (!ONLY_ARG || ONLY_ARG === 'q1') specs = specs.concat(Q1_SPECS);

  console.log(`Pool: ${specs.length} images → ${OUT_DIR}\n`);
  if (DRY_RUN) {
    for (const s of specs) console.log(`   ${s.file}  [${s.aspectRatio}]  ${s.prompt.slice(0, 90)}…`);
    return;
  }

  let ok = 0, err = 0;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    process.stdout.write(`[${i+1}/${specs.length}] ${s.file.padEnd(28)} → `);
    try {
      const b64 = await generateImage(s);
      const buf = Buffer.from(b64, 'base64');
      writeFileSync(join(OUT_DIR, s.file), buf);
      ok++;
      console.log(`✅ ${(buf.length / 1024).toFixed(1)} KB`);
    } catch (e: any) {
      err++;
      console.log(`❌ ${e.message.slice(0, 120)}`);
    }
    // PAUSE between calls — Nano Banana lighter rate-limited but be polite
    await new Promise(r => setTimeout(r, 1200));
  }
  console.log(`\n✅ Done!  ok=${ok}  err=${err}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
