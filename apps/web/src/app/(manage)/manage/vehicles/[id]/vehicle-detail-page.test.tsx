import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, type Permission } from '@xeprime/types';

import { ApiClientError } from '@/services/api-client';
import type { VehicleDetail } from '@/features/vehicles/types';

import VehicleDetailPage from './page';

/**
 * `/manage/vehicles/[id]` — chi tiết xe.
 *
 * Khẳng định trên hợp đồng: quyền nào mở hành động nào, trạng thái nào hiện ra, điều hướng đi đâu.
 * KHÔNG khẳng định trên bố cục hai cột (đó là chuyện của CSS, không phải nghiệp vụ).
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

// Danh mục lọc (hãng/kiểu dáng/nhiên liệu/tiện ích) tới từ API — test dùng bản cố định.
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useParams: () => ({ id: 'v1' }),
  usePathname: () => '/manage/vehicles/v1',
  useSearchParams: () => new URLSearchParams(),
}));

const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  requestedId: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: (id: string | undefined) => {
    detail.requestedId = id;
    return detail;
  },
}));

const deleteVehicle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const submitPublic = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useDeleteVehicle: () => deleteVehicle,
  useSubmitVehiclePublic: () => submitPublic,
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
    publicStatus: 'draft',
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
    images: [],
    features: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as VehicleDetail;
}

function apiError(message: string, code: string, status = 400) {
  return new ApiClientError({ code, message, status });
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_VIEW, ...permissions]);
}

function revokeAll() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <VehicleDetailPage />
    </App>,
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  deleteVehicle.mutate.mockReset();
  deleteVehicle.isPending = false;
  submitPublic.mutate.mockReset();
  submitPublic.isPending = false;
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

describe('/manage/vehicles/[id] — quyền', () => {
  it('không có `vehicles.view`: màn 403 và KHÔNG gọi API chi tiết', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText('Không có quyền xem xe')).toBeTruthy();
    expect(detail.requestedId).toBeUndefined();
  });

  it('màn 403 KHÔNG để lộ bất cứ thông tin nào của xe', () => {
    revokeAll();
    renderPage();

    expect(screen.queryByText('Ford Transit 2021')).toBeNull();
    expect(screen.queryByText('51B-802.46')).toBeNull();
  });

  it('chỉ có quyền xem: không có nút sửa, không có nút xoá', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá xe' })).toBeNull();
  });

  it('có quyền sửa: nút "Chỉnh sửa" dẫn tới đúng route sửa', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1/edit');
  });

  it('có quyền xoá: nút xoá chỉ-icon vẫn có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    expect(screen.getByRole('button', { name: 'Xoá xe' })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ trạng thái tải */

describe('/manage/vehicles/[id] — tải, lỗi, không tìm thấy', () => {
  it('đang tải: trạng thái tải dùng chung, chưa dựng nội dung', () => {
    detail.data = undefined;
    detail.isLoading = true;
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Thông tin chi tiết phương tiện')).toBeNull();
  });

  it('lỗi tải: có nút thử lại và gọi đúng refetch', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Lỗi máy chủ', 'INTERNAL', 500);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy: câu chữ riêng và KHÔNG mời thử lại', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Không tìm thấy', API_ERROR_CODE.NOT_FOUND, 404);
    renderPage();

    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
  });

  it('về danh sách từ màn lỗi', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Không tìm thấy', API_ERROR_CODE.NOT_FOUND, 404);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Về danh sách' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
  });
});

/* ------------------------------------------------------------------ nội dung */

describe('/manage/vehicles/[id] — nội dung hiển thị', () => {
  it('tiêu đề là tên xe, ở cấp heading của trang', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Ford Transit 2021' })).toBeTruthy();
  });

  it('hiện CẢ HAI trục trạng thái — vận hành và public', () => {
    renderPage();

    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
    expect(screen.getByText('Nháp')).toBeTruthy();
  });

  it('thông số kỹ thuật hiện đúng giá trị đang lưu', () => {
    renderPage();

    expect(screen.getByText('XE-014')).toBeTruthy();
    expect(screen.getByText('51B-802.46')).toBeTruthy();
    expect(screen.getByText('Ford')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
  });

  it('tiền hiển thị qua bộ format, không phải số thô', () => {
    renderPage();

    expect(screen.getByText('1.800.000 ₫')).toBeTruthy();
    expect(screen.queryByText('1800000')).toBeNull();
  });

  it('có giảm giá: hiện thêm giá sàn đã trừ khuyến mãi', () => {
    detail.data = vehicle({ discountPercent: 10 });
    renderPage();

    expect(screen.getByText('Giá hiển thị sàn')).toBeTruthy();
    expect(screen.getByText('1.620.000 ₫')).toBeTruthy();
  });

  it('không giảm giá: KHÔNG dựng dòng giá sàn', () => {
    renderPage();
    expect(screen.queryByText('Giá hiển thị sàn')).toBeNull();
  });

  it('chưa có ảnh: nói rõ thay vì để khoảng trống', () => {
    detail.data = vehicle({ mainImageUrl: null });
    renderPage();

    expect(screen.getByText('Chưa có ảnh đại diện.')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ gửi duyệt công khai */

describe('/manage/vehicles/[id] — tiến trình gửi duyệt', () => {
  it('không có quyền gửi duyệt: không có danh sách điều kiện và không có nút gửi', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });

  it('đủ điều kiện: danh sách hiện đủ 4 mục và nút gửi bấm được', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    renderPage();

    expect(screen.getAllByText('Đã có')).toHaveLength(4);
    const button = screen.getByRole('button', { name: /Gửi duyệt công khai/ });
    fireEvent.click(button);
    expect(submitPublic.mutate).toHaveBeenCalledTimes(1);
  });

  it('thiếu điều kiện: nêu đúng mục còn thiếu và KHOÁ nút gửi', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ description: null, plateNumber: null });
    renderPage();

    expect(screen.getAllByText('Chưa có')).toHaveLength(2);
    const button = screen.getByRole('button', { name: /Gửi duyệt công khai/ });
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(submitPublic.mutate).not.toHaveBeenCalled();
  });

  it('xe đã duyệt: không mời gửi lại, chỉ báo đang hiển thị trên chợ', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ publicStatus: 'approved_public' });
    renderPage();

    expect(screen.getByText('Xe đang hiển thị trên chợ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });
});

/* ------------------------------------------------------------------ xoá + điều hướng */

describe('/manage/vehicles/[id] — xoá và điều hướng', () => {
  it('xoá phải xác nhận trước, rồi mới gọi mutation với đúng id', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe' }));
    expect(deleteVehicle.mutate).not.toHaveBeenCalled();

    const confirm = await screen.findByRole('button', { name: 'Xoá' });
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));
    expect(deleteVehicle.mutate.mock.calls[0]![0]).toBe('v1');
  });

  it('xoá xong: về danh sách bằng `replace` — không quay lui vào bản ghi đã xoá', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));

    const options = deleteVehicle.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();

    expect(nav.replace).toHaveBeenCalledWith('/manage/vehicles');
  });

  it('nút quay lại về danh sách xe', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
  });
});
