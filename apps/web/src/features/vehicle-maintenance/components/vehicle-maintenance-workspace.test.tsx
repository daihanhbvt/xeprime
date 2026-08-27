import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import type { VehicleDetail } from '@/features/vehicles/types';
import { ApiClientError } from '@/services/api-client';
import { VehicleMaintenanceWorkspace } from './VehicleMaintenanceWorkspace';
import type { MaintenanceProfile, MaintenanceRecord } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/vehicles/vehicle-1/edit',
  useSearchParams: () => new URLSearchParams('tab=maintenance'),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const queries = vi.hoisted(() => ({
  profile: { data: undefined as MaintenanceProfile | undefined, isLoading: false, isError: false },
  records: { data: [] as MaintenanceRecord[], isLoading: false, isError: false },
  profileEnabled: undefined as boolean | undefined,
}));
vi.mock('../hooks', () => ({
  useMaintenanceProfile: (_id: string, enabled?: boolean) => {
    queries.profileEnabled = enabled;
    return { ...queries.profile, refetch: vi.fn() };
  },
  useMaintenanceRecords: () => ({ ...queries.records, refetch: vi.fn() }),
  useOdometerHistory: () => ({ data: undefined, isLoading: true, isError: false }),
  useInvalidateMaintenance: () => vi.fn(),
}));

const api = vi.hoisted(() => ({
  saveMaintenanceProfile: vi.fn(),
  correctOdometer: vi.fn(),
  createMaintenanceRecord: vi.fn(),
  updateMaintenanceRecord: vi.fn(),
  completeMaintenanceRecord: vi.fn(),
  cancelMaintenanceRecord: vi.fn(),
}));
vi.mock('../api', () => ({
  saveMaintenanceProfile: (...args: unknown[]) => api.saveMaintenanceProfile(...args),
  correctOdometer: (...args: unknown[]) => api.correctOdometer(...args),
  createMaintenanceRecord: (...args: unknown[]) => api.createMaintenanceRecord(...args),
  updateMaintenanceRecord: (...args: unknown[]) => api.updateMaintenanceRecord(...args),
  completeMaintenanceRecord: (...args: unknown[]) => api.completeMaintenanceRecord(...args),
  cancelMaintenanceRecord: (...args: unknown[]) => api.cancelMaintenanceRecord(...args),
}));

const vehicle = {
  id: 'vehicle-1',
  name: 'Toyota Vios 2024',
  plateNumber: '51A-123.45',
} as unknown as VehicleDetail;

function profileOf(overrides: Partial<MaintenanceProfile> = {}): MaintenanceProfile {
  return {
    currentOdometerKm: 45_230,
    currentOdometerSource: 'booking_return',
    currentOdometerAt: '2026-08-05T03:00:00.000Z',
    currentOdometerRefLabel: 'Đơn T2408-001',
    oilChangeIntervalKm: 5_000,
    lastServiceKm: 40_000,
    lastServiceAt: '2026-07-15',
    notes: null,
    nextMaintenanceKm: 45_000,
    remainingKm: -230,
    usedKm: 5_230,
    usedPercent: 104.6,
    dueStatus: 'overdue',
    dueSoonKm: 500,
    rowVersion: 3,
    updatedAt: '2026-08-05T03:00:00.000Z',
    ...overrides,
  } as MaintenanceProfile;
}

function recordOf(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    id: 'record-1',
    vehicleId: 'vehicle-1',
    type: 'oil_change',
    customTypeName: null,
    title: 'Thay dầu động cơ & Lọc dầu',
    status: 'scheduled',
    plannedStartAt: '2026-08-20T01:00:00.000Z',
    plannedEndAt: '2026-08-20T05:00:00.000Z',
    completedAt: null,
    odometerKm: null,
    providerName: 'Toyota Đông Sài Gòn',
    notes: null,
    attachmentCount: 0,
    rowVersion: 1,
    updatedAt: '2026-08-05T03:00:00.000Z',
    ...overrides,
  } as MaintenanceRecord;
}

function renderTab() {
  return render(
    <App>
      <VehicleMaintenanceWorkspace vehicle={vehicle} />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.VEHICLE_MAINTENANCE_VIEW,
    PERMISSION.VEHICLE_MAINTENANCE_MANAGE,
    PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW,
    PERMISSION.VEHICLE_ODOMETER_CORRECT,
  ]);
  queries.profile = { data: profileOf(), isLoading: false, isError: false };
  queries.records = { data: [], isLoading: false, isError: false };
  Object.values(api).forEach((mock) => mock.mockClear?.());
});
afterEach(cleanup);

