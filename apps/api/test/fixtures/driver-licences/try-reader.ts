/* eslint-disable no-console -- công cụ dòng lệnh: in kết quả đọc ra terminal là việc của nó */
/**
 * Chạy bộ đọc ảnh THẬT (Tesseract tại chỗ) trên bộ ảnh mẫu bằng lái và so với kết quả mong đợi —
 * ADR 0057.
 *
 *   pnpm --filter @xeprime/api licence:try                     # cả bộ
 *   pnpm --filter @xeprime/api licence:try idp-b.jpg           # một vài ảnh
 *   pnpm --filter @xeprime/api licence:try ./anh-cua-toi.jpg   # ảnh bất kỳ trên máy
 *
 * Không cần khoá, không tốn phí, không đụng database hay R2 — đi thẳng ảnh → bộ đọc →
 * `decideFromReading`, đúng hai bước mà lượt đọc nền của server chạy. Thử ảnh bằng lái THẬT của
 * chính mình để chỉnh ngưỡng là an toàn: ảnh không rời máy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { vnDateKey, type ImageUploadMimeType } from '@xeprime/types';
import { decideFromReading } from '../../../src/modules/driver-licences/driver-licence-decision';
import { DriverLicenceReaderError } from '../../../src/modules/driver-licences/reader/driver-licence-reader';
import { TesseractDriverLicenceReader } from '../../../src/modules/driver-licences/reader/tesseract-driver-licence-reader';

interface Sample {
  file: string;
  expect: string;
  note: string;
}

const HERE = __dirname;
const MIME: Record<string, ImageUploadMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main(): Promise<void> {
  const reader = new TesseractDriverLicenceReader();
  const samples = JSON.parse(readFileSync(join(HERE, 'samples.json'), 'utf8')) as Sample[];
  const args = process.argv.slice(2);
  const targets: Sample[] =
    args.length === 0
      ? samples
      : args.map(
          (arg) =>
            samples.find((s) => s.file === arg) ?? {
              file: arg,
              expect: '?',
              note: 'ảnh ngoài bộ mẫu',
            },
        );

  const today = vnDateKey(new Date());
  console.log(`Bộ đọc: ${reader.model} · hôm nay: ${today}\n`);
  let matched = 0;

  try {
    for (const sample of targets) {
      const path = existsSync(join(HERE, sample.file))
        ? join(HERE, sample.file)
        : resolve(sample.file);
      const mimeType = MIME[extname(path).toLowerCase()];
      if (!mimeType || !existsSync(path)) {
        console.log(`✗ ${sample.file}: không đọc được tệp (chỉ nhận jpg/png/webp)`);
        continue;
      }
      const started = Date.now();
      try {
        const reading = await reader.read({ image: readFileSync(path), mimeType });
        const decision = decideFromReading(reading, today);
        const outcome = decision.status === 'rejected' ? `rejected:${decision.reason}` : 'verified';
        const ok = sample.expect === '?' || outcome === sample.expect;
        if (ok) matched += 1;
        console.log(
          `${ok ? '✓' : '✗'} ${sample.file} → ${outcome}${sample.expect !== '?' ? ` (mong đợi ${sample.expect})` : ''} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
        console.log(
          `    ${reading.documentKind}/${reading.side} · tin cậy ${reading.confidence} · ` +
            `số ${decision.fields.licenceNumber ?? '—'} · ${decision.fields.fullName ?? '—'} · ` +
            `sinh ${decision.fields.dateOfBirth ?? '—'} · hạng ${decision.fields.classes.join(',') || '—'} · ` +
            `cấp ${decision.fields.issuedOn ?? '—'} · hết hạn ${decision.fields.noExpiry ? 'không thời hạn' : (decision.fields.expiresOn ?? '—')} · ` +
            `ô tô ${decision.fields.coversCar ? 'có' : 'không'} / xe máy ${decision.fields.coversMotorbike ? 'có' : 'không'}`,
        );
        if (reading.qualityIssues.length) {
          console.log(`    chất lượng: ${reading.qualityIssues.join(', ')}`);
        }
        if (reading.notes) console.log(`    ghi chú: ${reading.notes}`);
      } catch (error) {
        const code = error instanceof DriverLicenceReaderError ? error.code : 'UNKNOWN';
        console.log(`✗ ${sample.file}: bộ đọc hỏng (${code}) — ${(error as Error).message}`);
      }
    }
  } finally {
    await reader.dispose();
  }
  console.log(`\nKhớp ${matched}/${targets.length}`);
  if (matched < targets.length) process.exitCode = 1;
}

void main();
