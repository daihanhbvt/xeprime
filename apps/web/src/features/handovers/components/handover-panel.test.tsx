import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOVER_PHOTO_SLOT, PERMISSION } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { HandoverPanel } from './HandoverPanel';
import type { Handover, HandoverContext } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/bookings',
  useSearchParams: () => new URLSearchParams(),
}));

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => layout.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !layout.mobile,
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
  context: {
    data: undefined as HandoverContext | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  enabled: undefined as boolean | undefined,
  invalidate: vi.fn(),
}));
vi.mock('../hooks', () => ({
  useHandoverContext: (_id: string, enabled?: boolean) => {
    queries.enabled = enabled;
    return queries.context;
  },
  useInvalidateHandovers: () => queries.invalidate,
}));

const api = vi.hoisted(() => ({
  saveHandoverDraft: vi.fn(),
  confirmHandover: vi.fn(),
  cancelHandover: vi.fn(),
  resolveHandoverOdometer: vi.fn(),
  presignHandoverPhoto: vi.fn(),
  attachHandoverPhoto: vi.fn(),
  removeHandoverPhoto: vi.fn(),
  fetchHandoverPhotoUrl: vi.fn(),
}));
vi.mock('../api', () => ({
  saveHandoverDraft: (...args: unknown[]) => api.saveHandoverDraft(...args),
  confirmHandover: (...args: unknown[]) => api.confirmHandover(...args),
  cancelHandover: (...args: unknown[]) => api.cancelHandover(...args),
  resolveHandoverOdometer: (...args: unknown[]) => api.resolveHandoverOdometer(...args),
  presignHandoverPhoto: (...args: unknown[]) => api.presignHandoverPhoto(...args),
  attachHandoverPhoto: (...args: unknown[]) => api.attachHandoverPhoto(...args),
  removeHandoverPhoto: (...args: unknown[]) => api.removeHandoverPhoto(...args),
  fetchHandoverPhotoUrl: (...args: unknown[]) => api.fetchHandoverPhotoUrl(...args),
}));

const uploads = vi.hoisted(() => ({ uploadToR2: vi.fn() }));
vi.mock('@/services/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/upload')>();
  return { ...actual, uploadToR2: (...args: unknown[]) => uploads.uploadToR2(...args) };
});

function handoverOf(overrides: Partial<Handover> = {}): Handover {
  return {
    id: 'handover-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    type: 'pickup',
    status: 'draft',
    odometerKm: null,
    odometerMissing: false,
    suspiciousAcknowledged: false,
    energyKind: 'fuel',
    fuelLevel: null,
    batteryPercent: null,
    conditionNote: null,
    damageNote: null,
    notes: null,
    photos: [],
    confirmedAt: null,
    confirmedByName: null,
    canceledAt: null,
    rowVersion: 1,
    updatedAt: '2026-08-10T02:00:00.000Z',
    ...overrides,
  } as Handover;
}

function contextOf(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
    bookingId: 'booking-1',
    bookingCode: 'XP-0045',
    bookingStatus: 'confirmed',
    vehicleId: 'vehicle-1',
    vehicleName: 'Toyota Vios 2024',
    plateNumber: '51A-123.45',
    energyKind: 'fuel',
    vehicleOdometerKm: 45_230,
    pickupOdometerKm: null,
    nextMaintenanceKm: 50_000,
    rentalDays: 5,
    suspiciousKmPerDay: null,
    pickup: null,
    return: null,
    canStartPickup: true,
    canStartReturn: false,
    ...overrides,
  } as HandoverContext;
}

/** Ngữ cảnh đã giao xe xong, đang ở bước nhận trả — dùng lại nhiều lần bên dưới. */
function returnStage(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return contextOf({
    bookingStatus: 'active',
    pickupOdometerKm: 45_230,
    canStartPickup: false,
    canStartReturn: true,
    pickup: handoverOf({
      id: 'handover-pickup',
      status: 'confirmed',
      odometerKm: 45_230,
      fuelLevel: 'full',
      confirmedAt: '2026-08-10T02:00:00.000Z',
      confirmedByName: 'Trần Văn C',
    }),
    return: handoverOf({
      id: 'handover-return',
      type: 'return',
      photos: [
        {
          slot: HANDOVER_PHOTO_SLOT.FRONT,
          uploadedAt: '2026-08-15T02:00:00.000Z',
          fileId: 'file-front',
          name: 'truoc.jpg',
        },
        {
          slot: HANDOVER_PHOTO_SLOT.REAR,
          uploadedAt: '2026-08-15T02:00:00.000Z',
          fileId: 'file-rear',
          name: 'sau.jpg',
        },
      ],
      rowVersion: 2,
    }),
    ...overrides,
  });
}

