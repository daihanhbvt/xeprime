import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookingRequestItem, DeliveryQuotePreview } from '../types';

import { DeliveryQuoteDrawer } from './DeliveryQuoteDrawer';

/**
 * Đặc tả drawer "Báo giá giao nhận" (Wave 2 — Figma `237:1845`, states `247:2004`).
 *
 * Khoá: mọi con số breakdown đến từ endpoint preview (FE không tự cộng trừ); ngoài bán kính
 * phải nhập phí tay (thiếu → chặn gửi); trong bán kính phí "Tự động tính" (không có ô nhập);
 * báo giá cũ có cảnh báo; payload gửi là chuỗi tiền (ADR 0007).
 */
const api = vi.hoisted(() => ({
  previewDeliveryQuote: vi.fn(),
  saveDeliveryQuote: vi.fn(),
}));

vi.mock('../api', () => ({
  previewDeliveryQuote: (...a: unknown[]) => api.previewDeliveryQuote(...a),
  saveDeliveryQuote: (...a: unknown[]) => api.saveDeliveryQuote(...a),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function requestFixture(over: Partial<BookingRequestItem> = {}): BookingRequestItem {
  return {
    id: 'req1',
    vehicleId: 'v1',
    vehicleName: 'Toyota Vios 2024',
    vehiclePlate: '51A-123.45',
    status: 'pending_host_approval',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    customerEmail: null,
    pickupAt: '2026-08-20T02:00:00.000Z',
    returnAt: '2026-08-23T02:00:00.000Z',
    note: null,
    deliveryRequested: true,
    deliveryAddress: '123 Nguyễn Huệ, Q.1, HCM',
    deliveryQuote: null,
    needsDeliveryQuote: true,
    rejectReason: null,
    bookingId: null,
    createdAt: '2026-08-11T02:00:00.000Z',
    ...over,
  } as BookingRequestItem;
}

function previewFixture(over: Partial<DeliveryQuotePreview> = {}): DeliveryQuotePreview {
  return {
    requiresManualFee: true,
    autoFee: null,
    breakdown: {
      days: 3,
      rows: [
        {
          key: 'base',
          label: 'Tiền thuê gốc',
          sublabel: '3 ngày × 800.000đ/ngày',
          amount: '2400000',
        },
        {
          key: 'delivery',
          label: 'Phí giao nhận xe',
          sublabel: 'Khoảng cách 15 km một chiều (báo giá thủ công)',
          amount: '120000',
        },
      ],
      totalAmount: '2520000',
      depositAmount: '5000000',
      policySource: 'shop',
      policyUpdatedAt: '2026-08-01T00:00:00.000Z',
    },
    ...over,
  } as DeliveryQuotePreview;
}

function renderDrawer(request: BookingRequestItem | null, onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <DeliveryQuoteDrawer request={request} onClose={vi.fn()} onSaved={onSaved} />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.previewDeliveryQuote.mockReset();
  api.saveDeliveryQuote.mockReset();
  api.previewDeliveryQuote.mockResolvedValue(previewFixture());
  api.saveDeliveryQuote.mockResolvedValue(requestFixture({ needsDeliveryQuote: false }));
});

afterEach(cleanup);

describe('DeliveryQuoteDrawer — ngữ cảnh và preview', () => {
  it('hiện ngữ cảnh yêu cầu: khách, xe, điểm giao', () => {
    renderDrawer(requestFixture());
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('Toyota Vios 2024')).toBeTruthy();
    expect(screen.getByText('123 Nguyễn Huệ, Q.1, HCM')).toBeTruthy();
    expect(screen.getByText('Nhập khoảng cách xác nhận để xem chi tiết báo giá.')).toBeTruthy();
  });

  it('nhập khoảng cách → gọi preview (debounce) và vẽ breakdown TỪ SERVER', async () => {
    renderDrawer(requestFixture());
    fireEvent.change(screen.getByLabelText('Khoảng cách xác nhận (km)'), {
      target: { value: '15' },
    });

    await waitFor(() =>
      expect(api.previewDeliveryQuote).toHaveBeenCalledWith('req1', { distanceKm: 15 }),
    );
    expect(await screen.findByText('Chi tiết báo giá dự kiến')).toBeTruthy();
    expect(screen.getByText('2.400.000 ₫')).toBeTruthy();
    expect(screen.getByText('2.520.000 ₫')).toBeTruthy();
    expect(screen.getByText('5.000.000 ₫')).toBeTruthy();
    // Ngoài bán kính → có ô phí thủ công + huy hiệu cảnh báo.
    expect(screen.getByLabelText('Phí giao nhận đề xuất (VND)')).toBeTruthy();
    expect(screen.getByText('Ngoài bán kính tự động')).toBeTruthy();
  });

  it('trong bán kính: phí "Tự động tính", KHÔNG có ô nhập phí', async () => {
    api.previewDeliveryQuote.mockResolvedValue(
      previewFixture({ requiresManualFee: false, autoFee: '50000' }),
    );
    renderDrawer(requestFixture());
    fireEvent.change(screen.getByLabelText('Khoảng cách xác nhận (km)'), {
      target: { value: '8' },
    });

    expect(await screen.findByText('Tự động tính')).toBeTruthy();
    expect(screen.queryByLabelText('Phí giao nhận đề xuất (VND)')).toBeNull();
  });

  it('báo giá đã cũ (chính sách đổi sau khi báo): cảnh báo báo giá lại', () => {
    renderDrawer(
      requestFixture({
        needsDeliveryQuote: false,
        deliveryQuote: {
          distanceKm: 15,
          fee: '120000',
          source: 'manual',
          note: null,
          quotedAt: '2026-08-05T00:00:00.000Z',
          stale: true,
        },
      }),
    );
    expect(screen.getByText('Chính sách giao nhận đã thay đổi sau khi báo giá')).toBeTruthy();
  });
});

describe('DeliveryQuoteDrawer — gửi báo giá', () => {
  it('ngoài bán kính mà chưa nhập phí → chặn gửi, không gọi API', async () => {
    renderDrawer(requestFixture());
    fireEvent.change(screen.getByLabelText('Khoảng cách xác nhận (km)'), {
      target: { value: '15' },
    });
    await screen.findByText('Chi tiết báo giá dự kiến');

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo giá' }));
    expect(await screen.findByText(/vui lòng nhập phí giao nhận đề xuất/)).toBeTruthy();
    expect(api.saveDeliveryQuote).not.toHaveBeenCalled();
  });

  it('đủ khoảng cách + phí → gửi payload chuỗi tiền và báo thành công', async () => {
    const onSaved = vi.fn();
    renderDrawer(requestFixture(), onSaved);
    fireEvent.change(screen.getByLabelText('Khoảng cách xác nhận (km)'), {
      target: { value: '15' },
    });
    await screen.findByText('Chi tiết báo giá dự kiến');
    fireEvent.change(screen.getByLabelText('Phí giao nhận đề xuất (VND)'), {
      target: { value: '120000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo giá' }));
    await waitFor(() =>
      expect(api.saveDeliveryQuote).toHaveBeenCalledWith('req1', {
        distanceKm: 15,
        fee: '120000',
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
