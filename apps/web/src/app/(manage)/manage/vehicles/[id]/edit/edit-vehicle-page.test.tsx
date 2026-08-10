import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, type Permission } from '@xeprime/types';

import { ApiClientError } from '@/services/api-client';
import type { VehicleDetail } from '@/features/vehicles/types';

import EditVehiclePage from './page';

/**
 * `/manage/vehicles/[id]/edit` — sửa xe.
 *
 * Trọng tâm: quyền, nạp đúng giá trị đang có, và **không đánh mất media** khi lưu mà không đụng
 * tới ảnh. Đây là chỗ dễ mất dữ liệu nhất của cả luồng Fleet.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useParams: () => ({ id: 'v1' }),
  usePathname: () => '/manage/vehicles/v1/edit',
  useSearchParams: () => new URLSearchParams(),
}));

const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  /** id mà trang thực sự yêu cầu — `undefined` nghĩa là trang cố ý không gọi API. */
  requestedId: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: (id: string | undefined) => {
    detail.requestedId = id;
    return detail;
  },
}));

const update = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => update,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

vi.mock('@/services/upload', () => ({
  presignVehicleImage: vi.fn(),
  uploadImage: vi.fn(),
  validateImageFile: () => null,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function vehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: 'v1',
    code: 'XE-014',
    name: 'Ford Transit 2021',
    plateNumber: '51B-802.46',
    vehicleType: 'car',
    serviceType: 'self_drive',
    operationStatus: 'available',
    publicStatus: 'approved_public',
    brand: 'Ford',
    model: 'Transit',
    color: 'Trắng',
    fuelType: 'diesel',
    bodyType: 'van',
    manufactureYear: 2021,
    seatCount: 16,
    weekdayPrice: '1800000',
    weekendPrice: '2000000',
    hourlyPrice: null,
    deliveryEnabled: true,
    noCollateral: false,
    discountPercent: null,
    description: 'Xe 16 chỗ đời 2021.',
    mainImageUrl: 'https://cdn.test/main.jpg',
    images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
    features: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as VehicleDetail;
}

/**
 * Lỗi API **thật** chứ không phải một `Error` tự chế: `getErrorCode` chỉ đọc `code` từ
 * `ApiClientError`, nên lớp giả sẽ luôn rơi vào nhánh lỗi chung và test 404 mất hết ý nghĩa.
 */
function apiError(message: string, code: string, status = 400) {
  return new ApiClientError({ code, message, status });
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_UPDATE, ...permissions]);
}

function revokeAll() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <EditVehiclePage />
    </App>,
  );
}

function saveForm() {
  fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
}

