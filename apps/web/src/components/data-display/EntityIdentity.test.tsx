import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { initialOf } from '@/lib/initials';

import { EntityIdentity } from './EntityIdentity';

afterEach(cleanup);

describe('initialOf — gom 9 bản chép tay', () => {
  it('lấy chữ cái đầu và viết hoa', () => {
    expect(initialOf('honda')).toBe('H');
  });

  it('bỏ khoảng trắng đầu', () => {
    expect(initialOf('  Chủ shop demo')).toBe('C');
  });

  it('giữ dấu tiếng Việt', () => {
    expect(initialOf('Đặng Văn A')).toBe('Đ');
  });

  it('rỗng / null / undefined / toàn khoảng trắng đều ra "?"', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
    expect(initialOf(null)).toBe('?');
    expect(initialOf(undefined)).toBe('?');
  });

  it('không cắt đôi ký tự ngoài BMP', () => {
    // `'🚗Xe'.charAt(0)` trả về nửa surrogate — ký tự hỏng. Đây là lý do dùng [...value].
    expect(initialOf('🚗Xe')).toBe('🚗');
  });
});

describe('EntityIdentity — nhãn', () => {
  it('hiện nhãn chính', () => {
    render(<EntityIdentity name="Honda SH 150i 2023" />);

    expect(screen.getByText('Honda SH 150i 2023')).toBeTruthy();
  });

  it('hiện nhãn phụ khi có', () => {
    render(<EntityIdentity name="Honda SH" subtitle="XM-001 · 59X1-333.44" />);

    expect(screen.getByText('XM-001 · 59X1-333.44')).toBeTruthy();
  });

  it('không có nhãn phụ thì không dựng dòng rỗng', () => {
    const { container } = render(<EntityIdentity name="Honda SH" />);

    expect(container.textContent).toBe('HHonda SH');
  });
});

describe('EntityIdentity — ảnh, chữ cái đầu, icon dự phòng', () => {
  it('có ảnh thì render ảnh', () => {
    const { container } = render(
      <EntityIdentity name="Honda SH" kind="vehicle" imageUrl="https://cdn.test/xe.png" />,
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.test/xe.png');
  });

  it('không có ảnh nhưng có tên → chữ cái đầu', () => {
    render(<EntityIdentity name="Chủ shop demo" />);

    expect(screen.getByText('C')).toBeTruthy();
  });

  it('không có ảnh và tên không phải chuỗi → icon dự phòng theo loại', () => {
    const { container } = render(<EntityIdentity name={<span>Ẩn danh</span>} kind="vehicle" />);

    expect(container.querySelector('.anticon-car')).toBeTruthy();
  });

  it('initialSource dùng khi nhãn chính không phải chuỗi', () => {
    render(<EntityIdentity name={<em>Honda SH</em>} initialSource="Honda SH" />);

    expect(screen.getByText('H')).toBeTruthy();
  });

  it('icon dự phòng khác nhau theo ba loại thực thể', () => {
    const { container: person } = render(<EntityIdentity name={<i>a</i>} kind="person" />);
    expect(person.querySelector('.anticon-user')).toBeTruthy();

    cleanup();
    const { container: vehicle } = render(<EntityIdentity name={<i>a</i>} kind="vehicle" />);
    expect(vehicle.querySelector('.anticon-car')).toBeTruthy();

    cleanup();
    const { container: shop } = render(<EntityIdentity name={<i>a</i>} kind="shop" />);
    expect(shop.querySelector('.anticon-shop')).toBeTruthy();
  });
});

describe('EntityIdentity — hình dạng và cỡ', () => {
  it('người là hình tròn', () => {
    const { container } = render(<EntityIdentity name="An" kind="person" />);

    expect(container.querySelector('.ant-avatar-circle')).toBeTruthy();
  });

  it('xe và gian hàng là hình vuông', () => {
    const { container: vehicle } = render(<EntityIdentity name="Xe" kind="vehicle" />);
    expect(vehicle.querySelector('.ant-avatar-square')).toBeTruthy();

    cleanup();
    const { container: shop } = render(<EntityIdentity name="Shop" kind="shop" />);
    expect(shop.querySelector('.ant-avatar-square')).toBeTruthy();
  });

  it('ba bậc cỡ cho ra ba kích thước khác nhau', () => {
    const sizeOf = (size: 'sm' | 'md' | 'lg') => {
      cleanup();
      const { container } = render(<EntityIdentity name="An" size={size} />);
      return (container.querySelector('.ant-avatar') as HTMLElement | null)?.style.width;
    };

    const sm = sizeOf('sm');
    const md = sizeOf('md');
    const lg = sizeOf('lg');

    expect(new Set([sm, md, lg]).size).toBe(3);
    expect(md).toBe('44px');
  });
});

describe('EntityIdentity — khả truy cập', () => {
  it('avatar chữ-cái bị ẩn khỏi trình đọc màn hình vì tên đã nằm ngay cạnh', () => {
    const { container } = render(<EntityIdentity name="Chủ shop demo" />);

    const avatar = container.querySelector('.ant-avatar');
    expect(avatar?.getAttribute('aria-hidden')).toBe('true');
  });

  it('avatar có ảnh nhận alt rỗng — ảnh minh hoạ, không mang thông tin mới', () => {
    const { container } = render(
      <EntityIdentity name="Honda SH" imageUrl="https://cdn.test/x.png" />,
    );

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('không sinh ra text trùng lặp cho trình đọc màn hình', () => {
    render(<EntityIdentity name="Chủ shop demo" />);

    // Chữ "C" của avatar bị aria-hidden, nên tên chỉ được đọc một lần.
    expect(screen.getAllByText('Chủ shop demo')).toHaveLength(1);
  });
});
