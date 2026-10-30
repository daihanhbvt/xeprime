/*
 * Sinh ảnh minh hoạ cho app native TỪ CHÍNH file SVG của web (`apps/web/public/illustrations`).
 *
 * Logo hãng xe KHÔNG còn sinh ở đây (27/10/2026, web #222): logo là DỮ LIỆU của danh mục
 * (`catalog_items.icon_url`), `BrandMark` đọc URL đó như web — không còn bộ ảnh đóng gói.
 *
 *     node scripts/sync-brand-art.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));

/*
 * Minh hoạ hero — cùng nguồn SVG với web, đổ ra PNG
 * (ảnh lớn, nhiều lớp — PNG nhẹ hơn khi vẽ).
 *
 * Bề rộng bám mốc mobile của web (`max-width: 320px`), nhân theo mật độ màn.
 */
const illustrationSource = join(here, '../../web/public/illustrations');
const illustrationTarget = join(here, '../assets/images');
const ILLUSTRATIONS = ['shop-onboarding', 'owner-personal-car', 'owner-shop-showroom'];

for (const key of ILLUSTRATIONS) {
  const svg = readFileSync(join(illustrationSource, `${key}.svg`));
  for (const { suffix, width } of [
    { suffix: '', width: 320 },
    { suffix: '@2x', width: 640 },
    { suffix: '@3x', width: 960 },
  ]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
    writeFileSync(join(illustrationTarget, `${key}${suffix}.png`), png);
  }
}

console.log(`${ILLUSTRATIONS.length} minh hoạ → 3 mật độ`);
