import { describe, expect, it } from 'vitest';
import { currentPathWithQuery, isSafeNextPath, safeNextPath, withNext } from './safe-next';

/**
 * `next` là dữ liệu từ URL, tức là dữ liệu của kẻ tấn công. Bộ test này khoá lại đúng một điều:
 * không có chuỗi nào biến `next` thành đường dẫn ra ngoài domain (open redirect).
 */
describe('isSafeNextPath', () => {
  it('chấp nhận đường dẫn nội bộ tuyệt đối', () => {
    expect(isSafeNextPath('/trips')).toBe(true);
    expect(isSafeNextPath('/manage/admin/tenants?status=active')).toBe(true);
    expect(isSafeNextPath('/listings/01H?from=home#top')).toBe(true);
  });

  it('từ chối URL tuyệt đối có scheme', () => {
    expect(isSafeNextPath('https://evil.example')).toBe(false);
    expect(isSafeNextPath('http://evil.example/path')).toBe(false);
    expect(isSafeNextPath('javascript:alert(1)')).toBe(false);
    expect(isSafeNextPath('data:text/html,<script>')).toBe(false);
  });

  it('từ chối protocol-relative URL — trình duyệt hiểu là host khác', () => {
    expect(isSafeNextPath('//evil.example')).toBe(false);
    expect(isSafeNextPath('//evil.example/trips')).toBe(false);
  });

  it('từ chối biến thể dùng dấu gạch ngược', () => {
    expect(isSafeNextPath('/\\evil.example')).toBe(false);
    expect(isSafeNextPath('\\\\evil.example')).toBe(false);
  });

  it('từ chối đường dẫn tương đối và chuỗi rỗng/null', () => {
    expect(isSafeNextPath('trips')).toBe(false);
    expect(isSafeNextPath('../manage')).toBe(false);
    expect(isSafeNextPath('')).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(undefined)).toBe(false);
  });

  it('từ chối chuỗi có ký tự điều khiển/khoảng trắng (dùng để lách bộ lọc)', () => {
    expect(isSafeNextPath('/\n//evil.example')).toBe(false);
    expect(isSafeNextPath(' //evil.example')).toBe(false);
    expect(isSafeNextPath('/trips ')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('trả fallback khi next không an toàn', () => {
    expect(safeNextPath('//evil.example', '/')).toBe('/');
    expect(safeNextPath(null, '/manage')).toBe('/manage');
    expect(safeNextPath('/trips', '/')).toBe('/trips');
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
