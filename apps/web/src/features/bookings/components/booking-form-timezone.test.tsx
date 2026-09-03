import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { IntlTestProvider } from '@/i18n/test-utils';
import { render } from '@testing-library/react';
import type { BookingDetail } from '../types';
import { BookingFormDialog } from './BookingFormDialog';

/**
 * Hợp đồng MÚI GIỜ của form sửa đơn (nợ kỹ thuật đóng 03/09/2026).
 *
 * Ba điều phải đúng ở mọi múi giờ máy, vì mỗi điều hỏng theo một kiểu riêng:
 *   1. mốc UTC từ API hiện ra đúng GIỜ VIỆT NAM trên ô chọn — sai thì người sửa đơn tưởng lịch
 *      đã bị đổi và "sửa lại cho đúng";
 *   2. bấm lưu mà không đụng gì thì gửi lên ĐÚNG mốc cũ — sai thì mỗi lần mở form là một lần
 *      dời lịch đơn;
 *   3. preview trùng lịch và payload lưu dùng CHUNG một mốc — sai thì màn hình báo "sạch" rồi
 *      lưu vẫn dính exclusion constraint (ADR 0006), và không ai hiểu vì sao.
 */

const mutations = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../hooks/use-booking-mutations', () => ({
  useCreateBooking: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateBooking: () => ({ mutate: mutations.update, isPending: false }),
}));

const api = vi.hoisted(() => ({
  // Khai kiểu tham số để đọc lại `mock.calls[0][0]` mà không phải ép kiểu ở chỗ khẳng định.
  checkConflict: vi.fn(async (_body: { startAt: string; endAt: string }) => ({
    hasConflict: false,
  })),
}));
vi.mock('../api', () => ({ checkConflict: api.checkConflict }));

vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({
  useVehicles: () => ({
    data: { items: [{ id: 'veh-1', name: 'Xe A', plateNumber: '51A-00001' }] },
  }),
}));

vi.mock('@/services/api-client', () => ({
  getErrorCode: () => null,
  getErrorMessage: () => 'lỗi',
}));

/** Đơn mẫu: nhận 03/09/2026 12:00 giờ VN (= 05:00Z), trả 06/09/2026 12:00 giờ VN. */
const PICKUP_ISO = '2026-09-03T05:00:00.000Z';
const RETURN_ISO = '2026-09-06T05:00:00.000Z';

const EDITING = {
  id: 'bk-1',
  code: 'DH-0001',
  vehicleId: 'veh-1',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  serviceType: 'self_drive',
  routeType: 'in_city',
  pickupAddress: null,
  destination: null,
  pickupAt: PICKUP_ISO,
  returnAt: RETURN_ISO,
  baseAmount: '1000000',
  deliveryFee: null,
  discountAmount: null,
  depositAmount: null,
  note: null,
} as unknown as BookingDetail;

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <IntlTestProvider>
      <QueryClientProvider client={client}>
        <App>{children}</App>
      </QueryClientProvider>
    </IntlTestProvider>
  );
}

const HOST_TIME_ZONES = ['Asia/Ho_Chi_Minh', 'UTC', 'America/New_York'] as const;
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  mutations.update.mockClear();
  api.checkConflict.mockClear();
});
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  cleanup();
});

describe('BookingFormDialog — mốc thời gian độc lập với múi giờ máy', () => {
  it.each(HOST_TIME_ZONES)(
    'máy đặt ở %s: hiện đúng 12:00 giờ VN và lưu lại đúng mốc cũ',
    async (hostTz) => {
      process.env.TZ = hostTz;

      render(
        <Harness>
          <BookingFormDialog open editing={EDITING} onClose={vi.fn()} />
        </Harness>,
      );

      // 1. Chiều API → ô chọn: 05:00Z phải đọc thành 12:00 giờ Việt Nam.
      expect(screen.getByText('T5, 03/09 · 12:00')).toBeTruthy();
      expect(screen.getByText('CN, 06/09 · 12:00')).toBeTruthy();

      // 2. Chiều ô chọn → API: không đụng gì thì mốc gửi lên bằng đúng mốc nhận về.
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(mutations.update).toHaveBeenCalled());
      const body = mutations.update.mock.calls[0]![0] as { pickupAt: string; returnAt: string };
      expect(body.pickupAt).toBe(PICKUP_ISO);
      expect(body.returnAt).toBe(RETURN_ISO);

      // 3. Preview trùng lịch hỏi server về ĐÚNG khoảng sắp lưu, không phải một khoảng lệch giờ.
      await waitFor(() => expect(api.checkConflict).toHaveBeenCalled());
      const preview = api.checkConflict.mock.calls[0]![0];
      expect(preview.startAt).toBe(body.pickupAt);
      expect(preview.endAt).toBe(body.returnAt);
    },
  );
});
