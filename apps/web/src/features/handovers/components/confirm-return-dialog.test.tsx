import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ERROR_CODE,
  HANDOVER_TYPE,
  PAYMENT_METHOD,
  PERMISSION,
  SERVICE_TYPE,
  SURCHARGE_CATEGORY,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import { renderWithIntl } from '@/i18n/test-utils';
import type { ReturnSettlementPreview } from '@/features/settlement/types';
import { ConfirmReturnDialog } from './ConfirmReturnDialog';
import type { HandoverContext } from '../types';

/**
 * Đặc tả hộp "Xác nhận đã nhận lại xe" (Figma `23941:65305`, 06/11/2026): ô "Đã thu tiền" BẬT SẴN và
 * nộp ĐÚNG số server tính; bỏ tick là đơn hoàn thành với khoản còn nợ; phụ phí gõ trong hộp đi cùng
 * lượt xác nhận; mọi cổng quyền / gói ẩn đúng phần của nó.
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const feature = vi.hoisted(() => ({ financeVisible: true }));
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ isVisible: feature.financeVisible }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

// Bỏ trễ: bản xem trước khớp ngay bộ số đang gõ.
vi.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: <T,>(value: T) => value }));

// Lưới ảnh có test riêng — ở đây chỉ cần biết nó được dựng cho chiều TRẢ.
vi.mock('./HandoverPhotoGrid', () => ({
  HandoverPhotoGrid: ({ type }: { type: string }) => <div data-testid="photo-grid">{type}</div>,
}));

const state = vi.hoisted(() => ({
  context: null as unknown,
  preview: null as unknown,
}));
const invalidate = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({
  useHandoverContext: () => ({ data: state.context, isError: false, refetch: vi.fn() }),
  useInvalidateHandovers: () => invalidate,
}));
vi.mock('@/features/settlement/hooks', () => ({
  useReturnSettlementPreview: () => ({
    data: state.preview,
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
const afterPayment = vi.hoisted(() => vi.fn());
vi.mock('@/features/payments/hooks/use-payments', () => ({ invalidateAfterPayment: afterPayment }));

const api = vi.hoisted(() => ({ confirmHandover: vi.fn(), saveHandoverDraft: vi.fn() }));
vi.mock('../api', () => ({
  confirmHandover: (...a: unknown[]) => api.confirmHandover(...a),
  saveHandoverDraft: (...a: unknown[]) => api.saveHandoverDraft(...a),
}));

function context(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
    bookingId: 'bk-1',
    vehicleId: 'v-1',
    bookingCode: 'DH-001',
    vehicleName: 'Kia Carnival 2023',
    plateNumber: '51K-836.79',
    vehicleType: 'car',
    bookingPickupAt: '2026-08-01T02:00:00.000Z',
    // Hẹn trả ở tương lai: mặc định giờ nhận = bây giờ ⇒ đúng giờ.
    bookingReturnAt: '2099-01-01T02:00:00.000Z',
    vehicleOdometerKm: 42500,
    pickupOdometerKm: 42500,
    pickup: null,
    return: null,
    canStartPickup: false,
    canStartReturn: true,
    ...overrides,
  } as unknown as HandoverContext;
}

const NO_SUGGESTION = {
  available: false,
  lateMinutes: 0,
  chargedHours: 0,
  feePerHour: null,
  amount: null,
  formula: null,
};

function preview(overrides: Partial<ReturnSettlementPreview> = {}): ReturnSettlementPreview {
  return {
    depositReceived: '3000000.00',
    surchargeTotal: '0.00',
    proposedRefund: '3000000.00',
    additionalDue: '0.00',
    collectableAmount: '800000.00',
    surcharges: [],
    overtime: NO_SUGGESTION,
    excessMileage: { ...NO_SUGGESTION, available: false, excessKm: 0, actualKm: 0, allowedKm: 0 },
    ...overrides,
  } as unknown as ReturnSettlementPreview;
}

function renderDialog(booking: { customerReturnedAt?: string } = {}) {
  const onClose = vi.fn();
  renderWithIntl(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <ConfirmReturnDialog
          booking={{ id: 'bk-1', code: 'DH-001', serviceType: SERVICE_TYPE.SELF_DRIVE, ...booking }}
          onClose={onClose}
        />
      </App>
    </QueryClientProvider>,
  );
  return { onClose };
}

const confirmButton = () => screen.getByRole('button', { name: 'Xác nhận đã nhận xe' });
const lastBody = () => api.confirmHandover.mock.calls.at(-1)?.[2] as Record<string, unknown>;

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.HANDOVER_VIEW,
    PERMISSION.HANDOVER_CONFIRM,
    PERMISSION.HANDOVER_MANAGE,
    PERMISSION.PAYMENT_RECORD,
  ]);
  feature.financeVisible = true;
  state.context = context();
  state.preview = preview();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.confirmHandover.mockResolvedValue(context());
  invalidate.mockReset();
  afterPayment.mockReset();
});

afterEach(cleanup);

describe('ConfirmReturnDialog', () => {
  it('khung design: tiêu đề có mã đơn, thẻ xe + giờ hẹn, khối tiền cọc / phụ phí / đề xuất hoàn cọc', () => {
    renderDialog();
    expect(screen.getByText('Xác nhận đã nhận lại xe #DH-001')).toBeTruthy();
    expect(screen.getByText('Kia Carnival 2023')).toBeTruthy();
    expect(screen.getByText('51K-836.79')).toBeTruthy();
    expect(screen.getAllByText('Đúng giờ').length).toBeGreaterThan(0);
    for (const label of ['Tiền cọc đã nhận', 'Phụ phí phát sinh', 'Đề xuất hoàn cọc']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Vùng tình trạng / ảnh / ghi chú THU GỌN sẵn, đếm ảnh theo bộ góc của ô tô.
    const header = screen.getByRole('button', { name: /Tình trạng, ảnh & ghi chú/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(within(header).getByText('0/5 ảnh')).toBeTruthy();
    expect(screen.getByTestId('photo-grid').textContent).toBe(HANDOVER_TYPE.RETURN);
  });

  it('giờ nhận mặc định = lúc khách báo đã trả xe; sau giờ hẹn ⇒ viên "Trễ …" thay "Đúng giờ"', async () => {
    state.context = context({ bookingReturnAt: '2026-11-01T02:00:00.000Z' }); // 09:00 giờ VN
    const { onClose } = renderDialog({ customerReturnedAt: '2026-11-01T03:30:00.000Z' }); // 10:30
    // Viên đọc lướt (một đơn vị); câu dưới ô giờ chính xác tới phút.
    expect(screen.getByText('Trễ 1 giờ')).toBeTruthy();
    expect(screen.getByText('Trễ 1 giờ 30 phút so với giờ hẹn')).toBeTruthy();
    expect(screen.queryByText('Đúng giờ')).toBeNull();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().occurredAt).toBe('2026-11-01T03:30:00.000Z');
  });

  it('mặc định ĐÃ THU: xác nhận nộp đúng số server tính, kèm hình thức tiền mặt', async () => {
    const { onClose } = renderDialog();
    const box = screen.getByRole('checkbox');
    expect((box as HTMLInputElement).checked).toBe(true);

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.confirmHandover).toHaveBeenCalledWith(
      'bk-1',
      HANDOVER_TYPE.RETURN,
      expect.any(Object),
    );
    expect(lastBody().collectPayment).toEqual({ amount: '800000.00', method: PAYMENT_METHOD.CASH });
    // Phiếu thu đổi công nợ + sổ Thu chi — làm mới cùng bộ với hộp "Thu tiền".
    expect(afterPayment).toHaveBeenCalledWith(expect.anything(), 'bk-1');
    expect(invalidate).toHaveBeenCalled();
  });

  it('bỏ tick ⇒ không ghi phiếu thu, nói rõ đơn còn nợ', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/Đơn sẽ hoàn thành với khoản còn nợ/)).toBeTruthy();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().collectPayment).toBeUndefined();
    expect(afterPayment).not.toHaveBeenCalled();
  });

  it('không còn gì phải thu ⇒ không có ô thu tiền', async () => {
    state.preview = preview({ collectableAmount: '0.00' });
    const { onClose } = renderDialog();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().collectPayment).toBeUndefined();
  });

  it('gói không có Thu chi (tuyến hoa hồng) ⇒ không có ô thu tiền; thiếu payments.record ⇒ không có cả phụ phí', () => {
    const openDetails = () =>
      fireEvent.click(screen.getByRole('button', { name: /Tình trạng, ảnh & ghi chú/ }));

    feature.financeVisible = false;
    renderDialog();
    openDetails();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: /Thêm phụ phí/ })).toBeTruthy();
    cleanup();

    feature.financeVisible = true;
    permissions.granted.delete(PERMISSION.PAYMENT_RECORD);
    renderDialog();
    openDetails();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm phụ phí/ })).toBeNull();
  });

  it('phụ phí gõ trong hộp đi cùng lượt xác nhận; dòng thiếu số tiền chặn gửi', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Tình trạng, ảnh & ghi chú/ }));
    fireEvent.click(screen.getByRole('button', { name: /Thêm phụ phí/ }));

    fireEvent.click(confirmButton());
    expect(await screen.findByText(/Mỗi dòng phụ phí cần loại và số tiền/)).toBeTruthy();
    expect(api.confirmHandover).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quá giờ' }), {
      target: { value: '300000' },
    });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().surcharges).toEqual([
      { category: SURCHARGE_CATEGORY.OVERTIME, amount: '300000' },
    ]);
  });

  it('trả trễ: gợi ý phí quá giờ của server — bấm Thêm là một dòng kèm lý do', async () => {
    state.preview = preview({
      overtime: {
        available: true,
        lateMinutes: 120,
        chargedHours: 2,
        feePerHour: '100000',
        amount: '200000.00',
        formula: null,
      },
    });
    const { onClose } = renderDialog();
    // Có gợi ý ⇒ vùng chi tiết mở sẵn.
    expect(
      screen
        .getByRole('button', { name: /Tình trạng, ảnh & ghi chú/ })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [line] = lastBody().surcharges as { category: string; amount: string; reason: string }[];
    expect(line).toMatchObject({ category: SURCHARGE_CATEGORY.OVERTIME, amount: '200000' });
    expect(line!.reason).toMatch(/^Trả xe trễ 2 giờ/);
  });

  it('server báo số thu đã đổi ⇒ hiện số mới, giữ hộp mở để người dùng xác nhận lại', async () => {
    api.confirmHandover.mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.HANDOVER_COLLECT_AMOUNT_CHANGED,
        message: 'changed',
        status: 409,
        details: { collectableAmount: '900000.00' },
      }),
    );
    const { onClose } = renderDialog();
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/vừa đổi thành 900\.000/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Odo nhỏ hơn số lúc giao ⇒ cảnh báo ngay dưới ô, trước khi bấm', () => {
    renderDialog();
    fireEvent.change(screen.getByRole('spinbutton', { name: /Chỉ số Odo/ }), {
      target: { value: '42000' },
    });
    expect(screen.getByText(/Nhỏ hơn số lúc giao/)).toBeTruthy();
  });
});
