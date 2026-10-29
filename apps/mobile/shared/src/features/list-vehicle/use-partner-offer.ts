import { useQuery } from '@tanstack/react-query';
import { feePoliciesApi } from '@/api/fee-policies/api';
import { queryKeys } from '@/queries/query-keys';

/** Một giờ — % hoa hồng trần của chính sách phí đổi hiếm (web `usePartnerOffer`). */
const PARTNER_OFFER_STALE_MS = 60 * 60 * 1000;

/** % hoa hồng của chính sách phí hiện hành — bản native của `usePartnerOffer` web. */
export function usePartnerOffer() {
  return useQuery({
    queryKey: queryKeys.feePolicies.partnerOffer(),
    queryFn: feePoliciesApi.partnerOffer,
    staleTime: PARTNER_OFFER_STALE_MS,
  });
}
