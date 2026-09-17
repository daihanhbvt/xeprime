import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PERMISSION, SERVICE_TYPE } from '@xeprime/types';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import viMessages from '@/../messages/vi';

/**
 * TỐI ƯU NHẬN CHUYẾN CHO XE GIAN HÀNG — lỗ hổng được vá ngày 17/09/2026.
 *
 * Thiết lập tự động nhận chuyến chỉ có ở bề mặt chủ xe tuyến hoa hồng
 * (`/account/vehicles/{id}/manage/.../optimization`). Gian hàng quản xe ở `/manage/vehicles`, nơi
 * chỉ có `edit` + `pricing` — nên **không có đường nào bật "Đặt ngay" cho xe gian hàng**, dù
 * server vẫn đọc đúng cờ đó cho cả hai tuyến. Kết quả: mọi chuyến của gian hàng đều dừng ở "chờ
 * chủ xe duyệt" kể cả khi họ muốn nhận tự động.
 *
 * Ba điều được khoá ở đây, và cái thứ ba là cái dễ trượt nhất:
 *
 *  1. Xe phục vụ nhiều dịch vụ ⇒ có tab cho TỪNG dịch vụ;
 *  2. Xe chỉ một dịch vụ ⇒ KHÔNG bày tab (một tab đơn độc là một lựa chọn giả);
 *  3. Xe chỉ cho thuê DÀI HẠN ⇒ nói rõ không có gì để cấu hình, thay vì một form không tác dụng
 *     (ADR 0011: dài hạn luôn do gian hàng chốt lịch tay).
 */
const params = vi.hoisted(() => ({ value: { id: 'V1' } as Record<string, string> }));
vi.mock('next/navigation', () => ({ useParams: () => params.value }));

const perms = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: (p: string) => perms.list.includes(p) }),
}));

const vehicle = vi.hoisted(() => ({
  data: undefined as unknown,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({ useVehicle: () => vehicle }));

/**
 * `AutoAcceptSection` được thay bằng một nhãn: ca này kiểm VỎ (quyền, tab, ca rỗng), còn chính
 * form đã có spec riêng ở `vehicle-manage-sections.test.tsx`. Dựng cả form thật ở đây là chạy
 * lại một bộ test đã có, và mỗi lần form đổi là hai chỗ đỏ.
 */
vi.mock('@/features/vehicle-manage/components/sections/AutoAcceptSection', () => ({
  AutoAcceptSection: ({ serviceType }: { serviceType: string }) => (
    <div data-testid="auto-accept">{serviceType}</div>
  ),
}));

import Page from './page';

function renderPage() {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <Page />
    </NextIntlClientProvider>,
  );
}

const VEHICLE = {
  id: 'V1',
  name: 'Kia Seltos 2022',
  plateNumber: '43A-123.45',
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
};

describe('Trang tối ưu nhận chuyến của xe gian hàng', () => {
  beforeEach(() => {
    perms.list = [PERMISSION.VEHICLE_VIEW, PERMISSION.VEHICLE_UPDATE];
    vehicle.data = VEHICLE;
    vehicle.isError = false;
  });

  it('xe phục vụ hai dịch vụ ⇒ một tab cho mỗi dịch vụ', () => {
    renderPage();

    expect(screen.getByText('Tối ưu nhận chuyến')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tự lái' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Có tài xế' })).toBeTruthy();
  });

  it('xe một dịch vụ ⇒ KHÔNG bày tab, vào thẳng thiết lập', () => {
    vehicle.data = { ...VEHICLE, serviceTypes: [SERVICE_TYPE.SELF_DRIVE] };
    renderPage();

    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByTestId('auto-accept').textContent).toBe(SERVICE_TYPE.SELF_DRIVE);
  });

  /**
   * Dài hạn KHÔNG có thiết lập riêng (ADR 0011) — bày một form ở đây là hứa một công tắc không
   * bao giờ có tác dụng.
   */
  it('xe chỉ cho thuê dài hạn ⇒ nói rõ không có gì cấu hình, không dựng form', () => {
    vehicle.data = { ...VEHICLE, serviceTypes: [SERVICE_TYPE.LONG_TERM] };
    renderPage();

    expect(screen.queryByTestId('auto-accept')).toBeNull();
    expect(screen.getByText(/chưa bật dịch vụ nào có thiết lập riêng/i)).toBeTruthy();
  });

  it('thiếu quyền xem ⇒ chặn hẳn, không gọi dữ liệu xe', () => {
    perms.list = [];
    renderPage();

    expect(screen.queryByTestId('auto-accept')).toBeNull();
    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
  });
});
