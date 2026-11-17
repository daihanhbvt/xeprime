import { apiGet } from '@/services/api-client';
import type { PlatformWalletEntryPage, PlatformWalletSummary } from './types';

/** Một trang bút toán trong drawer — đủ một màn đọc, phân trang ở server. */
export const PLATFORM_WALLET_ENTRY_LIMIT = 20;

const base = (ownerType: string, ownerId: string): string =>
  `/platform/wallets/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}`;

export const fetchPlatformWallet = (
  ownerType: string,
  ownerId: string,
): Promise<PlatformWalletSummary> => apiGet<PlatformWalletSummary>(base(ownerType, ownerId));

export const fetchPlatformWalletEntries = (
  ownerType: string,
  ownerId: string,
  page: number,
): Promise<PlatformWalletEntryPage> =>
  apiGet<PlatformWalletEntryPage>(`${base(ownerType, ownerId)}/entries`, {
    page,
    limit: PLATFORM_WALLET_ENTRY_LIMIT,
  });
