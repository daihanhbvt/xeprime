import { Button } from 'antd';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PermissionState } from './PermissionState';

afterEach(cleanup);

describe('PermissionState — nói rõ thiếu quyền', () => {
  it('mặc định là forbidden với câu chữ sẵn', () => {
    render(<PermissionState />);

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeTruthy();
    expect(screen.getByText('Liên hệ quản trị viên nếu bạn cần quyền cho mục này.')).toBeTruthy();
  });

  it('view-only nói khác forbidden', () => {
    render(<PermissionState kind="view-only" />);

    expect(screen.getByText('Bạn chỉ có quyền xem')).toBeTruthy();
    expect(screen.queryByText('Bạn không có quyền truy cập')).toBeNull();
  });

  it('ghi đè được tiêu đề và mô tả', () => {
    render(
      <PermissionState
        title="Không xem được nhật ký hệ thống"
        description="Chỉ quản trị nền tảng mới xem được."
      />,
    );

    expect(screen.getByText('Không xem được nhật ký hệ thống')).toBeTruthy();
    expect(screen.getByText('Chỉ quản trị nền tảng mới xem được.')).toBeTruthy();
  });

  it('nêu quyền còn thiếu khi người gọi biết (Figma 134:2482)', () => {
    render(<PermissionState missingPermissions={['vehicles.delete', 'vehicles.update']} />);

    expect(screen.getByText('Cần quyền: vehicles.delete, vehicles.update')).toBeTruthy();
  });

  it('không biết quyền thiếu thì không dựng khối rỗng', () => {
    render(<PermissionState missingPermissions={[]} />);

    expect(screen.queryByText(/Cần quyền/)).toBeNull();
  });

  it('nhận lối đi an toàn do người gọi cung cấp', () => {
    render(<PermissionState action={<Button>Quay về trang chủ</Button>} />);

    expect(screen.getByRole('button', { name: 'Quay về trang chủ' })).toBeTruthy();
  });

  it('KHÔNG tự dựng lối về đăng nhập — 403 nghĩa là đã đăng nhập rồi (134:2482)', () => {
    render(<PermissionState />);

    expect(screen.queryByText(/đăng nhập/i)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PermissionState — ranh giới bảo mật', () => {
  it('không nhận và không hiển thị dữ liệu của bản ghi bị từ chối', () => {
    // Hợp đồng chỉ có: kind, title, description, missingPermissions, action.
    // Không có khe nào cho dữ liệu bản ghi — người gọi không vô tình rò được.
    render(<PermissionState missingPermissions={['platform.customers.view_pii']} />);

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('platform.customers.view_pii');
    // Tên khoá quyền là siêu dữ liệu, không phải dữ liệu được bảo vệ.
    expect(text).not.toMatch(/\d{9,}/);
  });

  it('là khối chỉ-hiển-thị: không gọi hook quyền nào', () => {
    // Render trần, không có provider/permission context nào. Nếu component tự tra quyền thì
    // dòng này đã nổ.
    expect(() => render(<PermissionState kind="forbidden" />)).not.toThrow();
  });
});
