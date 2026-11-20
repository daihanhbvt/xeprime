import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CURRENCY_SUFFIX } from '@xeprime/domain';
import { MoneyInput } from './MoneyInput';

/*
 * Ô tiền rộng hết cột mặc định — bề rộng phải nằm ở lớp NGOÀI CÙNG (lớp bọc hậu tố ₫), không thì
 * `.ant-input-number { width: 90px }` của AntD vẫn bóp ô lại (hộp "Ghi nhận phát sinh", 20/11/2026).
 */
describe('MoneyInput', () => {
  it('rộng hết cột ở lớp ngoài cùng', () => {
    const { container } = render(<MoneyInput value={null} />);
    const root = container.firstElementChild as HTMLElement;
    // Lớp ngoài cùng là lớp chứa cả hậu tố ₫, không phải ô input bên trong.
    expect(root.textContent).toContain(CURRENCY_SUFFIX);
    expect(root.style.width).toBe('100%');
  });

  it('nơi cần hẹp vẫn truyền style riêng được', () => {
    const { container } = render(<MoneyInput value={null} style={{ width: 160 }} />);
    expect((container.firstElementChild as HTMLElement).style.width).toBe('160px');
  });
});
