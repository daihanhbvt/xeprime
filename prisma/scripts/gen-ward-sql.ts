/**
 * Sinh phần INSERT danh mục cấp xã cho migration TỪ `prisma/data/ward-catalog.json`.
 *
 * Cùng lý do tồn tại như `gen-province-sql.ts`: 3.321 dòng SQL gõ tay là 3.321 cơ hội sai một
 * mã mà không ai phát hiện bằng mắt, và đây là dữ liệu của một văn bản pháp lý. Script chạy MỘT
 * LẦN lúc soạn migration; migration đã commit là SQL tĩnh, không sinh lúc deploy.
 *
 * Chạy: pnpm --filter @xeprime/prisma exec tsx ./scripts/gen-ward-sql.ts > /tmp/wards.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeWardName, type WardCatalogEntry } from '@xeprime/types';

interface WardCatalogFile {
  _source: { url: string; publisher: string; legalBasis: string; fetchedAt: string };
  wards: WardCatalogEntry[];
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const file = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../data/ward-catalog.json'), 'utf8'),
) as WardCatalogFile;

/**
 * Chèn theo LÔ 500 dòng thay vì một câu VALUES khổng lồ: một statement 3.321 dòng vẫn chạy
 * được nhưng khi nó lỗi thì thông báo của Postgres chỉ ra "một chỗ nào đó trong 600KB". Lô nhỏ
 * cho biết ngay dải nào hỏng, và không làm chậm gì đáng kể.
 */
const BATCH_SIZE = 500;

const rows = file.wards.map(
  (w) =>
    `  (${sqlString(w.code)}, ${sqlString(w.provinceCode)}, ${sqlString(w.name)}, ` +
    `${sqlString(w.shortName)}, ${sqlString(w.administrativeType)}, ` +
    `${sqlString(normalizeWardName(w.name))})`,
);

const batches: string[] = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  batches.push(
    'INSERT INTO "wards" ("code", "province_code", "name", "short_name", "administrative_type", "normalized_name") VALUES\n' +
      `${rows.slice(i, i + BATCH_SIZE).join(',\n')}\n` +
      'ON CONFLICT ("code") DO UPDATE SET\n' +
      '  "province_code" = EXCLUDED."province_code",\n' +
      '  "name" = EXCLUDED."name",\n' +
      '  "short_name" = EXCLUDED."short_name",\n' +
      '  "administrative_type" = EXCLUDED."administrative_type",\n' +
      '  "normalized_name" = EXCLUDED."normalized_name",\n' +
      '  "updated_at" = now();',
  );
}

process.stdout.write(
  `-- ${file.wards.length} đơn vị hành chính cấp xã (xã/phường/đặc khu).\n` +
    `-- Nguồn: ${file._source.publisher}\n` +
    `--        ${file._source.url} — tải ngày ${file._source.fetchedAt}\n` +
    `-- Căn cứ: ${file._source.legalBasis}\n` +
    `-- Sinh bằng prisma/scripts/gen-ward-sql.ts từ prisma/data/ward-catalog.json — KHÔNG sửa tay.\n` +
    `-- ON CONFLICT: chạy lại KHÔNG nhân bản và KHÔNG đè cờ \`is_enabled\` admin đã đổi.\n\n` +
    `${batches.join('\n\n')}\n`,
);
