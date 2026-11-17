'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  PLATFORM_WALLET_ENTRY_LIMIT,
  fetchPlatformWallet,
  fetchPlatformWalletEntries,
} from './api';
import type { PlatformWalletOwner } from './types';

/** Số dư + cờ khớp sổ của một chủ ví — chỉ xin khi drawer mở (`owner` khác null). */
export function usePlatformWallet(owner: PlatformWalletOwner | null) {
  return useQuery({
    queryKey: queryKeys.platformWallets.summary(owner?.ownerType ?? '', owner?.ownerId ?? ''),
    queryFn: () => fetchPlatformWallet(owner!.ownerType, owner!.ownerId),
    enabled: Boolean(owner),
    staleTime: 0,
  });
}

export function usePlatformWalletEntries(owner: PlatformWalletOwner | null, page: number) {
  return useQuery({
    queryKey: queryKeys.platformWallets.entries(owner?.ownerType ?? '', owner?.ownerId ?? '', {
      page,
      limit: PLATFORM_WALLET_ENTRY_LIMIT,
    }),
    queryFn: () => fetchPlatformWalletEntries(owner!.ownerType, owner!.ownerId, page),
    enabled: Boolean(owner),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}
