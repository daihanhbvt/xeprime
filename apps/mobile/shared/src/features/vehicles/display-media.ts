import { VEHICLE_IMAGE_TYPE, vehicleGallerySlotTypes } from '@xeprime/types';
import type { VehicleDetail } from './api';

type VehicleMediaItem = NonNullable<VehicleDetail['media']>[number];

/**
 * Ảnh xe dùng cho slider/dải ảnh trên thẻ thông tin xe — BỎ ảnh loại "Ảnh khác".
 *
 * Ô "Ảnh khác" đã gỡ khỏi bảng ảnh (mỗi ảnh phải có góc chụp — xem `VehicleImagesScreen`); ảnh
 * cũ loại đó vẫn nằm trong `media` để lưu lại nguyên vẹn, nhưng không còn được trưng ra. Ảnh đại
 * diện có ô riêng nên cũng không lặp lại ở đây. Một nguồn cho mọi nơi trưng ảnh xe, để các dải
 * ảnh không lệch nhau.
 */
export function vehicleDisplayMedia(
  vehicle: Pick<VehicleDetail, 'media' | 'mainImageUrl'>,
): VehicleMediaItem[] {
  return (vehicle.media ?? []).filter(
    (item) => item.type !== VEHICLE_IMAGE_TYPE.OTHER && item.url !== vehicle.mainImageUrl,
  );
}

export interface VehicleGalleryItem {
  url: string;
  /** Nhãn vị trí ("Mặt trước"…) — `null` với ảnh cũ chỉ có URL, chưa gán vị trí. */
  label: string | null;
}

/**
 * Ảnh của THƯ VIỆN ẢNH xe, theo thứ tự góc: ô tô 5 góc (trước · sau · trái · phải · nội thất), xe máy 2
 * góc (trước · sau, + mặt đồng hồ của dữ liệu cũ) - `vehicleGallerySlotTypes`. Ảnh "Ảnh khác" và ảnh
 * không thuộc góc nào KHÔNG trưng (người dùng chốt 26/11/2026, web + app cùng luật).
 */
export function vehicleGalleryItems(
  vehicle: Pick<VehicleDetail, 'media' | 'images' | 'mainImageUrl' | 'vehicleType'>,
  slotLabel: (type: string | null | undefined) => string,
): VehicleGalleryItem[] {
  // `media` có thể vắng ở bản ghi cũ trong cache dù DTO khai bắt buộc.
  const media = vehicle.media ?? [];
  const cover = vehicle.mainImageUrl;
  /*
   * Thư viện CHỈ trưng ảnh theo góc của loại xe (26/11/2026): ô tô 5 góc, xe máy 2 góc (+ mặt đồng
   * hồ cũ) - mỗi góc một tấm, theo thứ tự góc. Ảnh "Ảnh khác" và ảnh không thuộc góc nào không vào;
   * ảnh cà vẹt không nằm trong `media` (lưu riêng ở giấy tờ xe). Bìa cột riêng của dữ liệu cũ lấp
   * vào ô mặt trước khi ô đó trống.
   */
  if (media.length > 0) {
    return vehicleGallerySlotTypes(vehicle.vehicleType).flatMap((type) => {
      const url =
        // Ô mặt trước = ẢNH BÌA (chủ xe chọn) trước, rồi mới tới ảnh gán góc trước - bìa hero khớp web.
        (type === VEHICLE_IMAGE_TYPE.FRONT ? cover : null) ??
        media.find((item) => item.type === type)?.url ??
        null;
      return url ? [{ url, label: slotLabel(type) }] : [];
    });
  }
  // Xe cũ chưa gán góc cho ảnh nào: dùng danh sách URL cũ, bìa đứng đầu, không quá số góc của loại xe.
  const legacy = [...(cover ? [cover] : []), ...(vehicle.images ?? []).filter((url) => url !== cover)];
  return legacy
    .slice(0, vehicleGallerySlotTypes(vehicle.vehicleType).length)
    .map((url) => ({ url, label: null }));
}
