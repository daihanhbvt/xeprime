/**
 * Nguyện vọng nhận xe của khách thuê dài hạn — đã chuyển sang `@xeprime/domain`.
 *
 * Re-export ở đúng đường dẫn cũ. ADR 0011 yêu cầu "một hàm duy nhất" phân loại nguyện vọng, và
 * yêu cầu đó chỉ đúng khi app native cũng dùng chính hàm đó.
 */
export {
  pickupWishParts,
  type PickupWish,
  type PickupWishKind,
  type PickupWishParts,
} from '@xeprime/domain';
