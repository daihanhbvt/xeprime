import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeTripReturn, nativeTripHref } from './NativeTripReturn';

/** Trang quay về công khai cho app native — không gọi API, chỉ chuyển sang deep link hợp lệ. */
const TRIP = '01JTESTXRP0000000000000000';
const replace = vi.fn();

beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, replace });
});
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('nativeTripHref', () => {
  it('chỉ nhận ULID 26 ký tự', () => {
    expect(nativeTripHref(TRIP)).toBe(`xeprime://trips/${TRIP}`);
    expect(nativeTripHref('abc')).toBeNull();
    expect(nativeTripHref(`${TRIP.slice(0, 25)}I`)).toBeNull();
    expect(nativeTripHref('../../evil?x=1&y=00000000000')).toBeNull();
    expect(nativeTripHref(null)).toBeNull();
  });
});

describe('NativeTripReturn', () => {
  it('id hợp lệ: tự chuyển sang app và hiện nút mở lại', () => {
    render(<NativeTripReturn tripId={TRIP} />);
    expect(replace).toHaveBeenCalledWith(`xeprime://trips/${TRIP}`);
    const link = screen.getByRole('link', { name: 'Mở lại ứng dụng XePrime' });
    expect(link.getAttribute('href')).toBe(`xeprime://trips/${TRIP}`);
  });

  it('id không hợp lệ: không điều hướng, mời về trang chủ', () => {
    render(<NativeTripReturn tripId="bad" />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('Đường dẫn quay về ứng dụng không hợp lệ.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Mở lại ứng dụng XePrime' })).toBeNull();
  });
});
