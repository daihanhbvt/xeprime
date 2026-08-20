import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PERMISSION, type Permission } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupportCenter } from './SupportCenter';

/**
 * Trung tâm hỗ trợ — điểm đến của khối HỖ trợ ở cuối sidebar.
 *
 * Hai điều bộ này giữ: **không dẫn ai vào 403** (thẻ hướng dẫn lọc theo đúng quyền của trang
 * nó trỏ tới) và **không hứa suông** (không có form gửi ticket hay hotline nào, vì backend
 * chưa có kênh hỗ trợ).
 */

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

beforeEach(() => {
  grant(
    PERMISSION.TENANT_VIEW,
    PERMISSION.VEHICLE_CREATE,
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.CALENDAR_VIEW,
    PERMISSION.FINANCE_VIEW,
    PERMISSION.MEMBER_VIEW,
  );
});

afterEach(cleanup);

describe('SupportCenter — hướng dẫn nhanh', () => {
  it('mỗi thẻ là link thật tới một trang có sẵn trong cổng quản lý', () => {
    render(<SupportCenter />);

    expect(screen.getByRole('link', { name: /Thêm xe cho thuê/ }).getAttribute('href')).toBe(
      '/manage/vehicles/new',
    );
    expect(screen.getByRole('link', { name: /Duyệt yêu cầu đặt xe/ }).getAttribute('href')).toBe(
      '/manage/booking-requests',
    );
  });

  it('lọc theo quyền — không dẫn người dùng vào trang họ sẽ nhận 403', () => {
    grant(PERMISSION.TENANT_VIEW);
    render(<SupportCenter />);

    expect(screen.queryByRole('link', { name: /Thêm xe cho thuê/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Mời nhân viên/ })).toBeNull();
    // Chính sách thuê chỉ cần `tenant.view` nên vẫn còn.
    expect(screen.getByRole('link', { name: /Đặt chính sách thuê/ })).toBeTruthy();
  });

  it('không quyền nào → bỏ hẳn khối hướng dẫn, KHÔNG để lại tiêu đề rỗng', () => {
    grant();
    render(<SupportCenter />);

    expect(screen.queryByText('Bắt đầu nhanh')).toBeNull();
    // Câu hỏi thường gặp thì ai cũng đọc được — nó không dẫn tới trang nào.
    expect(screen.getByText('Câu hỏi thường gặp')).toBeTruthy();
  });
});

describe('SupportCenter — câu hỏi thường gặp', () => {
  it('trả lời đúng hai câu mà cấu trúc menu cũ làm người dùng bối rối', () => {
    render(<SupportCenter />);

    fireEvent.click(screen.getByText('Yêu cầu đặt xe khác đơn thuê thế nào?'));
    expect(screen.getByText(/chưa chiếm lịch của xe/)).toBeTruthy();

    fireEvent.click(screen.getByText('Bảo dưỡng xe nằm ở đâu?'));
    expect(screen.getByText(/theo dõi cả đội xe/)).toBeTruthy();
  });

  it('KHÔNG dựng form gửi yêu cầu hay số hotline — backend chưa có kênh nào', () => {
    render(<SupportCenter />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /gửi/i })).toBeNull();
  });
});
