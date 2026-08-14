/**
 * Sinh phần INSERT danh mục tỉnh cho migration TỪ bản soạn `packages/types/src/province.ts`.
 *
 * Vì sao có script này thay vì gõ tay 34 + ~70 dòng SQL: gõ tay là hai nguồn sự thật, và bộ dữ
 * liệu này là văn bản pháp lý — một mã sai không ai phát hiện bằng mắt. Script chạy MỘT LẦN lúc
 * soạn migration; migration đã commit là SQL tĩnh (không sinh lúc deploy).
 *
 * Chạy: pnpm --filter @xeprime/prisma exec tsx ./scripts/gen-province-sql.ts
 * Kiểm lại: `province-catalog.spec.ts` so từng dòng INSERT trong migration với bản soạn.
 */
import { PROVINCE_CATALOG, buildProvinceAliasSeeds, provinceSlug } from '@xeprime/types';

/**
 * Bảng ký tự cho `translate()` trong PostgreSQL — bản sao của bước bỏ dấu ở
 * `normalizeProvinceAlias`, TÍNH RA chứ không gõ tay.
 *
 * Gõ tay 67 ký tự tiếng Việt vào một chuỗi SQL rồi gõ 67 ký tự ASCII tương ứng vào chuỗi thứ hai
 * là cách chắc chắn nhất để lệch một ký tự mà không ai thấy — và lệch một ký tự nghĩa là một tỉnh
 * không quy được, tức một shop mất vị trí.
 */
function diacriticTranslateMap(): { from: string; to: string } {
  const from =
    'àáảãạăằắẳẵặâầấẩẫậ' +
    'èéẻẽẹêềếểễệ' +
    'ìíỉĩị' +
    'òóỏõọôồốổỗộơờớởỡợ' +
    'ùúủũụưừứửữự' +
    'ỳýỷỹỵ' +
    'đ';
  const to = [...from]
    .map((c) =>
      c
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd'),
    )
    .join('');
  if ([...from].length !== [...to].length) {
    throw new Error(`translate map lệch độ dài: ${[...from].length} vs ${[...to].length}`);
  }
  return { from, to };
}

/** ULID tất định cho alias: migration chạy lại/chạy ở môi trường khác vẫn ra đúng id đó. */
function aliasId(index: number): string {
  return `01PROVALIAS${String(index).padStart(15, '0')}`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const provinceRows = PROVINCE_CATALOG.map(
  (p) =>
    `  (${sqlString(p.code)}, ${sqlString(p.name)}, ${sqlString(p.administrativeType)}, ` +
    `${sqlString(provinceSlug(p.name))}, ${p.sortOrder})`,
).join(',\n');

const aliasRows = buildProvinceAliasSeeds()
  .map(
    (a, i) =>
      `  (${sqlString(aliasId(i + 1))}, ${sqlString(a.provinceCode)}, ${sqlString(a.alias)}, ` +
      `${sqlString(a.normalizedAlias)}, ${sqlString(a.aliasType)})`,
  )
  .join(',\n');

const { from: diacriticFrom, to: diacriticTo } = diacriticTranslateMap();

const normalizeFunctionSql =
  `-- Bản sao của \`normalizeProvinceAlias\` (packages/types) dưới dạng SQL, để migration quy được\n` +
  `-- dữ liệu tỉnh tự do cũ mà không cần extension \`unaccent\` (VPS có thể không cài).\n` +
  `CREATE OR REPLACE FUNCTION xeprime_normalize_province(raw text) RETURNS text AS $fn$\n` +
  `DECLARE s text;\n` +
  `BEGIN\n` +
  `  IF raw IS NULL THEN RETURN NULL; END IF;\n` +
  `  s := lower(raw);\n` +
  `  s := translate(s, ${sqlString(diacriticFrom)}, ${sqlString(diacriticTo)});\n` +
  `  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');\n` +
  `  s := btrim(s);\n` +
  `  -- Tiền tố hành chính ở ĐẦU chuỗi; \`tp\` không cần dấu phân cách để bắt \`TPHCM\`.\n` +
  `  s := regexp_replace(s, '^(thanh pho|tinh|t p|tp)\\s*', '');\n` +
  `  s := regexp_replace(s, '\\s+', ' ', 'g');\n` +
  `  RETURN btrim(s);\n` +
  `END; $fn$ LANGUAGE plpgsql IMMUTABLE;\n`;

process.stdout.write(
  `${normalizeFunctionSql}\n` +
    `-- ${PROVINCE_CATALOG.length} đơn vị hành chính cấp tỉnh (QĐ 19/2025/QĐ-TTg, hiệu lực 01/07/2025).\n` +
    `-- ON CONFLICT: migration/seed chạy lại KHÔNG nhân bản và KHÔNG đè cờ hiển thị admin đã đổi.\n` +
    `INSERT INTO "provinces" ("code", "name", "administrative_type", "slug", "sort_order") VALUES\n` +
    `${provinceRows}\n` +
    `ON CONFLICT ("code") DO UPDATE SET\n` +
    `  "name" = EXCLUDED."name",\n` +
    `  "administrative_type" = EXCLUDED."administrative_type",\n` +
    `  "slug" = EXCLUDED."slug",\n` +
    `  "sort_order" = EXCLUDED."sort_order",\n` +
    `  "updated_at" = now();\n\n` +
    `-- Bí danh: tên tỉnh CŨ trước sáp nhập + các cách viết khác. \`normalized_alias\` là khoá tra cứu.\n` +
    `INSERT INTO "province_aliases" ("id", "province_code", "alias", "normalized_alias", "alias_type") VALUES\n` +
    `${aliasRows}\n` +
    `ON CONFLICT ("normalized_alias") DO NOTHING;\n`,
);
