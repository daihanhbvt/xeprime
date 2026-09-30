import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Một font cho TOÀN APP — và chỗ dễ trôi nhất là những chỗ React Native KHÔNG thừa kế font.
 *
 * `tamagui.config` đặt `defaultProps.Text.fontFamily`, nhưng nó chỉ với tới component chữ CỦA
 * TAMAGUI. Ba loại nằm ngoài tầm với đó:
 *   1. `TextInput` — RN không có khái niệm font kế thừa như CSS;
 *   2. `Text` thô của `react-native`;
 *   3. nhãn do `react-navigation` vẽ (`tabBarLabelStyle`).
 *
 * Cả ba đều hỏng ÂM THẦM: chữ vẫn hiện, chỉ là sai họ chữ, và chỉ lộ ra khi đặt cạnh một chỗ
 * khai đúng. Bài test này quét mã nguồn để một màn mới thêm vào không lặng lẽ tụt lại.
 */
const ROOTS = ['src', 'app'];

/**
 * Ô nhập KHÔNG vẽ chữ nào thì không cần font.
 *
 * `OtpCodeInput` có một `TextInput` phủ trong suốt (`opacity: 0`) — sáu ô số người dùng nhìn
 * thấy là `Text` của Tamagui, và chúng đã nhận font mặc định.
 */
const EXEMPT = new Set(['src/features/phone-verification/components/OtpCodeInput.tsx']);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

const files = ROOTS.flatMap((root) => sourceFiles(root)).map((path) => ({
  path: path.split(sep).join('/'),
  source: readFileSync(path, 'utf8'),
}));

describe('phủ font toàn app', () => {
  it('có tìm thấy mã nguồn để quét', () => {
    // Chặn trường hợp bài test tự vô hiệu hoá vì đường dẫn đổi — khi đó nó xanh mà không kiểm gì.
    expect(files.length).toBeGreaterThan(50);
  });

  it('mọi `TextInput` được vẽ ra đều khai `fontFamily`', () => {
    const missing = files
      .filter(({ path, source }) => !EXEMPT.has(path) && source.includes('<TextInput'))
      .filter(({ source }) => !source.includes('FONT_FAMILY'))
      .map(({ path }) => path);

    expect(missing).toEqual([]);
  });

  it('mọi `Text` thô của react-native đều khai `fontFamily`', () => {
    const missing = files
      .filter(({ source }) => /\bText as RNText\b/.test(source))
      .filter(({ source }) => !source.includes('FONT_FAMILY'))
      .map(({ path }) => path);

    expect(missing).toEqual([]);
  });

  /** Nhãn tab do react-navigation vẽ, nằm NGOÀI cây Tamagui. */
  it('nhãn thanh tab khai `fontFamily`', () => {
    const missing = files
      .filter(({ source }) => source.includes('tabBarLabelStyle'))
      .filter(({ source }) => !source.includes('FONT_FAMILY'))
      .map(({ path }) => path);

    expect(missing).toEqual([]);
  });
});