function renderPanel(bookingStatus = 'Đã xác nhận') {
  return render(
    <App>
      <HandoverPanel bookingId="booking-1" bookingStatus={bookingStatus} />
    </App>,
  );
}

/** Mở hộp thoại của một chiều bàn giao đã có bản nháp. */
async function openDialog(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  await screen.findByTestId('handover-dialog');
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.HANDOVER_VIEW,
    PERMISSION.HANDOVER_MANAGE,
    PERMISSION.HANDOVER_CONFIRM,
    PERMISSION.HANDOVER_FILE_VIEW,
    PERMISSION.VEHICLE_ODOMETER_CORRECT,
  ]);
  layout.mobile = false;
  queries.context = {
    data: contextOf(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  queries.invalidate = vi.fn();
  Object.values(api).forEach((fn) => fn.mockReset());
  uploads.uploadToR2.mockReset().mockResolvedValue(undefined);
  api.saveHandoverDraft.mockResolvedValue(handoverOf({ rowVersion: 2 }));
  api.confirmHandover.mockResolvedValue(contextOf());
});
afterEach(cleanup);

describe('Khối bàn giao trong chi tiết đơn (Wave 7)', () => {
  it('thiếu handovers.view: hiện màn không có quyền và KHÔNG gọi API', () => {
    permissions.granted = new Set();
    renderPanel();
    expect(screen.getByText('Không có quyền xem biên bản bàn giao')).toBeTruthy();
    expect(queries.enabled).toBe(false);
  });

  it('lỗi tải: hiện lỗi có nút thử lại, không phải màn trắng', () => {
    queries.context = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    renderPanel();
    expect(screen.getByText('Không tải được biên bản bàn giao')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
  });

  it('đơn đã bị xoá: nói đúng chuyện gì xảy ra và KHÔNG mời thử lại vô nghĩa', () => {
    queries.context = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiClientError({
        code: 'NOT_FOUND',
        message: 'Không tìm thấy đơn thuê',
        status: 404,
      }),
      refetch: vi.fn(),
    } as unknown as typeof queries.context;
    renderPanel();
    expect(screen.getByText('Đơn hoặc xe không còn tồn tại')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
  });

  it('đang tải: giữ khung skeleton thay vì nhảy layout', () => {
    queries.context = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    const view = renderPanel();
    expect(view.container.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('chưa có biên bản: mở được bước giao xe, KHÔNG mở được bước nhận trả', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /Bắt đầu giao xe/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bắt đầu nhận xe trả/ })).toBeNull();
    // Nói rõ VÌ SAO chưa mở được, không chỉ ẩn nút đi.
    const returnSection = screen.getByRole('region', { name: 'Nhận xe trả' });
    expect(returnSection.textContent).toContain('Đã xác nhận');
  });

  it('bấm bắt đầu: tạo bản nháp rỗng trước rồi mới mở form (ảnh cần biên bản có thật)', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu giao xe/ }));
    await waitFor(() => expect(api.saveHandoverDraft).toHaveBeenCalledWith('booking-1', 'pickup', {}));
    expect(queries.invalidate).toHaveBeenCalled();
  });

  it('thiếu quyền lập: không có nút bắt đầu, chỉ nói rõ lý do', () => {
    permissions.granted = new Set([PERMISSION.HANDOVER_VIEW]);
    renderPanel();
    expect(screen.queryByRole('button', { name: /Bắt đầu giao xe/ })).toBeNull();
    // Cả hai chiều đều nói rõ lý do, không chiều nào im lặng.
    expect(screen.getAllByText('Bạn không có quyền lập biên bản bàn giao.')).toHaveLength(2);
  });

  it('biên bản đã xác nhận: chỉ xem, và hiện ai xác nhận lúc nào', () => {
    queries.context.data = returnStage();
    renderPanel();
    const pickup = screen.getByRole('region', { name: 'Giao xe' });
    expect(within(pickup).getByRole('button', { name: 'Xem biên bản' })).toBeTruthy();
    expect(pickup.textContent).toContain('Trần Văn C');
    expect(pickup.textContent).toContain('45.230 km');
  });

  it('thiếu KM trả: hiện đúng task và lối bổ sung cho người có quyền KM', () => {
    queries.context.data = returnStage({
      return: handoverOf({
        id: 'handover-return',
        type: 'return',
        status: 'confirmed',
        odometerKm: null,
        odometerMissing: true,
        confirmedAt: '2026-08-15T02:00:00.000Z',
        rowVersion: 3,
      }),
    });
    renderPanel();
    expect(screen.getByText('Thiếu KM trả')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bổ sung KM' })).toBeTruthy();
    // KM chưa có thì nói "Chưa có", KHÔNG dựng "0 km" (docs §9).
    const returnSection = screen.getByRole('region', { name: 'Nhận xe trả' });
    expect(within(returnSection).getAllByText('Chưa có').length).toBeGreaterThan(0);
    expect(screen.queryByText('0 km')).toBeNull();
  });

  it('thiếu quyền chỉnh KM: vẫn thấy cảnh báo thiếu KM nhưng không có nút bổ sung', () => {
    permissions.granted = new Set([PERMISSION.HANDOVER_VIEW, PERMISSION.HANDOVER_MANAGE]);
    queries.context.data = returnStage({
      return: handoverOf({
        id: 'handover-return',
        type: 'return',
        status: 'confirmed',
        odometerMissing: true,
        rowVersion: 3,
      }),
    });
    renderPanel();
    expect(screen.getByText('Thiếu KM trả')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bổ sung KM' })).toBeNull();
  });
});

