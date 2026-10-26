import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  META_DESCRIPTION_MAX_LENGTH,
  absoluteUrl,
  isIndexableDeployment,
  metaDescription,
  openGraphFor,
  serializeJsonLd,
  siteUrl,
} from './seo';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('siteUrl / absoluteUrl', () => {
  it('lấy gốc site khách đã khai', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'https://xeprime.vn/');
    expect(siteUrl().origin).toBe('https://xeprime.vn');
    expect(absoluteUrl('/listings/V1')).toBe('https://xeprime.vn/listings/V1');
  });

  it('giữ nguyên URL ảnh đã tuyệt đối', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'https://xeprime.vn');
    expect(absoluteUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('chưa khai hoặc khai sai thì lùi về localhost thay vì ném lỗi', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', '');
    expect(siteUrl().origin).toBe('http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'not a url');
    expect(siteUrl().origin).toBe('http://localhost:3000');
  });
});

describe('isIndexableDeployment', () => {
  it('production và thiếu biến đều được index', () => {
    vi.stubEnv('APP_ENV', 'production');
    expect(isIndexableDeployment()).toBe(true);
    vi.stubEnv('APP_ENV', '');
    expect(isIndexableDeployment()).toBe(true);
  });

  it('staging không được index', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(isIndexableDeployment()).toBe(false);
  });
});

describe('metaDescription', () => {
  it('gộp khoảng trắng, giữ nguyên câu ngắn', () => {
    expect(metaDescription('  Xe  đẹp\n\ngiá tốt ')).toBe('Xe đẹp giá tốt');
  });

  it('cắt ở ranh giới từ và không vượt trần', () => {
    const long = 'xe '.repeat(100);
    const result = metaDescription(long);
    expect(result.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(result.endsWith('xe…')).toBe(true);
  });
});

describe('openGraphFor', () => {
  it('bỏ ảnh rỗng và ảnh trùng', () => {
    const og = openGraphFor({ title: 'T', path: '/p', images: ['a.jpg', null, 'a.jpg', undefined] });
    expect(og.images).toEqual([{ url: 'a.jpg' }]);
    expect(og.url).toBe('/p');
  });
});

describe('serializeJsonLd', () => {
  it('thoát `<` để chuỗi người dùng không đóng được thẻ script', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
