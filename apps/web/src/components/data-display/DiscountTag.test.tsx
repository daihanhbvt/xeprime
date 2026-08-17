import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscountTag } from './DiscountTag';

describe('DiscountTag', () => {
  it('chuẩn hoá phần trăm về dạng -X% và có tên dễ hiểu cho trình đọc màn hình', () => {
    render(<DiscountTag percent={-6} />);
    expect(screen.getByLabelText('Giảm 6%').textContent).toBe('-6%');
  });
});
