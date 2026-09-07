import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEnv } from '../src/config/env.schema';

/**
 * `.env.example` phải là một bộ env HỢP LỆ, không chỉ là tài liệu.
 *
 * Vì sao: `.github/workflows/ci.yml` chạy `cp .env.example .env` rồi test API bằng chính file
 * đó. Nên mỗi biến thêm vào file mẫu là một biến đi thẳng vào `validateEnv` của CI — một dòng
 * `SEPAY_API_KEY=` bỏ trống từng làm 6 suite đỏ với câu "Too small: expected string to have >=16
 * characters", trong khi ở máy dev (không có biến đó) mọi thứ xanh.
 *
 * Test này là chỗ RẺ NHẤT để bắt điều đó: nó chạy trong vài mili-giây, không cần DB, và nó hỏng
 * ngay khi ai đó thêm một placeholder rỗng vào một biến có ràng buộc.
 */

/** Đọc `.env.example` theo đúng luật dotenv tối thiểu: bỏ comment, tách `KEY=VALUE` ở dấu `=` đầu. */
function parseEnvExample(): Record<string, string> {
  const path = resolve(__dirname, '../../../.env.example');
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    // Bỏ nháy bao quanh — dotenv coi `"a"` và `a` như nhau.
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["'](.*)["']$/, '$1');
    out[key] = value;
  }
  return out;
}

describe('.env.example — bộ env mẫu phải hợp lệ', () => {
  it('parse được và có các biến bắt buộc', () => {
    const env = parseEnvExample();

    expect(Object.keys(env).length).toBeGreaterThan(20);
    expect(env.DATABASE_URL).toBeTruthy();
    expect(env.SESSION_JWT_SECRET).toBeTruthy();
  });

  it('đi qua `validateEnv` y như CI làm (`cp .env.example .env`)', () => {
    expect(() => validateEnv(parseEnvExample())).not.toThrow();
  });

  /**
   * Placeholder RỖNG là cách khai "chưa cấu hình" trong file mẫu — và toàn hệ thống đọc nó theo
   * nghĩa đó (`superRefine` dùng `Boolean(env[key])`, `kv()` trong deploy.yml bỏ qua giá trị
   * rỗng). Biến nào có ràng buộc độ dài/định dạng thì phải tự coi rỗng là chưa khai, không được
   * để zod đánh trượt cả bộ env.
   */
  it('mọi biến để trống trong file mẫu đều được hiểu là "chưa cấu hình"', () => {
    const env = parseEnvExample();
    const blanks = Object.entries(env)
      .filter(([, value]) => value === '')
      .map(([key]) => key);

    // Chính file mẫu phải còn placeholder rỗng — hết sạch nghĩa là test này không còn canh gì.
    expect(blanks.length).toBeGreaterThan(0);
    expect(() => validateEnv(env)).not.toThrow();
  });

  it('SEPAY_API_KEY rỗng = chưa khai, nhưng khoá THẬT vẫn phải đủ 16 ký tự', () => {
    const base = parseEnvExample();

    expect(validateEnv({ ...base, SEPAY_API_KEY: '' }).SEPAY_API_KEY).toBeUndefined();

    // Khoá ngắn vẫn bị chặn — nới cho chuỗi rỗng KHÔNG được nới luôn cho khoá yếu.
    expect(() =>
      validateEnv({
        ...base,
        SEPAY_API_KEY: 'short',
        SEPAY_BANK_CODE: 'VCB',
        SEPAY_ACCOUNT_NUMBER: '0123456789',
        SEPAY_ACCOUNT_NAME: 'XE PRIME',
      }),
    ).toThrow(/SEPAY_API_KEY/);
  });
});
