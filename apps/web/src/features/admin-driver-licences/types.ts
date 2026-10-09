import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Một lượt nộp bằng lái nhìn từ hàng đợi nền tảng — có chủ tài khoản và kết quả bộ đọc. */
export type PlatformDriverLicence = Schemas['PlatformDriverLicenceDto'];

export type PlatformDriverLicenceCounts = Schemas['PlatformDriverLicenceCountsDto'];

export type ApproveDriverLicenceInput = Schemas['ApproveDriverLicenceDto'];

export type RejectDriverLicenceInput = Schemas['RejectDriverLicenceDto'];

/** Bộ lọc + lượt nộp đang mở — sống ở URL (ADR 0004). */
export interface DriverLicenceQueueFilters {
  status?: string;
  kind?: string;
  q?: string;
  page?: number;
  limit?: number;
  /** Lượt nộp đang mở trong panel. */
  open?: string;
}
