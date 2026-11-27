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
 *
 * 25/11/2026: vùng "Tình trạng, ảnh & ghi chú" LUÔN mở (không còn thu gọn); ô ghi chú chỉ hiện khi
 * chọn "Có điểm cần lưu ý"; thiếu ảnh ngoại thất thì bấm xác nhận hiện popup CẢNH BÁO — vẫn đi
 * tiếp được.
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
    // Hẹn trả 30′ nữa: mặc định giờ nhận = bây giờ ⇒ đúng giờ, và chưa tới ngưỡng trả SỚM (60′).
    bookingReturnAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    vehicleOdometerKm: 42500,
    pickupOdometerKm: 42500,
    pickup: null,
    // Đủ bốn góc ngoại thất — các ca không bàn về ảnh đi thẳng, không vướng popup thiếu ảnh.
    return: {
      rowVersion: 1,
      odometerKm: null,
      photos: ['front', 'rear', 'left', 'right'].map((slot) => ({ slot })),
    },
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
    // Vùng tình trạng / ảnh / ghi chú LUÔN mở — không còn nút thu gọn; đếm theo bộ góc của ô tô.
    const section = screen.getByRole('region', { name: 'Tình trạng, ảnh & ghi chú' });
    expect(screen.queryByRole('button', { name: /Tình trạng, ảnh & ghi chú/ })).toBeNull();
    expect(within(section).getByText('Khuyến khích')).toBeTruthy();
    expect(within(section).getByText('4/5 ảnh')).toBeTruthy();
    expect(within(section).getByTestId('photo-grid').textContent).toBe(HANDOVER_TYPE.RETURN);
    expect(within(section).getByRole('radio', { name: 'Có điểm cần lưu ý' })).toBeTruthy();
  });

  it('nhận lại xe sớm hơn giờ hẹn ≥ 60′ ⇒ viên "Sớm …" + cảnh báo nhả lịch, tiền giữ nguyên theo đơn', () => {
    state.context = context({
      bookingReturnAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    renderDialog();
    expect(screen.getByText(/^Trả sớm .+ so với giờ hẹn$/)).toBeTruthy();
    expect(screen.getByText(/Tiền thuê giữ nguyên theo đơn/)).toBeTruthy();
    expect(screen.getByText(/^Sớm /)).toBeTruthy();
  });

  it('đúng giờ (sớm < 60′) ⇒ không cảnh báo trả sớm', () => {
    renderDialog();
    expect(screen.queryByText(/^Trả sớm /)).toBeNull();
  });

  it('khách chưa báo trả ⇒ giờ nhận mặc định = GIỜ HẸN; "Hiện tại" ↔ "Đúng giờ" bật qua lại', async () => {
    state.context = context({ bookingReturnAt: '2026-11-01T02:00:00.000Z' }); // 09:00 giờ VN
    const { onClose } = renderDialog();
    expect(screen.getAllByText('Đúng giờ').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Đặt về giờ hẹn trả/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Đặt về giờ hiện tại' }));
    // Bây giờ đã qua 01/11 ⇒ trễ, câu đỏ dưới ô giờ; nút đổi thành "Đúng giờ" để về lại.
    expect(screen.getByText(/so với giờ hẹn$/)).toBeTruthy();
    const back = screen.getByRole('button', { name: /Đặt về giờ hẹn trả/ });
    expect(back.textContent).toBe('Đúng giờ');

    fireEvent.click(back);
    expect(screen.queryByText(/so với giờ hẹn$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Đặt về giờ hiện tại' })).toBeTruthy();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().occurredAt).toBe('2026-11-01T02:00:00.000Z');
  });

  it('ghi chú chỉ hiện khi chọn "Có điểm cần lưu ý" và chỉ khi đó mới được gửi', async () => {
    const { onClose } = renderDialog();
    expect(screen.queryByRole('textbox', { name: 'Ghi chú' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Có điểm cần lưu ý' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ghi chú' }), {
      target: { value: 'Xước cản sau' },
    });
    // Đổi về "Bình thường": ô ghi chú ẩn, chữ đã gõ không đi theo lượt xác nhận.
    fireEvent.click(screen.getByRole('radio', { name: /Bình thường/ }));
    expect(screen.queryByRole('textbox', { name: 'Ghi chú' })).toBeNull();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().condition).toBe('normal');
    expect(lastBody().notes).toBeUndefined();
  });

  it('có điểm cần lưu ý ⇒ ghi chú đi cùng lượt xác nhận', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Có điểm cần lưu ý' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ghi chú' }), {
      target: { value: 'Xước cản sau' },
    });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ condition: 'attention', notes: 'Xước cản sau' });
  });

  it('thiếu ảnh ngoại thất ⇒ popup CẢNH BÁO; "Thêm ảnh" ở lại hộp, "Vẫn xác nhận" đi tiếp', async () => {
    state.context = context({
      return: {
        rowVersion: 1,
        odometerKm: null,
        photos: [{ slot: 'front' }, { slot: 'odometer' }],
      },
    } as unknown as Partial<HandoverContext>);
    const { onClose } = renderDialog();

    fireEvent.click(confirmButton());
    expect(await screen.findByText('Chưa đủ ảnh hiện trạng xe')).toBeTruthy();
    expect(screen.getByText(/Còn thiếu ảnh: Mặt sau · Bên trái · Bên phải./)).toBeTruthy();
    expect(api.confirmHandover).not.toHaveBeenCalled();

    // "Thêm ảnh" đóng popup, ở lại hộp nhận xe — không gửi gì.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh' }));
    expect(api.confirmHandover).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Vẫn xác nhận' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.confirmHandover).toHaveBeenCalledTimes(1);
  });

  it('chưa có biên bản trả (chưa tải ảnh nào) ⇒ cũng cảnh báo', async () => {
    state.context = context({ return: null } as unknown as Partial<HandoverContext>);
    renderDialog();
    fireEvent.click(confirmButton());
    expect(
      await screen.findByText(/Còn thiếu ảnh: Mặt trước · Mặt sau · Bên trái · Bên phải./),
    ).toBeTruthy();
  });

  it('xe máy chỉ đòi trước + sau — đủ hai góc đó thì không cảnh báo', async () => {
    state.context = context({
      vehicleType: 'motorbike',
      return: { rowVersion: 1, odometerKm: null, photos: [{ slot: 'front' }, { slot: 'rear' }] },
    } as unknown as Partial<HandoverContext>);
    const { onClose } = renderDialog();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('khách chưa báo trả, bấm xác nhận ngay ⇒ nộp đúng giờ hẹn', async () => {
    state.context = context({ bookingReturnAt: '2026-11-01T02:00:00.000Z' });
    const { onClose } = renderDialog();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody().occurredAt).toBe('2026-11-01T02:00:00.000Z');
  });

  it('giờ nhận mặc định = lúc khách báo đã trả xe; sau giờ hẹn ⇒ viên "Trễ …" thay "Đúng giờ"', async () => {
    state.context = context({ bookingReturnAt: '2026-11-01T02:00:00.000Z' }); // 09:00 giờ VN
    const { onClose } = renderDialog({ customerReturnedAt: '2026-11-01T03:30:00.000Z' }); // 10:30
    // Viên đọc lướt (một đơn vị); câu dưới ô giờ chính xác tới phút.
    expect(screen.getByText('Trễ 1 giờ')).toBeTruthy();
    expect(screen.getByText('Trễ 1 giờ 30 phút so với giờ hẹn')).toBeTruthy();
    // Viên / câu trạng thái không còn "Đúng giờ" — chữ đó giờ chỉ là NÚT về lại giờ hẹn.
    expect(screen.queryAllByText('Đúng giờ').filter((el) => el.tagName !== 'BUTTON')).toHaveLength(
      0,
    );
    expect(screen.getByRole('button', { name: /Đặt về giờ hẹn trả/ })).toBeTruthy();

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
    feature.financeVisible = false;
    renderDialog();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: /Thêm phụ phí/ })).toBeTruthy();
    cleanup();

    feature.financeVisible = true;
    permissions.granted.delete(PERMISSION.PAYMENT_RECORD);
    renderDialog();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm phụ phí/ })).toBeNull();
  });

  it('phụ phí gõ trong hộp đi cùng lượt xác nhận; dòng thiếu số tiền chặn gửi', async () => {
    const { onClose } = renderDialog();
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

  it('trả trễ: gợi ý phí quá giờ của server - bấm Thêm là một dòng kèm lý do', async () => {
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
