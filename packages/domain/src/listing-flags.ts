/**
 * Cờ hiển thị của một tin đăng xe — luật nhỏ nhưng phải nói GIỐNG NHAU ở thẻ kết quả tìm kiếm, trang
 * chi tiết xe và app native. Mỗi nơi tự viết lại thì chỉ cần một trường thiếu (`ratingAvg: null`
 * khi đã có `ratingCount`) là cùng một chiếc xe "mới" ở trang này mà "cũ" ở trang kia.
 */

export interface ListingRatingLike {
  ratingCount: number;
  ratingAvg?: string | null;
}

/**
 * "Xe mới" = chiếc xe CHƯA có điểm đánh giá đọc được: chưa ai chấm, hoặc backend chưa trả điểm
 * trung bình. Đây là tín hiệu "mới lên sàn" thay cho dòng sao — không phải "đời xe mới".
 */
export function isNewListing(listing: ListingRatingLike): boolean {
  if (listing.ratingCount <= 0) return true;
  if (listing.ratingAvg == null || listing.ratingAvg === '') return true;
  return !Number.isFinite(Number(listing.ratingAvg));
}
