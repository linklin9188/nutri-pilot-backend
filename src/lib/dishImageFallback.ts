/**
 * Fallback image resolver for dishes without an image_url.
 *
 * Strategy:
 *   1. Pick a category from the dish's flavor_tags + origin_cuisine
 *   2. Hash the dish ID to select a consistent image from the pool
 *   3. When real AI-generated images are uploaded to storage and written
 *      to dishes.image_url, this fallback is bypassed automatically.
 *
 * All URLs are stable Unsplash images (format: /photo-{id}?w=400&h=400&fit=crop&q=80)
 */

const W = 'w=400&h=400&fit=crop&q=80';
const u = (id: string) => `https://images.unsplash.com/photo-${id}?${W}`;

const POOLS: Record<string, string[]> = {
  // ── Seafood ──────────────────────────────────────────────────────────────
  seafood: [
    u('1559847844-5315695dadae'), // crab / shell
    u('1565680018434-b513d5e5fd47'), // steamed fish
    u('1476124369491-e7adec5c239f'), // shrimp
    u('1559410545-0bdcd187e0a6'), // seafood platter
    u('1571091655789-405eb7a3a3a3'), // steamed seafood
  ],

  // ── Vegetables / veggie ──────────────────────────────────────────────────
  veggie: [
    u('1540420773420-3366772f4999'), // stir-fried greens
    u('1512621776951-a57141f2eefd'), // fresh vegetables
    u('1546069901-ba9599a7e63c'),    // mixed veg bowl
    u('1498837167922-ddd27525d352'), // light green dish
    u('1543362906-acfc16c67564'),    // vegetable plate
  ],

  // ── Soups & broth ────────────────────────────────────────────────────────
  soup: [
    u('1547592180-85f173990554'), // clear broth
    u('1574484284002-952d92456975'), // soup bowl
    u('1580822184713-fc5400e7fe10'), // herbal soup
    u('1529563021893-cc83c992d75d'), // hot pot
    u('1508736793122-b6b62b18f2a6'), // slow-cooked broth
  ],

  // ── Spicy / Sichuan ──────────────────────────────────────────────────────
  spicy: [
    u('1596797038530-2c107229654b'), // chilli dish
    u('1563245372-f21724e3856d'),    // spicy noodles / red dish
    u('1582878826629-1a7b7bd1f04a'), // mapo-style red braise
    u('1602253057119-44d745d9b860'), // spicy stir-fry
    u('1551782501-bbe1cf96f56a'),    // fiery wok dish
  ],

  // ── Cantonese / light steamed ─────────────────────────────────────────────
  cantonese: [
    u('1604908176997-125f25cc6f3d'), // poached chicken
    u('1563245372-f21724e3856d'),    // dim sum
    u('1571091655789-405eb7a3a3a3'), // steamed dishes
    u('1565299624946-b28f40a0ae38'), // Hong Kong café
    u('1518977676601-b53f82aba655'), // Cantonese roast
  ],

  // ── Meat / braised ───────────────────────────────────────────────────────
  meat: [
    u('1529692236671-f1f6cf9683ba'), // braised pork belly
    u('1432139555190-58524dae6a55'), // beef stir-fry
    u('1555939594-58d7cb561153'),    // roasted meat
    u('1607532941433-304659e8198a'), // steamed pork ribs
    u('1567188040759-fb8a883dc6d8'), // Chinese braised dish
  ],

  // ── Western / fusion ─────────────────────────────────────────────────────
  western: [
    u('1504674900247-0877df9cc836'), // pasta / western plate
    u('1414235077428-338989a2e8c0'), // fine dining
    u('1467003909585-2f8a72700288'), // western entrée
  ],

  // ── Japanese / Korean ─────────────────────────────────────────────────────
  japanese_korean: [
    u('1569050467447-ce54b3bbc37d'), // ramen / noodle bowl
    u('1569718212165-3a8278d5f624'), // Asian noodles
    u('1611143669185-af224c5e3252'), // sushi platter
  ],

  // ── Southeast Asian ──────────────────────────────────────────────────────
  southeast_asian: [
    u('1455619452474-d2be8b1e70cd'), // curry
    u('1562802378-063ec186a863'),    // pad thai / SE Asian
    u('1504544750208-9ce1ab62e88a'), // coconut curry
  ],

  // ── Default (mixed / unknown) ─────────────────────────────────────────────
  default: [
    u('1546069901-ba9599a7e63c'),
    u('1547592180-85f173990554'),
    u('1512621776951-a57141f2eefd'),
    u('1604908176997-125f25cc6f3d'),
    u('1529692236671-f1f6cf9683ba'),
    u('1574484284002-952d92456975'),
  ],
};

/** Stable hash of dish ID → consistent image within a category */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

/** Pick an appropriate fallback image for a dish with no stored image_url. */
export function getFallbackImage(dish: {
  id: string;
  flavor_tags?: string[];
  origin_cuisine?: string;
  seasonal_tag?: string;
}): string {
  const tags    = dish.flavor_tags    ?? [];
  const cuisine = dish.origin_cuisine ?? '';
  const season  = dish.seasonal_tag   ?? '';

  // Priority: specific flavor tag → cuisine → season hint → default
  let poolKey = 'default';

  if (tags.includes('seafood'))                            poolKey = 'seafood';
  else if (tags.includes('veggie'))                        poolKey = 'veggie';
  else if (tags.includes('spicy'))                         poolKey = 'spicy';
  else if (cuisine === 'cantonese')                        poolKey = 'cantonese';
  else if (cuisine === 'sichuan')                          poolKey = 'spicy';
  else if (cuisine === 'japanese_korean')                  poolKey = 'japanese_korean';
  else if (cuisine === 'western')                          poolKey = 'western';
  else if (cuisine === 'southeast_asian')                  poolKey = 'southeast_asian';
  else if (season.toLowerCase().includes('soup')  ||
           season.toLowerCase().includes('stew')  ||
           season.toLowerCase().includes('broth'))         poolKey = 'soup';
  else if (tags.includes('light'))                         poolKey = 'cantonese';
  else                                                     poolKey = 'meat';

  const pool = POOLS[poolKey] ?? POOLS.default;
  return pool[hashId(dish.id) % pool.length];
}
