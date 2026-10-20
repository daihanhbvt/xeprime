import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromoPreview, PromoTripParams } from './types';
import { usePromoCode } from './use-promo-code';

/**
 * Bất biến của `usePromoCode`: kết quả xem trước mã chỉ được dùng cho ĐÚNG chuyến nó được tính
 * (ADR 0046 §7). Đổi ngày mà vẫn trả bảng phí cũ là thẻ đặt xe ghép tiền thuê mới với tổng/tiền giữ
 * chỗ cũ — đúng lỗi 24/09/2026.
 */
const previewPromoCode = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ previewPromoCode }));

function preview(discount: string): PromoPreview {
  return {
    code: 'XEPRIME50',
    applicable: true,
    reason: null,
    discountAmount: discount,
    fees: { customerTotalAmount: '1000000', holdAmount: '100000', promoDiscountAmount: discount },
  } as unknown as PromoPreview;
}

const TRIP_A: PromoTripParams = {
  vehicleId: 'v1',
  serviceType: 'self_drive',
  pickupAt: '2026-11-01T01:00:00.000Z',
  returnAt: '2026-11-02T01:00:00.000Z',
};
const TRIP_B: PromoTripParams = { ...TRIP_A, returnAt: '2026-11-04T01:00:00.000Z' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => previewPromoCode.mockReset());

describe('usePromoCode', () => {
  it('đổi chuyến: KHÔNG trả bảng phí của chuyến cũ trong lúc chờ xác minh lại', async () => {
    previewPromoCode.mockResolvedValueOnce(preview('50000'));
    let resolveSecond!: (value: PromoPreview) => void;
    previewPromoCode.mockReturnValueOnce(
      new Promise<PromoPreview>((resolve) => {
        resolveSecond = resolve;
      }),
    );

    const { result, rerender } = renderHook(({ trip }) => usePromoCode(trip), {
      wrapper,
      initialProps: { trip: TRIP_A },
    });

    act(() => result.current.apply('XEPRIME50'));
    await waitFor(() => expect(result.current.applied?.discountAmount).toBe('50000'));

    rerender({ trip: TRIP_B });
    // Mã vẫn đang áp, nhưng chưa có kết quả nào cho chuyến MỚI.
    expect(result.current.appliedCode).toBe('XEPRIME50');
    expect(result.current.applied).toBeNull();

    await act(async () => resolveSecond(preview('80000')));
    await waitFor(() => expect(result.current.applied?.discountAmount).toBe('80000'));
    expect(previewPromoCode).toHaveBeenLastCalledWith('XEPRIME50', TRIP_B);
  });

  it('chuyến mới không còn đủ điều kiện: bỏ mã và NÓI ra (droppedCode)', async () => {
    previewPromoCode.mockResolvedValueOnce(preview('50000'));
    previewPromoCode.mockResolvedValueOnce({
      code: 'XEPRIME50',
      applicable: false,
      reason: 'min_subtotal',
    } as unknown as PromoPreview);

    const { result, rerender } = renderHook(({ trip }) => usePromoCode(trip), {
      wrapper,
      initialProps: { trip: TRIP_A },
    });
    act(() => result.current.apply('XEPRIME50'));
    await waitFor(() => expect(result.current.applied).not.toBeNull());

    rerender({ trip: TRIP_B });
    await waitFor(() => expect(result.current.droppedCode).toBe('XEPRIME50'));
    expect(result.current.appliedCode).toBeNull();
    expect(result.current.applied).toBeNull();
  });
});