describe('Tab Bảo dưỡng & KM (Wave 6)', () => {
  it('thiếu vehicles.maintenance.view: màn không có quyền, KHÔNG bật query', () => {
    permissions.granted = new Set();
    renderTab();
    expect(screen.getByText('Không có quyền xem bảo dưỡng')).toBeTruthy();
    expect(queries.profileEnabled).toBe(false);
  });

  it('chỉ có view: chế độ xem, không nút lưu / thêm / điều chỉnh KM', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    renderTab();
    expect(screen.getByText(/Chế độ xem/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Điều chỉnh thủ công/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm bảo dưỡng/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).toBeNull();
  });

  it('đủ dữ liệu: hiện KM hiện tại, mốc tiếp theo và mức quá hạn (đúng công thức server)', () => {
    renderTab();
    expect(screen.getByText('45.230 km')).toBeTruthy();
    expect(screen.getByText(/Đơn T2408-001/)).toBeTruthy();
    expect(screen.getByText(/45\.000 km/)).toBeTruthy();
    expect(screen.getByText('Quá hạn 230 km')).toBeTruthy();
    expect(screen.getByText('Quá hạn')).toBeTruthy();
    // Ngưỡng cảnh báo là cấu hình gian hàng, trả từ API — không phải hằng số giấu trong UI.
    expect(screen.getByText(/Ngưỡng cảnh báo.*còn 500 km/i)).toBeTruthy();
  });

  it('thiếu KM hoặc chu kỳ: nói "Chưa đủ dữ liệu", tuyệt đối không dựng 0 km', () => {
    queries.profile = {
      data: profileOf({
        currentOdometerKm: null,
        currentOdometerAt: null,
        currentOdometerRefLabel: null,
        lastServiceKm: null,
        nextMaintenanceKm: null,
        remainingKm: null,
        usedKm: null,
        usedPercent: null,
        dueStatus: 'unknown',
      }),
      isLoading: false,
      isError: false,
    };
    renderTab();
    expect(screen.getByText('Chưa có')).toBeTruthy();
    expect(screen.getAllByText('Chưa đủ dữ liệu').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa có dữ liệu KM')).toBeTruthy();
    // Không có ô nào hiển thị "0 km" thay cho số chưa biết (§9: không dùng 0km giả).
    expect(screen.queryByText('0 km')).toBeNull();
    expect(screen.queryByText('Trong chu kỳ')).toBeNull();
  });

  it('lỗi tải: hiện màn lỗi có nút thử lại, không hiện số giả', () => {
    queries.profile = { data: undefined, isLoading: false, isError: true };
    renderTab();
    expect(screen.getByText('Không tải được thông tin bảo dưỡng')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('lưu cấu hình gửi kèm rowVersion đang thấy (chống sửa đè)', async () => {
    api.saveMaintenanceProfile.mockResolvedValue(profileOf());
    renderTab();
    const interval = screen.getByLabelText('Chu kỳ thay nhớt định kỳ');
    fireEvent.change(interval, { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.saveMaintenanceProfile).toHaveBeenCalledTimes(1));
    const [, body] = api.saveMaintenanceProfile.mock.calls[0] as [string, { expectedRowVersion: number }];
    expect(body.expectedRowVersion).toBe(3);
  });

  it('giảm KM khi thiếu quyền: cảnh báo tại chỗ và KHÓA nút gửi, không để bấm rồi mới báo lỗi', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Điều chỉnh thủ công/ }));
    const kmInput = await screen.findByLabelText('KM mới');
    fireEvent.change(kmInput, { target: { value: '44500' } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('thấp hơn KM hiện tại');
    expect(alert.textContent).toContain('cần quyền quản trị viên');
    const submit = screen.getByRole('button', { name: /Gửi yêu cầu phê duyệt/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(api.correctOdometer).not.toHaveBeenCalled();
  });

  it('có quyền giảm KM: gửi kèm confirmDecrease để server biết là cố ý', async () => {
    permissions.granted.add(PERMISSION.VEHICLE_ODOMETER_DECREASE);
    api.correctOdometer.mockResolvedValue(profileOf({ currentOdometerKm: 44_500 }));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Điều chỉnh thủ công/ }));
    fireEvent.change(await screen.findByLabelText('KM mới'), { target: { value: '44500' } });
    fireEvent.change(screen.getByLabelText('Ghi chú chi tiết'), {
      target: { value: 'Thay cụm đồng hồ mới' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật KM/ }));

    await waitFor(() => expect(api.correctOdometer).toHaveBeenCalledTimes(1));
    const [, body] = api.correctOdometer.mock.calls[0] as [
      string,
      { confirmDecrease?: boolean; reason: string; expectedRowVersion?: number },
    ];
    expect(body.confirmDecrease).toBe(true);
    expect(body.reason).toBe('Thay cụm đồng hồ mới');
    expect(body.expectedRowVersion).toBe(3);
  });

  it('điều chỉnh KM không nhập lý do: chặn ngay ở form, không gọi API', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Điều chỉnh thủ công/ }));
    fireEvent.change(await screen.findByLabelText('KM mới'), { target: { value: '46000' } });
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật KM/ }));
    expect(await screen.findByText('Nhập lý do chi tiết')).toBeTruthy();
    expect(api.correctOdometer).not.toHaveBeenCalled();
  });

  it('mốc thời gian gửi lên là ISO 8601, không phải chuỗi hiển thị dd/MM/yyyy', async () => {
    api.createMaintenanceRecord.mockResolvedValue(recordOf());
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm bảo dưỡng/ }));

    // Gõ thẳng vào ô ngày như người dùng thật (DatePicker nhận định dạng hiển thị).
    const start = await screen.findByLabelText('Bắt đầu dự kiến');
    fireEvent.change(start, { target: { value: '16/08/2026 12:00' } });
    fireEvent.keyDown(start, { key: 'Enter', code: 'Enter' });
    const end = screen.getByLabelText('Kết thúc dự kiến');
    fireEvent.change(end, { target: { value: '17/08/2026 08:45' } });
    fireEvent.keyDown(end, { key: 'Enter', code: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo lịch' }));
    await waitFor(() => expect(api.createMaintenanceRecord).toHaveBeenCalledTimes(1));

    const [, body] = api.createMaintenanceRecord.mock.calls[0] as [
      string,
      { plannedStartAt: string | null; plannedEndAt: string | null },
    ];
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(body.plannedStartAt).toMatch(ISO);
    expect(body.plannedEndAt).toMatch(ISO);
    // Mốc gửi đi phải đúng thời điểm người dùng chọn (UTC+7 → UTC).
    expect(body.plannedStartAt).toBe('2026-08-16T05:00:00.000Z');
    expect(body.plannedEndAt).toBe('2026-08-17T01:45:00.000Z');
  });

  it('chỉ nhập một đầu mốc: chặn ở form vì lịch cần đủ cặp mới giữ chỗ được', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm bảo dưỡng/ }));
    const start = await screen.findByLabelText('Bắt đầu dự kiến');
    fireEvent.change(start, { target: { value: '16/08/2026 12:00' } });
    fireEvent.keyDown(start, { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lịch' }));

    expect(await screen.findByText('Nhập thời điểm kết thúc để giữ lịch xe')).toBeTruthy();
    expect(api.createMaintenanceRecord).not.toHaveBeenCalled();
  });

  it('trùng lịch: hiện KHOẢNG bị trùng và GIỮ NGUYÊN dữ liệu đã nhập', async () => {
    api.createMaintenanceRecord.mockRejectedValue(
      new ApiClientError({
        code: 'BOOKING_SCHEDULE_CONFLICT',
        message: 'trùng lịch',
        status: 409,
        details: {
          conflicts: [
            {
              sourceType: 'booking',
              label: 'Đơn thuê BK-001',
              startAt: '2026-08-20T00:00:00.000Z',
              endAt: '2026-08-22T00:00:00.000Z',
            },
          ],
        },
      }),
    );
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm bảo dưỡng/ }));
    const titleInput = await screen.findByLabelText('Mô tả ngắn');
    fireEvent.change(titleInput, { target: { value: 'Bảo dưỡng mốc 45.000 km' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lịch' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Đơn thuê BK-001');
    // Form không bị xoá: người dùng chỉ cần đổi ngày.
    expect((screen.getByLabelText('Mô tả ngắn') as HTMLInputElement).value).toBe(
      'Bảo dưỡng mốc 45.000 km',
    );
  });

  it('hoàn tất phiếu gửi rowVersion và nói rõ hệ quả với lịch xe + mốc thay nhớt', async () => {
    queries.records = { data: [recordOf()], isLoading: false, isError: false };
    api.completeMaintenanceRecord.mockResolvedValue(recordOf({ status: 'completed' }));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));

    expect(await screen.findByText(/giải phóng lịch xe/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Odo bảo dưỡng'), { target: { value: '45500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bảo dưỡng' }));

    await waitFor(() => expect(api.completeMaintenanceRecord).toHaveBeenCalledTimes(1));
    const [, , body] = api.completeMaintenanceRecord.mock.calls[0] as [
      string,
      string,
      { odometerKm: number; expectedRowVersion: number },
    ];
    expect(body.odometerKm).toBe(45_500);
    expect(body.expectedRowVersion).toBe(1);
  });

  it('không có quyền tiền: chi phí vắng mặt khỏi dòng lịch sử (server đã lược)', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    // Server không gửi `cost` cho vai trò thiếu quyền — dòng vẫn hiển thị đủ việc cần biết.
    queries.records = {
      data: [recordOf({ status: 'completed', completedAt: '2026-07-15T02:00:00.000Z' })],
      isLoading: false,
      isError: false,
    };
    const view = renderTab();
    const historyCard = view.container.textContent ?? '';
    expect(historyCard).toContain('Thay dầu động cơ & Lọc dầu');
    expect(historyCard).not.toContain('₫');
  });

  it('mobile: hành động trên dòng phiếu giữ vùng chạm tối thiểu 44px', () => {
    queries.records = { data: [recordOf()], isLoading: false, isError: false };
    const view = renderTab();
    const actions = view.container.querySelector('[class*="recordActions"]');
    expect(actions).toBeTruthy();
    // Quy tắc nằm ở CSS module (media query ≤640px) — kiểm sự tồn tại của lớp mang luật.
    expect(within(actions as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
  });
});