describe('Hộp thoại bàn giao — nhập và lưu nháp', () => {
  it('lưu nháp gửi đúng payload và KHÔNG gọi xác nhận', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(api.saveHandoverDraft).toHaveBeenCalled());
    const [, type, body] = api.saveHandoverDraft.mock.calls.at(-1)!;
    expect(type).toBe('return');
    expect(body).toMatchObject({ odometerKm: 45_890, expectedRowVersion: 2 });
    expect(api.confirmHandover).not.toHaveBeenCalled();
  });

  it('xe xăng gửi mức nhiên liệu; xe điện gửi % pin — không gửi cả hai', async () => {
    queries.context.data = returnStage({
      energyKind: 'battery',
      pickup: handoverOf({ status: 'confirmed', odometerKm: 45_230, energyKind: 'battery' }),
    });
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    expect(screen.queryByLabelText('Mức nhiên liệu khi trả')).toBeNull();
    fireEvent.change(screen.getByLabelText('Mức pin khi nhận lại'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(api.saveHandoverDraft).toHaveBeenCalled());
    const body = api.saveHandoverDraft.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(body.batteryPercent).toBe(75);
    expect(body).not.toHaveProperty('fuelLevel');
  });

  it('chênh lệch quãng đường hiện ngay khi gõ, và hệ quả hệ thống nói đúng mốc bảo dưỡng', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('handover-delta').textContent).toBe('+660 km'),
    );
    const consequence = screen.getByTestId('handover-consequence');
    expect(consequence.textContent).toContain('45.890 km');
    expect(consequence.textContent).toContain('50.000 km');
    expect(consequence.textContent).toContain('Còn 4.110 km');
  });

  it('chưa đủ dữ liệu mốc bảo dưỡng: nói thẳng, KHÔNG bịa số', async () => {
    queries.context.data = returnStage({ nextMaintenanceKm: null });
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('handover-consequence').textContent).toContain(
        'Chưa đủ dữ liệu',
      ),
    );
  });
});

