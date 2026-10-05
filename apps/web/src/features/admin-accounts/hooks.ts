'use client';

import { useQuery } from '@tanstack/react-query';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { lookupAccounts } from './api';
import type { AccountLookupFilters } from './types';

/** Định danh đang tra ở URL searchParams (ADR 0004). Chỉ giữ một: SĐT thắng nếu URL có cả hai. */
export function useAccountLookupFilters() {
  return useUrlFilters<AccountLookupFilters>((sp) => {
    const phone = sp.get('phone')?.trim() || undefined;
    const email = phone ? undefined : sp.get('email')?.trim() || undefined;
    return { phone, email };
  });
}

/** Chỉ gọi khi đã có định danh — ô trống là trạng thái "chưa tra", không phải "không có ai". */
export function useAccountLookup(filters: AccountLookupFilters) {
  const enabled = Boolean(filters.phone || filters.email);
  return useQuery({
    queryKey: ['admin-account-lookup', filters.phone ?? null, filters.email ?? null],
    queryFn: () => lookupAccounts(filters),
    enabled,
  });
}