function lastPayload(): Record<string, unknown> {
  const calls = update.mutate.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  update.mutate.mockReset();
  update.isPending = false;
  update.isError = false;
  update.error = undefined;
  detail.data = vehicle();
  detail.isLoading = false;
  detail.isError = false;
  detail.error = undefined;
  detail.refetch.mockReset();
  detail.requestedId = undefined;
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ quyền */

describe('/manage/vehicles/[id]/edit — quyền', () => {
  it('không có `vehicles.update`: màn 403 thay toàn bộ trang (Figma `62:893`)', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText('Không có quyền sửa xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lưu thay đổi/ })).toBeNull();
  });

  it('không có quyền sửa thì KHÔNG gọi API chi tiết', () => {
    revokeAll();
    renderPage();

    expect(detail.requestedId).toBeUndefined();
  });

  it('có quyền sửa: trang yêu cầu đúng id trên URL', () => {
    renderPage();
    expect(detail.requestedId).toBe('v1');
  });
});

/* ------------------------------------------------------------------ nạp dữ liệu */

describe('/manage/vehicles/[id]/edit — nạp dữ liệu', () => {
  it('đang tải: hiện trạng thái tải dùng chung, chưa dựng form', () => {
    detail.data = undefined;
    detail.isLoading = true;
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lưu thay đổi/ })).toBeNull();
  });

  it('lỗi tải: có nút thử lại và nút về danh sách', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Lỗi mạng', 'INTERNAL', 500);
    renderPage();

    expect(screen.getByText('Không tải được thông tin xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy: KHÔNG mời thử lại — 404 thử lại là ngõ cụt', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Không tìm thấy', API_ERROR_CODE.NOT_FOUND, 404);
    renderPage();

    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Về danh sách' })).toBeTruthy();
  });

  it('giá trị đang có được nạp đúng vào form', () => {
    renderPage();

    expect((screen.getByLabelText(/Mã quản lý xe/) as HTMLInputElement).value).toBe('XE-014');
    expect((screen.getByLabelText(/Tên xe hiển thị/) as HTMLInputElement).value).toBe(
      'Ford Transit 2021',
    );
    expect((screen.getByLabelText(/Biển số xe/) as HTMLInputElement).value).toBe('51B-802.46');
  });

  it('tiêu đề trang nói rõ đang sửa xe nào', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Sửa: Ford Transit 2021' })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ payload */

describe('/manage/vehicles/[id]/edit — payload cập nhật', () => {
  it('lưu mà không đụng ảnh: media cũ được gửi lại NGUYÊN VẸN', async () => {
    renderPage();
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));

    const payload = lastPayload();
    expect(payload.mainImageUrl).toBe('https://cdn.test/main.jpg');
    expect(payload.images).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
  });

  it('các giá trị không đổi giữ nguyên, không bị chuẩn hoá thành rỗng', async () => {
    renderPage();
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));

    const payload = lastPayload();
    expect(payload.code).toBe('XE-014');
    expect(payload.plateNumber).toBe('51B-802.46');
    expect(payload.brand).toBe('Ford');
    expect(payload.manufactureYear).toBe(2021);
    expect(payload.seatCount).toBe(16);
    expect(payload.deliveryEnabled).toBe(true);
  });

  it('tiền vẫn là chuỗi trong payload (ADR 0007), không phải number', async () => {
    renderPage();
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload().weekdayPrice).toBe('1800000');
  });

  it('sửa một trường thì payload mang giá trị MỚI', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe hiển thị/), {
      target: { value: 'Ford Transit 2022' },
    });
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload().name).toBe('Ford Transit 2022');
  });

  it('KHÔNG gửi `publicStatus` — sửa xe không được tự đổi trạng thái duyệt', async () => {
    renderPage();
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload()).not.toHaveProperty('publicStatus');
  });
});

/* ------------------------------------------------------------------ gửi + điều hướng */

describe('/manage/vehicles/[id]/edit — gửi và điều hướng', () => {
  it('đang lưu thì bấm lại KHÔNG tạo lời gọi thứ hai', async () => {
    const { rerender } = renderPage();
    saveForm();
    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));

    update.isPending = true;
    rerender(
      <App>
        <EditVehiclePage />
      </App>,
    );
    saveForm();

    await Promise.resolve();
    expect(update.mutate).toHaveBeenCalledTimes(1);
  });

  it('lỗi API hiện trong form, giá trị người dùng vừa nhập không bị mất', () => {
    update.isError = true;
    update.error = new Error('Biển số đã tồn tại');
    renderPage();

    expect(screen.getByText('Biển số đã tồn tại')).toBeTruthy();
    expect((screen.getByLabelText(/Mã quản lý xe/) as HTMLInputElement).value).toBe('XE-014');
  });

  it('lưu xong: quay lại trang chi tiết bằng `replace`', async () => {
    renderPage();
    saveForm();

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const options = update.mutate.mock.calls[0]![1] as { onSuccess: (v: unknown) => void };
    options.onSuccess(vehicle());

    expect(nav.replace).toHaveBeenCalledWith('/manage/vehicles/v1');
  });

  it('huỷ: về chi tiết, KHÔNG gọi API cập nhật', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bỏ' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1');
    expect(update.mutate).not.toHaveBeenCalled();
  });
});
