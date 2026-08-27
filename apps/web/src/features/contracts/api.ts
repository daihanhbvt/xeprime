import { apiGet, apiPost } from '@/services/api-client';
import type { Contract } from './types';

/** Tạo (hoặc lấy) hợp đồng từ một đơn — idempotent ở BE (bấm lại trả bản cũ). */
export const createContract = (bookingId: string): Promise<Contract> =>
  apiPost<Contract>(`/bookings/${bookingId}/contract`);

/** Chi tiết một hợp đồng để xem/in. */
export const fetchContract = (id: string): Promise<Contract> =>
  apiGet<Contract>(`/contracts/${id}`);
