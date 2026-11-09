import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOVER_TYPE, PERMISSION } from '@xeprime/types';
import { ConfirmHandoverDialog } from './ConfirmHandoverDialog';
import type { Handover, HandoverContext } from '../types';

/**
 * Đặc tả hộp "Sẵn sàng giao xe" (Figma 23845:54382, 03/11/2026) — bước CUỐI của hành động chính
 * mỗi đầu chuyến. Ảnh hiện trạng đã chụp ngay trên trang chi tiết, nên hộp chỉ còn: lời xác nhận,
 * ô Odo (tuỳ chọn) và vùng chi tiết đóng sẵn. Một chuyến bình thường xong bằng một lần bấm.
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const invalidate = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useInvalidateHandovers: () => invalidate }));

const api = vi.hoisted(() => ({
  confirmHandover: vi.fn(),
  saveHandoverDraft: vi.fn(),
}));
vi.mock('../api', () => ({
  confirmHandover: (...a: unknown[]) => api.confirmHandover(...a),
  saveHandoverDraft: (...a: unknown[]) => api.saveHandoverDraft(...a),
}));

function handover(overrides: Partial<Handover> = {}): Handover {
  return {
    id: 'ho-1',
    type: HANDOVER_TYPE.PICKUP,
    status: 'draft',
    rowVersion: 3,
    odometerKm: null,
    condition: null,
    notes: null,
    photos: [],
    confirmedAt: null,
    occurredAt: null,
    ...overrides,
  } as unknown as Handover;
}

function context(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
    bookingId: 'bk-1',
    vehicleId: 'v-1',
    bookingCode: 'DH-001',
    vehicleName: 'Toyota Vios',
    plateNumber: '51H-123.45',
    bookingPickupAt: '2026-08-01T02:00:00.000Z',
    bookingReturnAt: '2026-08-03T02:00:00.000Z',
    vehicleOdometerKm: 12000,
    pickup: null,
    return: null,
    canStartPickup: true,
    canStartReturn: false,
    ...overrides,
  } as unknown as HandoverContext;
}

function renderDialog(ctx: HandoverContext = context()) {
  const onClose = vi.fn();
  render(
    <App>
      <ConfirmHandoverDialog context={ctx} open onClose={onClose} />
    </App>,
  );
  return { onClose };
}

/** Mở vùng "Thêm thông tin bàn giao" (đóng sẵn theo thiết kế). */
function openAdvanced() {
  fireEvent.click(screen.getByText(/Thêm thông tin bàn giao/));
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.HANDOVER_VIEW,
    PERMISSION.HANDOVER_CONFIRM,
    PERMISSION.HANDOVER_MANAGE,
    PERMISSION.HANDOVER_FILE_VIEW,
  ]);
  Object.values(api).forEach((fn) => fn.mockReset());
  invalidate.mockReset();
});

afterEach(cleanup);

describe('ConfirmHandoverDialog', () => {
  it('đúng khung design: lời xác nhận, hai nút Quay lại · Xác nhận, KHÔNG có khối ảnh', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Sẵn sàng giao xe' })).toBeTruthy();
    expect(screen.getByText(/trạng thái chuyến thuê sẽ được cập nhật thành/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeTruthy();
    // Ảnh hiện trạng chụp trên trang chi tiết — hộp không dựng lại lưới ảnh thứ hai.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('ô Odo hiện sẵn (không cần mở vùng chi tiết) và vẫn tuỳ chọn', () => {
    renderDialog();
    expect(screen.getByText('Chỉ số Odo khi giao (km)')).toBeTruthy();
    expect(screen.getByText(/Không nhập cũng xác nhận được/)).toBeTruthy();
  });

  it('xác nhận được mà không nhập gì - không gửi Odo rỗng, không tạo biên bản nháp', async () => {
    api.confirmHandover.mockResolvedValue(context());
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalledTimes(1));
    expect(api.saveHandoverDraft).not.toHaveBeenCalled();
    const [bookingId, type, body] = api.confirmHandover.mock.calls[0]!;
    expect(bookingId).toBe('bk-1');
    expect(type).toBe(HANDOVER_TYPE.PICKUP);
    expect(body).not.toHaveProperty('odometerKm');
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('nhập Odo thì gửi đúng số km', async () => {
    api.confirmHandover.mockResolvedValue(context());
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('Bỏ trống nếu chưa đọc được'), {
      target: { value: '12.345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalled());
    expect(api.confirmHandover.mock.calls[0]![2]).toMatchObject({ odometerKm: 12345 });
  });

  /**
   * Ảnh tải trên trang làm `rowVersion` nhảy; ngữ cảnh bàn giao được làm mới sau mỗi ảnh, nên
   * hộp gửi đúng số của biên bản hiện tại — không thì ăn 409.
   */
  it('gửi rowVersion của biên bản đang có', async () => {
    api.confirmHandover.mockResolvedValue(context());
    renderDialog(context({ pickup: handover({ rowVersion: 9 }) } as Partial<HandoverContext>));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalled());
    expect(api.confirmHandover.mock.calls[0]![2]).toMatchObject({ expectedRowVersion: 9 });
  });

  it('Quay lại đóng hộp, không gọi API', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.confirmHandover).not.toHaveBeenCalled();
  });

  it('vùng chi tiết đóng sẵn vẫn giữ thời điểm thực tế, tình trạng và ghi chú', () => {
    renderDialog();
    openAdvanced();
    expect(screen.getByText('Thời gian giao xe thực tế')).toBeTruthy();
    expect(screen.getByText('Tình trạng xe')).toBeTruthy();
    expect(screen.getByText('Ghi chú')).toBeTruthy();
  });
});
