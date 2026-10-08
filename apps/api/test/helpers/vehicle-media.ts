/**
 * Bộ ảnh ĐỦ GÓC cho fixture của spec (07/10/2026).
 *
 * Từ đợt siết điều kiện ảnh, "có ảnh" không còn là một con số: ô tô phải có đủ năm góc (trước ·
 * sau · trái · phải · nội thất), xe máy đủ hai (trước · sau) — `requiredVehicleImageTypes`. Một
 * fixture seed ba dòng `vehicle_images` không gán `image_type` nào sẽ bị cổng gửi duyệt báo thiếu
 * `photos`, và lỗi đó hiện ra ở những spec chẳng nói gì về ảnh (chi nhánh, xếp hạng, hoá đơn).
 *
 * Helper này ở đây để các spec đó khai đúng một lần, thay vì mỗi nơi chép tay một danh sách góc —
 * và để khi bộ góc bắt buộc đổi lần nữa thì chỉ có một chỗ phải sửa.
 */
import { newId } from '@xeprime/prisma';
import { requiredVehicleImageTypes, VEHICLE_COVER_IMAGE_TYPE } from '@xeprime/types';

/** `media` của payload `POST/PATCH /vehicles` — đủ góc bắt buộc của loại xe. */
export function requiredVehicleMedia(
  vehicleType: string,
  urlOf: (type: string) => string = (type) => `https://img.example/${type}.jpg`,
): { url: string; type: string }[] {
  return requiredVehicleImageTypes(vehicleType).map((type) => ({ url: urlOf(type), type }));
}

/** Dòng `vehicle_images` cho fixture seed THẲNG bằng Prisma (không qua service). */
export function requiredVehicleImageRows(input: {
  vehicleId: string;
  tenantId: string;
  vehicleType: string;
  /** Tiền tố URL — để hai chiếc xe trong cùng spec không trùng ảnh nhau. */
  prefix?: string;
}): { id: string; tenantId: string; vehicleId: string; imageUrl: string; imageType: string; sortOrder: number }[] {
  const prefix = input.prefix ?? input.vehicleId.slice(-6);
  return requiredVehicleImageTypes(input.vehicleType).map((type, sortOrder) => ({
    id: newId(),
    tenantId: input.tenantId,
    vehicleId: input.vehicleId,
    imageUrl: `https://img.example/${prefix}-${type}.jpg`,
    imageType: type,
    sortOrder,
  }));
}

/**
 * Ảnh BÌA mà server sẽ suy ra cho bộ trên — fixture seed thẳng bằng Prisma phải tự ghi nó, vì nó
 * không đi qua `replaceMedia`.
 */
export function coverUrlFor(vehicleType: string, prefix: string): string {
  return requiredVehicleImageRows({
    vehicleId: prefix,
    tenantId: 'x',
    vehicleType,
    prefix,
  }).find((row) => row.imageType === VEHICLE_COVER_IMAGE_TYPE)!.imageUrl;
}
