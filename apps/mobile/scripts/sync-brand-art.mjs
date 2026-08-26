/*
 * Sinh ảnh logo hãng xe cho app native TỪ CHÍNH file SVG của web.
 *
 * `apps/web/public/brands/*.svg` là nguồn duy nhất — thêm/sửa logo chỉ làm ở đó rồi chạy lại
 * script này, không có bộ ảnh thứ hai để lệch nhau.
 *
 * Vì sao phải rasterise: React Native không đọc được SVG nếu không cắm `react-native-svg`, mà
 * đó là NATIVE module — Expo Go không mang nó ("Can't find ViewManager RNSVGEllipse"). PNG thì
 * `Image` của RN core đọc thẳng, chạy ở mọi bản build.
 *
 *     node scripts/sync-brand-art.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../web/public/brands');
const target = join(here, '../assets/brands');

/** Bề rộng vẽ ra cho từng mật độ màn — Metro tự chọn @2x/@3x theo thiết bị. */
const DENSITIES = [
  { suffix: '', width: 24 },
  { suffix: '@2x', width: 48 },
  { suffix: '@3x', width: 72 },
];

mkdirSync(target, { recursive: true });

const keys = [];
for (const file of readdirSync(source).filter((f) => f.endsWith('.svg')).sort()) {
  const key = basename(file, '.svg');
  const svg = readFileSync(join(source, file));

  for (const { suffix, width } of DENSITIES) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
    writeFileSync(join(target, `${key}${suffix}.png`), png);
  }
  keys.push(key);
}

// Bảng tra phải TĨNH: Metro chỉ gói được ảnh nào được import tường minh, không require đường
// dẫn dựng lúc chạy. Sinh luôn ở đây để không ai phải nhớ cập nhật bằng tay.
const module = `/*
 * SINH TỰ ĐỘNG bởi \`scripts/sync-brand-art.mjs\` từ \`apps/web/public/brands/*.svg\`.
 * KHÔNG sửa tay — sửa SVG bên web rồi chạy lại script.
 */
import type { ImageSourcePropType } from 'react-native';
${keys.map((k) => `import ${k} from '../../../assets/brands/${k}.png';`).join('\n')}

/** Khoá là \`vehicleBrandKey(brand)\`. Hãng ngoài bảng → monogram, xem \`BrandMark\`. */
export const BRAND_ART: Readonly<Record<string, ImageSourcePropType>> = {
${keys.map((k) => `  ${k},`).join('\n')}
};
`;
writeFileSync(join(here, '../src/features/catalog/brand-art.ts'), module);

console.log(`${keys.length} logo → ${DENSITIES.length} mật độ`);
