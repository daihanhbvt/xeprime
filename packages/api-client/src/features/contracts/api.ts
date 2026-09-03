import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';

type Schemas = components['schemas'];

export type Contract = Schemas['ContractDto'];
export type ContractSnapshot = Schemas['ContractSnapshotDto'];

/**
 * Hợp đồng thuê xe — một BẢN CHỤP đông cứng của đơn tại thời điểm lập.
 *
 * `snapshot` không đọc lại từ đơn: sửa đơn sau đó KHÔNG làm hợp đồng đã lập đổi theo, và đó
 * đúng là điều một hợp đồng phải làm. Vì thế nó cũng gần như không bao giờ cần refetch.
 */
export const contractsApi = {
  /** Tạo (hoặc lấy) hợp đồng từ một đơn — idempotent ở server: bấm lại trả đúng bản cũ. */
  createForBooking(bookingId: string): Promise<Contract> {
    return getApiClient().post<Contract>(
      `/bookings/${encodeURIComponent(bookingId)}/contract`,
      {},
    );
  },

  /** Chi tiết một hợp đồng để xem/in. */
  getOne(id: string): Promise<Contract> {
    return getApiClient().get<Contract>(`/contracts/${encodeURIComponent(id)}`);
  },
};
