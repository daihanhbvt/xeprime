import { describe, expect, it } from 'vitest';
import { currentPathWithQuery, isSafeNextPath, safeNextPath, withNext } from './safe-next';

/**
 * Luật chống open redirect được test đầy đủ ở `@xeprime/domain/src/safe-path.test.ts` — nó là
 * chủ sở hữu từ ADR 0019. Ở đây chỉ khoá hai thứ mà chỉ web có: dựng URL, và việc shim thật sự
 * re-export ra đúng hàm (một shim xuất nhầm là bộ lọc biến mất im lặng).
 */
describe('safe-next re-export', () => {
  it('xuất đúng hàm kiểm của @xeprime/domain', () => {
    expect(isSafeNextPath('/trips')).toBe(true);
    expect(isSafeNextPath('//evil.example')).toBe(false);
    expect(safeNextPath('//evil.example', '/')).toBe('/');
  });
});

describe('withNext', () => {
  it('gắn next đã encode, bỏ qua next không hợp lệ', () => {
    expect(withNext('/manage/login', '/manage/admin')).toBe(
      '/manage/login?next=%2Fmanage%2Fadmin',
    );
    expect(withNext('/manage/login?intent=owner', '/manage/onboarding')).toBe(
      '/manage/login?intent=owner&next=%2Fmanage%2Fonboarding',
    );
    expect(withNext('/manage/login', 'https://evil.example')).toBe('/manage/login');
  });
});

describe('currentPathWithQuery', () => {
  it('ghép query khi có, giữ nguyên pathname khi không', () => {
    expect(currentPathWithQuery('/listings/1', 'from=home')).toBe('/listings/1?from=home');
    expect(currentPathWithQuery('/trips', '')).toBe('/trips');
  });
});