describe('Hộp thoại bàn giao — xác nhận và các trạng thái lỗi', () => {
  it('xác nhận: lưu nháp trước rồi confirm theo rowVersion vừa nhận về', async () => {
    queries.context.data = returnStage();
    api.saveHandoverDraft.mockResolvedValue(handoverOf({ rowVersion: 7 }));
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalled());
    expect(api.saveHandoverDraft).toHaveBeenCalledBefore(api.confirmHandover);
    expect(api.confirmHandover.mock.calls.at(-1)![2]).toMatchObject({ expectedRowVersion: 7 });
  });

  it('thiếu quyền xác nhận: có nút lưu nháp nhưng KHÔNG có nút xác nhận', async () => {
    permissions.granted = new Set([
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_MANAGE,
      PERMISSION.HANDOVER_FILE_VIEW,
    ]);
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận trả xe' })).toBeNull();
  });

  it('KM trả nhỏ hơn KM giao: báo ngay tại ô nhập kèm mốc phải vượt', async () => {
    queries.context.data = returnStage();
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: 'HANDOVER_ODOMETER_BELOW_PICKUP',
        message: 'KM nhận lại không được nhỏ hơn KM lúc giao',
        status: 400,
        details: { pickupKm: 45_230, odometerKm: 45_100, deltaKm: -130 },
      }),
    );
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() =>
      expect(screen.getByText(/không được nhỏ hơn chỉ số KM lúc giao \(45\.230 km\)/)).toBeTruthy(),
    );
    // Chênh lệch âm hiện đúng dấu để người dùng thấy sai ở đâu.
    expect(screen.getByTestId('handover-delta').textContent).toBe('-130 km');
  });

  it('KM nghi ngờ: cảnh báo có hai lối đi, xác nhận lại gửi kèm cờ đã đọc cảnh báo', async () => {
    queries.context.data = returnStage({ suspiciousKmPerDay: 20 });
    api.confirmHandover.mockRejectedValueOnce(
      new ApiClientError({
        code: 'HANDOVER_ODOMETER_SUSPICIOUS',
        message: 'Quãng đường phát sinh thấp bất thường',
        status: 409,
        details: {
          suspicious: true,
          expectedMinKm: 100,
          deltaKm: 5,
          rentalDays: 5,
          thresholdKmPerDay: 20,
        },
      }),
    );
    api.confirmHandover.mockResolvedValueOnce(returnStage());
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45235' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Thuê 5 ngày nhưng chỉ phát sinh 5 km');
    expect(alert.textContent).toContain('20 km/ngày');
    expect(screen.getByRole('button', { name: 'Kiểm tra lại số đọc' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận vẫn đúng' }));
    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalledTimes(2));
    expect(api.confirmHandover.mock.calls.at(-1)![2]).toMatchObject({
      acknowledgeSuspicious: true,
    });
  });

  it('thiếu ảnh bắt buộc: chỉ rõ phải chụp góc nào, không xác nhận', async () => {
    queries.context.data = returnStage({
      return: handoverOf({ id: 'handover-return', type: 'return', photos: [], rowVersion: 2 }),
    });
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: 'VALIDATION_FAILED',
        message: 'Cần ảnh hiện trạng: Trước, Sau',
        status: 400,
        details: { missingSlots: ['front', 'rear'] },
      }),
    );
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() => expect(screen.getByText('Thiếu ảnh hiện trạng bắt buộc')).toBeTruthy());
  });

  it('thiếu KM: đề nghị đóng biên bản tạo task, gửi lại kèm cờ chấp nhận thiếu KM', async () => {
    queries.context.data = returnStage();
    api.confirmHandover.mockRejectedValueOnce(
      new ApiClientError({
        code: 'VALIDATION_FAILED',
        message: 'Chưa nhập chỉ số KM',
        status: 400,
        details: {
          fields: [{ field: 'odometerKm', message: 'Bắt buộc nhập chỉ số Odo' }],
          allowMissingSupported: true,
        },
      }),
    );
    api.confirmHandover.mockResolvedValueOnce(returnStage());
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() => expect(screen.getByText('Chưa có chỉ số KM')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Đóng biên bản, bổ sung KM sau' }));
    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalledTimes(2));
    expect(api.confirmHandover.mock.calls.at(-1)![2]).toMatchObject({
      allowMissingOdometer: true,
    });
  });

  it('đơn không còn hợp lệ (người khác vừa xử lý): tải lại và đóng, không cố ghi đè', async () => {
    queries.context.data = returnStage();
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: 'HANDOVER_NOT_ELIGIBLE',
        message: 'Đơn không còn ở trạng thái thực hiện được bước này',
        status: 409,
      }),
    );
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() => expect(queries.invalidate).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
  });

  it('biên bản đã xác nhận: mở ra là chỉ đọc, không có nút xác nhận hay lưu nháp', async () => {
    queries.context.data = returnStage();
    renderPanel();
    const pickup = screen.getByRole('region', { name: 'Giao xe' });
    fireEvent.click(within(pickup).getByRole('button', { name: 'Xem biên bản' }));
    await screen.findByTestId('handover-dialog');

    expect(screen.getByText(/Biên bản đã xác nhận — chỉ xem/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận giao xe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).toBeNull();
  });
});

