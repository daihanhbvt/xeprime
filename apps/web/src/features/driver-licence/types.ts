import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Một lượt nộp bằng lái — đúng những gì chính chủ tài khoản được thấy (ADR 0057). */
export type DriverLicence = Schemas['DriverLicenceDto'];

/** Bằng đang dùng + lượt nộp gần nhất — cặp mà cổng đặt xe soát. */
export type DriverLicenceOverview = Schemas['DriverLicenceOverviewDto'];

export type DriverLicencePresign = Schemas['DriverLicencePresignDto'];

export type DriverLicenceImage = Schemas['DriverLicenceImageDto'];

/**
 * Chuyến mà bằng phải dùng được — có thì bộ xác thực soát luôn hạng và hạn cho chuyến đó, không
 * thì chỉ cần "đã xác thực".
 */
export interface DriverLicenceTrip {
  vehicleType: string | null | undefined;
  /** Ngày cuối của chuyến theo giờ Việt Nam, `YYYY-MM-DD`. */
  lastDayKey: string;
}
