import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/**
 * Type màn "Gói & hạn mức" lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO.
 *
 * CHỈ ĐỌC: app Partner không bán gói (không IAP) — mua/gia hạn, hoá đơn và chuyển khoản sống ở
 * web partner.xeprime.vn. Các lời gọi `purchase`/`invoices`/`payment-info` cố ý KHÔNG có ở đây.
 */
export type MySubscription = Schemas['MySubscriptionDto'];
export type SlotUsage = Schemas['SlotUsageDto'];

export const subscriptionApi = {
  me(): Promise<MySubscription> {
    return getApiClient().get<MySubscription>('/subscription');
  },
};
