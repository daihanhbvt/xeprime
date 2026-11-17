import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type PlatformWalletSummary = Schemas['PlatformWalletSummaryDto'];
export type PlatformWalletEntry = Schemas['PlatformWalletEntryDto'];
export type PlatformWalletEntryPage = Schemas['PlatformWalletEntryPageDto'];

/** Chủ ví mở từ màn khách / đối tác / lệnh rút: loại + id (+ tên để tiêu đề có ngay khi tải). */
export interface PlatformWalletOwner {
  ownerType: string;
  ownerId: string;
  ownerName?: string | null;
}
