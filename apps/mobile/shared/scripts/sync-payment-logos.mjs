/**
 * Logo ví điện tử cho màn thanh toán native — sinh từ `apps/web/public/payment-methods/` (nguồn
 * duy nhất, cùng file web dùng ở `provider-logos.ts`). Metro không vẽ SVG thô, nên SVG được
 * rasterize sẵn theo @1x/@2x/@3x như `sync-brand-art.mjs`; PNG (MoMo) chép nguyên bản.
 *
 * Chạy: `node apps/mobile/shared/scripts/sync-payment-logos.mjs` khi web đổi logo.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../../web/public/payment-methods');
const target = join(here, '../assets/payment-methods');
mkdirSync(target, { recursive: true });

/** Chiều CAO hiển thị 28dp — bề ngang theo tỉ lệ file gốc (không kéo méo logo thương hiệu). */
const HEIGHT = 28;
for (const key of ['vnpay-vi', 'vnpay-en']) {
  const svg = readFileSync(join(source, `${key}.svg`));
  for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
    const png = new Resvg(svg, { fitTo: { mode: 'height', value: HEIGHT * scale } }).render().asPng();
    writeFileSync(join(target, `${key}${suffix}.png`), png);
  }
}
copyFileSync(join(source, 'momo.png'), join(target, 'momo.png'));
console.log('payment logos synced →', target);
