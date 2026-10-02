import type { VehicleDetail } from './types';

export interface VehicleGalleryItem {
  url: string;
  /** Nhãn vị trí ("Mặt trước"…) — `null` với ảnh cũ chỉ có URL, chưa gán vị trí. */
  label: string | null;
}

/**
 * MỌI ảnh của một xe theo thứ tự hiển thị: ảnh BÌA đầu tiên — đúng thứ tự khách thấy ngoài chợ —
 * rồi ảnh theo vị trí (`media`, có nhãn), hoặc danh sách URL cũ khi xe chưa có ảnh gán vị trí.
 *
 * Ảnh bìa có thể là một cột riêng không nằm trong danh sách ảnh (dữ liệu cũ); khi đó nó vẫn đứng
 * đầu, vì danh sách này là MỌI ảnh của xe. Nơi cần "ảnh phụ" (dải ảnh nhỏ dưới ảnh lớn) tự bỏ ảnh
 * bìa đi.
 *
 * Dùng chung cho thư viện ảnh của Hồ sơ 360 và dải ảnh nhỏ ở đầu màn sửa xe, để hai nơi không
 * tự suy thứ tự và nhãn mỗi nơi một kiểu.
 */
export function vehicleGalleryItems(
  vehicle: Pick<VehicleDetail, 'media' | 'images' | 'mainImageUrl'>,
  slotLabel: (type: string | null | undefined) => string,
): VehicleGalleryItem[] {
  // `media` có thể vắng ở bản ghi cũ trong cache dù DTO khai bắt buộc.
  const typed = (vehicle.media ?? []).map((item) => ({ url: item.url, label: slotLabel(item.type) }));
  const items: VehicleGalleryItem[] =
    typed.length > 0 ? typed : vehicle.images.map((url) => ({ url, label: null }));
  const cover = vehicle.mainImageUrl;
  if (!cover) return items;
  const coverItem = items.find((item) => item.url === cover) ?? { url: cover, label: null };
  return [coverItem, ...items.filter((item) => item.url !== cover)];
}
