import { VEHICLE_IMAGE_TYPE } from '@xeprime/types';
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
 * MỌI ảnh của một xe theo thứ tự hiển thị — bản native của `vehicleGalleryItems`
 * (`apps/web/src/features/vehicles/media.ts`): ảnh BÌA đầu tiên (kể cả khi nó là cột riêng không
 * nằm trong danh sách ảnh), rồi ảnh theo vị trí có nhãn, hoặc danh sách URL cũ khi xe chưa có
 * ảnh gán vị trí.
 *
 * Khác web ĐÚNG một điểm, theo luật của app: ảnh loại "Ảnh khác" (`VEHICLE_IMAGE_TYPE.OTHER`)
 * KHÔNG được trưng ở thư viện/slider thông tin xe — cùng lý do với `vehicleDisplayMedia`.
 */
export function vehicleGalleryItems(
  vehicle: Pick<VehicleDetail, 'media' | 'images' | 'mainImageUrl'>,
  slotLabel: (type: string | null | undefined) => string,
): VehicleGalleryItem[] {
  // `media` có thể vắng ở bản ghi cũ trong cache dù DTO khai bắt buộc.
  const media = vehicle.media ?? [];
  const typed = media
    .filter((item) => item.type !== VEHICLE_IMAGE_TYPE.OTHER)
    .map((item) => ({ url: item.url, label: slotLabel(item.type) }));
  // Rơi về `images` cũ CHỈ khi xe chưa có ảnh gán vị trí nào — xe chỉ có ảnh "khác" thì không rơi
  // về, nếu không ảnh vừa bị lọc sẽ quay lại qua cửa sau.
  const items: VehicleGalleryItem[] =
    media.length > 0 ? typed : (vehicle.images ?? []).map((url) => ({ url, label: null }));
  const cover = vehicle.mainImageUrl;
  if (!cover) return items;
  const coverItem = items.find((item) => item.url === cover) ?? { url: cover, label: null };
  return [coverItem, ...items.filter((item) => item.url !== cover)];
}
