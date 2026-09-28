import { apiGet, apiPost } from '@/services/api-client';
import type { OpenSupportContextInput, SupportContext } from './types';

/**
 * Vòng đời phiên hỗ trợ gian hàng (ADR 0050) — endpoint NỀN TẢNG.
 *
 * Mọi thao tác TRONG khu gian hàng không đi qua đây: chúng gọi API của chính feature đó (xe, ảnh,
 * bảo dưỡng), và client HTTP gắn header phiên theo URL đang mở (`tenantSupportContextIdFromPath`).
 */
const BASE = '/platform/tenant-support/contexts';

export const openSupportContext = (body: OpenSupportContextInput): Promise<SupportContext> =>
  apiPost<SupportContext>(BASE, body);

export const fetchSupportContext = (id: string): Promise<SupportContext> =>
  apiGet<SupportContext>(`${BASE}/${encodeURIComponent(id)}`);

export const revokeSupportContext = (id: string): Promise<{ ok: boolean }> =>
  apiPost<{ ok: boolean }>(`${BASE}/${encodeURIComponent(id)}/revoke`);