describe('Ảnh hiện trạng riêng tư', () => {
  it('tải ảnh hỏng giữa chừng: chỉ ô đó báo lỗi và có nút thử lại riêng', async () => {
    queries.context.data = returnStage();
    api.presignHandoverPhoto.mockResolvedValue({ fileId: 'file-1', uploadUrl: 'u', expiresIn: 300 });
    uploads.uploadToR2.mockRejectedValueOnce(new Error('Tải tệp lên thất bại'));
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    const file = new File(['x'], 'left.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('Tải tệp lên thất bại')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Tải lại ảnh/ })).toBeTruthy();
    // Ảnh đã xong trước đó KHÔNG bị kéo theo.
    expect(screen.getAllByLabelText(/Xem ảnh/).length).toBeGreaterThan(0);
  });

  it('thiếu handovers.view_files: thấy ô đã có ảnh nhưng không có nút xem', async () => {
    permissions.granted = new Set([
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_MANAGE,
      PERMISSION.HANDOVER_CONFIRM,
    ]);
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    expect(screen.getAllByText('Đã có ảnh').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Xem ảnh/)).toBeNull();
  });

  it('xem ảnh: xin signed URL mới cho từng cú bấm, không giữ URL trong DOM', async () => {
    queries.context.data = returnStage();
    api.fetchHandoverPhotoUrl.mockResolvedValue({
      downloadUrl: 'https://r2.local/signed',
      expiresAt: '2026-08-15T02:02:00.000Z',
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.click(screen.getAllByLabelText(/Xem ảnh/)[0]!);
    await waitFor(() => expect(api.fetchHandoverPhotoUrl).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith('https://r2.local/signed', '_blank', 'noopener');
    // URL ký KHÔNG nằm trong markup — chỉ đi thẳng sang tab mới.
    expect(document.body.innerHTML).not.toContain('r2.local/signed');
    open.mockRestore();
  });
});

describe('KM giao xe là bắt buộc (Wave 7.1)', () => {
  /** Ngữ cảnh đang ở bước GIAO xe, có sẵn bản nháp và đủ ảnh. */
  function pickupStage(): HandoverContext {
    return contextOf({
      pickup: handoverOf({
        id: 'handover-pickup',
        photos: [
          { slot: HANDOVER_PHOTO_SLOT.FRONT, uploadedAt: '2026-08-10T02:00:00.000Z' },
          { slot: HANDOVER_PHOTO_SLOT.REAR, uploadedAt: '2026-08-10T02:00:00.000Z' },
        ],
        rowVersion: 2,
      }),
    });
  }

  it('giao xe thiếu KM: báo lỗi ngay tại ô nhập, KHÔNG mời đóng biên bản', async () => {
    queries.context.data = pickupStage();
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: 'VALIDATION_FAILED',
        message: 'Chỉ số KM lúc giao xe là bắt buộc',
        status: 400,
        details: {
          fields: [{ field: 'odometerKm', message: 'Bắt buộc nhập chỉ số Odo' }],
          allowMissingSupported: false,
        },
      }),
    );
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận giao xe' }));

    await waitFor(() =>
      expect(screen.getByText(/Chỉ số KM lúc giao xe là bắt buộc/)).toBeTruthy(),
    );
    // Lối "đóng biên bản, bổ sung sau" CHỈ tồn tại ở chiều trả.
    expect(screen.queryByRole('button', { name: 'Đóng biên bản, bổ sung KM sau' })).toBeNull();
    expect(screen.queryByText('Chưa có chỉ số KM')).toBeNull();
  });

  it('mobile: lỗi thiếu KM đưa người dùng về đúng bước nhập KM', async () => {
    layout.mobile = true;
    queries.context.data = pickupStage();
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: 'VALIDATION_FAILED',
        message: 'Chỉ số KM lúc giao xe là bắt buộc',
        status: 400,
        details: {
          fields: [{ field: 'odometerKm', message: 'Bắt buộc nhập chỉ số Odo' }],
          allowMissingSupported: false,
        },
      }),
    );
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục nhập ảnh & hiện trạng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xem tóm tắt & Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận giao xe' }));

    await waitFor(() => expect(screen.getByLabelText('Chỉ số Kilômét khi giao')).toBeTruthy());
    expect(screen.getByText(/Chỉ số KM lúc giao xe là bắt buộc/)).toBeTruthy();
  });
});

