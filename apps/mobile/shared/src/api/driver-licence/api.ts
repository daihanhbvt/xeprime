import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một lượt nộp bằng lái — đúng những gì chính chủ tài khoản được thấy (ADR 0057). */
export type DriverLicence = Schemas['DriverLicenceDto'];
/** Bằng đang dùng + lượt nộp gần nhất — cặp mà cổng đặt xe soát. */
export type DriverLicenceOverview = Schemas['DriverLicenceOverviewDto'];
export type DriverLicencePresign = Schemas['DriverLicencePresignDto'];
export type DriverLicenceImage = Schemas['DriverLicenceImageDto'];

/**
 * Bằng lái của tài khoản đang đăng nhập (ADR 0057) — bản native của
 * `apps/web/src/features/driver-licence/api.ts` (ADR 0031: sửa hợp đồng thì sửa CẢ HAI).
 *
 * Chủ sở hữu luôn suy từ phiên — không hàm nào ở đây nhận id người dùng. Endpoint chỉ mở cho
 * realm `customer`; app Partner không gọi tới.
 */
const BASE = '/account/driver-licence';

export const driverLicenceApi = {
  overview(): Promise<DriverLicenceOverview> {
    return getApiClient().get<DriverLicenceOverview>(BASE);
  },

  /** URL ký sống 120 giây — chỉ xin lúc người dùng bấm xem. */
  image(id: string): Promise<DriverLicenceImage> {
    return getApiClient().get<DriverLicenceImage>(`${BASE}/${encodeURIComponent(id)}/image`);
  },

  /**
   * Xin URL tải ảnh. Body ĐÚNG ba trường của `PresignDriverLicenceDto` — API bật
   * `forbidNonWhitelisted`, nên không dùng được `UploadMeta` (có `fileName`) của các luồng khác.
   * `consent: true` vì người dùng vừa chủ động chụp/chọn ảnh ngay dưới lời giới thiệu.
   */
  presign(body: { contentType: string; fileSize: number }): Promise<DriverLicencePresign> {
    return getApiClient().post<DriverLicencePresign>(`${BASE}/presign`, {
      contentType: body.contentType,
      fileSize: body.fileSize,
      consent: true,
    });
  },

  /** Xác nhận đã PUT xong — server soát chữ ký byte rồi chuyển lượt nộp sang `processing`. */
  complete(id: string): Promise<DriverLicence> {
    return getApiClient().post<DriverLicence>(`${BASE}/${encodeURIComponent(id)}/complete`);
  },
};
