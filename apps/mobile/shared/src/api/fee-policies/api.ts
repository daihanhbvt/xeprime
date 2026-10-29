import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/**
 * Chính sách phí CÔNG KHAI — bản native của `fetchPartnerOffer` (`apps/web/src/features/account/api.ts`).
 * Hai bản KHÔNG tự đồng bộ (ADR 0031): đổi hợp đồng thì sửa cả hai.
 */

/** Khoảng % hoa hồng chủ xe tuyến hoa hồng của chính sách phí hiện hành (ADR 0064 điều 3). */
export type PartnerOffer = Schemas['PartnerOfferDto'];

export const feePoliciesApi = {
  /** Không cần đăng nhập — trang "Đăng xe cho thuê" là lời mời công khai. */
  partnerOffer(): Promise<PartnerOffer> {
    return getApiClient().get<PartnerOffer>('/public/fee-policies/partner-offer');
  },
};