describe('Sẵn sàng xác nhận & huỷ biên bản (Wave 7.1)', () => {
  it('người chỉ có quyền nhập: thấy nút sẵn sàng thay cho nút xác nhận', async () => {
    permissions.granted = new Set([
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_MANAGE,
      PERMISSION.HANDOVER_FILE_VIEW,
    ]);
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    expect(screen.queryByRole('button', { name: 'Xác nhận trả xe' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sẵn sàng xác nhận' }));

    await waitFor(() => expect(api.saveHandoverDraft).toHaveBeenCalled());
    expect(api.saveHandoverDraft.mock.calls.at(-1)![2]).toMatchObject({ markReady: true });
    expect(api.confirmHandover).not.toHaveBeenCalled();
  });

  it('người có quyền xác nhận: không thấy nút sẵn sàng (tự chốt được thì không cần bàn giao việc)', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    expect(screen.queryByRole('button', { name: 'Sẵn sàng xác nhận' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Xác nhận trả xe' })).toBeTruthy();
  });

  it('biên bản sẵn sàng vẫn sửa được và hiện đúng nhãn trạng thái dùng chung', () => {
    queries.context.data = returnStage({
      return: handoverOf({ id: 'handover-return', type: 'return', status: 'ready', rowVersion: 2 }),
    });
    renderPanel();
    const section = screen.getByRole('region', { name: 'Nhận xe trả' });
    expect(within(section).getByText('Chờ xác nhận')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Tiếp tục nhập' })).toBeTruthy();
  });

  it('huỷ nháp: hỏi xác nhận trước, rồi gọi API kèm rowVersion đang thấy', async () => {
    queries.context.data = returnStage();
    api.cancelHandover.mockResolvedValue(returnStage({ return: null }));
    renderPanel();

    const section = screen.getByRole('region', { name: 'Nhận xe trả' });
    fireEvent.click(within(section).getByRole('button', { name: 'Huỷ biên bản' }));
    expect(await screen.findByText('Huỷ biên bản bàn giao?')).toBeTruthy();
    expect(api.cancelHandover).not.toHaveBeenCalled();

    // Nút xác nhận nằm TRONG hộp thoại — không nhầm với nút mở hộp thoại ở hàng.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ biên bản' }));
    await waitFor(() => expect(api.cancelHandover).toHaveBeenCalledWith('booking-1', 'return', 2));
    expect(queries.invalidate).toHaveBeenCalled();
  });

  it('biên bản đã xác nhận: KHÔNG có nút huỷ', () => {
    queries.context.data = returnStage();
    renderPanel();
    const pickup = screen.getByRole('region', { name: 'Giao xe' });
    expect(within(pickup).queryByRole('button', { name: 'Huỷ biên bản' })).toBeNull();
  });

  it('sau khi huỷ, đơn còn hợp lệ thì lập lại được từ đầu', () => {
    queries.context.data = returnStage({ return: null, canStartReturn: true });
    renderPanel();
    expect(screen.getByRole('button', { name: /Bắt đầu nhận xe trả/ })).toBeTruthy();
  });
});

describe('Bảo vệ thay đổi chưa lưu (Wave 7.1)', () => {
  it('form còn dở: đóng phải hỏi trước, chọn tiếp tục thì không mất dữ liệu', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));

    // Điều phải đúng: biên bản KHÔNG đóng và số vừa gõ còn nguyên.
    expect(screen.getByTestId('handover-dialog')).toBeTruthy();
    expect((screen.getByLabelText('Chỉ số Kilômét khi nhận lại') as HTMLInputElement).value).toBe(
      '45890',
    );
  });

  it('chọn bỏ thay đổi thì đóng hẳn', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));

    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
  });

  it('form chưa đụng tới: đóng thẳng, KHÔNG cảnh báo giả', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).toBeNull();
  });

  it('vừa lưu nháp xong: đóng không bị hỏi lại', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.saveHandoverDraft).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).toBeNull();
  });

  it('xác nhận thành công: đóng luôn, không cảnh báo', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả xe' }));

    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).toBeNull();
  });

  it('biên bản chỉ đọc: không bao giờ hỏi bỏ thay đổi', async () => {
    queries.context.data = returnStage();
    renderPanel();
    const pickup = screen.getByRole('region', { name: 'Giao xe' });
    fireEvent.click(within(pickup).getByRole('button', { name: 'Xem biên bản' }));
    await screen.findByTestId('handover-dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByTestId('handover-dialog')).toBeNull());
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).toBeNull();
  });

  it('báo trạng thái dở dang lên cha để drawer đơn tự chặn việc đóng', async () => {
    const onDirty = vi.fn();
    queries.context.data = returnStage();
    render(
      <App>
        <HandoverPanel bookingId="booking-1" bookingStatus="Đang thuê" onDirtyChange={onDirty} />
      </App>,
    );
    await openDialog(/Tiếp tục nhập/);
    fireEvent.change(screen.getByLabelText('Chỉ số Kilômét khi nhận lại'), {
      target: { value: '45890' },
    });
    await waitFor(() => expect(onDirty).toHaveBeenCalledWith(true));
  });
});

