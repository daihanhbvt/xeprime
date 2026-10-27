'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPartnerOffer } from '../api';

/** % hoa hồng trần của chính sách phí hiện hành — đổi hiếm, cache dài. */
export function usePartnerOffer() {
  return useQuery({
    queryKey: queryKeys.feePolicies.partnerOffer(),
    queryFn: fetchPartnerOffer,
    staleTime: 60 * 60 * 1000,
  });
}
