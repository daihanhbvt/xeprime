import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideFromReading } from '../src/modules/driver-licences/driver-licence-decision';
import { TesseractDriverLicenceReader } from '../src/modules/driver-licences/reader/tesseract-driver-licence-reader';

/**
 * Bộ đọc Tesseract THẬT trên bộ ảnh mẫu (ADR 0057 điều 2b) — ảnh → chữ → trường → quyết định.
 *
 * Không mạng, không khoá, không DB: Tesseract là WASM chạy tại chỗ, nên đây là test thường chứ
 * không phải công cụ thủ công. Đổi luật tách trường (`licence-text.ts`) hay cách xử lý ảnh mà làm
 * một mẫu đổi kết quả là đỏ ở đây. Kết quả mong đợi của từng ảnh nằm ở `samples.json` — CÙNG một
 * bảng với `pnpm --filter @xeprime/api licence:try`.
 */

interface Sample {
  file: string;
  expect: string;
  note: string;
}

const FIXTURES = join(__dirname, 'fixtures/driver-licences');
const SAMPLES = JSON.parse(readFileSync(join(FIXTURES, 'samples.json'), 'utf8')) as Sample[];
/** Ngày cố định: ảnh mẫu "còn hạn" hết hạn từ 2031, mẫu "hết hạn" hết hạn 2024. */
const TODAY = '2026-10-08';

const reader = new TesseractDriverLicenceReader();
afterAll(() => reader.dispose());

describe('TesseractDriverLicenceReader — bộ ảnh mẫu', () => {
  it.each(SAMPLES.map((s) => [s.file, s.expect, s.note] as const))(
    '%s ⇒ %s (%s)',
    async (file, expected) => {
      const reading = await reader.read({
        image: readFileSync(join(FIXTURES, file)),
        mimeType: 'image/jpeg',
      });
      const decision = decideFromReading(reading, TODAY);
      const outcome =
        decision.status === 'rejected' ? `rejected:${decision.reason}` : decision.status;
      expect(outcome).toBe(expected);
    },
    60_000,
  );

  it('tấm B2 chuẩn: đọc đúng từng trường, không chỉ đúng kết luận', async () => {
    const reading = await reader.read({
      image: readFileSync(join(FIXTURES, 'vn-pet-b2-valid.jpg')),
      mimeType: 'image/jpeg',
    });
    expect(reading).toMatchObject({
      documentKind: 'vn',
      side: 'front',
      licenceNumber: '790123456789',
      dateOfBirth: '1990-04-12',
      classes: ['B2'],
      expiresOn: '2031-03-15',
      issuedOn: '2021-03-15',
    });
  }, 60_000);

  it('ảnh nhoè ⇒ gợi ý "ảnh bị mờ" cho khách', async () => {
    const reading = await reader.read({
      image: readFileSync(join(FIXTURES, 'vn-pet-blurry.jpg')),
      mimeType: 'image/jpeg',
    });
    expect(reading.qualityIssues).toContain('blurry');
  }, 60_000);
});