/** Nhãn duy nhất của lưới ảnh — dùng để biết khối ảnh có đang hiển thị hay không. */
const PHOTO_GRID_LABEL = 'Ảnh đồng hồ KM & nhiên liệu';

describe('Responsive', () => {
  it('mobile: chia 3 bước trên MỘT hàng ngang', async () => {
    layout.mobile = true;
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    const stepper = screen.getByRole('list', { name: 'Các bước bàn giao' });
    expect(within(stepper).getAllByRole('listitem')).toHaveLength(3);
    expect(stepper.className).toMatch(/stepper/);
  });

  it('CSS: dải bước không xuống dòng mà cuộn ngang; nút mobile giữ vùng chạm 44px', () => {
    // jsdom không áp CSS Modules nên computed style vô nghĩa ở đây — đọc thẳng luật trong
    // file style, cùng cách `layout-breakpoints.test.ts` kiểm các breakpoint dùng chung.
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'Handover.module.css'),
      'utf8',
    );
    const stepper = css.slice(css.indexOf('.stepper {'), css.indexOf('.stepper::-webkit'));
    expect(stepper).toContain('flex-wrap: nowrap');
    expect(stepper).toContain('overflow-x: auto');
    // Ô ảnh dùng auto-fit + minmax: 4 ô ở 1440, tự rớt xuống 2 ô ở 390 mà không tràn ngang.
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(84px, 1fr))');
    // Ô nhập co được trong cột hẹp — không chống đẩy làm hộp thoại tràn ngang.
    expect(css).toContain('min-width: 0');
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('min-height: 44px');
  });

  it('mobile: bước 1 chỉ hỏi KM & nhiên liệu; ảnh nằm ở bước 2', async () => {
    layout.mobile = true;
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);

    expect(screen.getByLabelText('Chỉ số Kilômét khi nhận lại')).toBeTruthy();
    expect(screen.queryByText(PHOTO_GRID_LABEL)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục nhập ảnh & hiện trạng/ }));
    await waitFor(() => expect(screen.getByText(PHOTO_GRID_LABEL)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Xem tóm tắt & Xác nhận/ }));
    await waitFor(() => expect(screen.getByText('Hình ảnh hiện trạng')).toBeTruthy());
    expect(screen.getByText('2/5 ảnh đã tải lên')).toBeTruthy();
  });

  it('desktop: cả hai khối hiện cùng lúc, không có dải bước', async () => {
    queries.context.data = returnStage();
    renderPanel();
    await openDialog(/Tiếp tục nhập/);
    expect(screen.queryByRole('list', { name: 'Các bước bàn giao' })).toBeNull();
    expect(screen.getByLabelText('Chỉ số Kilômét khi nhận lại')).toBeTruthy();
    expect(screen.getByText(PHOTO_GRID_LABEL)).toBeTruthy();
  });
});
