import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LOCATION_SOURCE_VALUES, WARD_ADMINISTRATIVE_TYPE_VALUES } from '@xeprime/types';

/**
 * Một cái GHIM trần: toạ độ + (nếu có) mã địa điểm, không có phần hành chính.
 *
 * Dùng cho chỗ mà "ở đâu" là một ĐỊA ĐIỂM chứ không phải địa chỉ giao nhận — điểm đến của chuyến
 * có tài xế là ca duy nhất hiện nay. Bắt khách chọn xã/phường cho "Sân bay Nội Bài" là hỏi một
 * thứ họ không biết và hệ thống không dùng tới.
 */
export class GeoPinDto {
  @ApiProperty({ description: 'Chuỗi thập phân' }) latitude!: string;
  @ApiProperty({ description: 'Chuỗi thập phân' }) longitude!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) placeId!: string | null;
}

/**
 * Địa chỉ VẬT LÝ có cấu trúc như API TRẢ VỀ.
 *
 * Phía REQUEST không có DTO lồng tương ứng, có chủ đích: mỗi endpoint khai các trường địa chỉ
 * dạng PHẲNG (`provinceCode`, `wardCode`, `addressLine`, `placeId`, `latitude`, `longitude`,
 * `locationSource`, có tiền tố khi một payload mang nhiều địa chỉ). Hai lý do:
 *
 *   1. `booking_requests` mang tới BA địa chỉ trên cùng một payload (đón khách, điểm đến, giao
 *      xe). Lồng chúng lại đòi đổi `pickupAddress` từ chuỗi thành object — một thay đổi PHÁ VỠ
 *      mọi client đang chạy, đổi lấy đúng một cặp ngoặc nhọn.
 *   2. Trường phẳng thêm dần được: client chưa cập nhật gửi thiếu `wardCode` vẫn lưu được, bản
 *      ghi chỉ mang `needsAddressReview = true` — đúng trạng thái thật của nó, và người dùng
 *      được mời bổ sung thay vì bị chặn.
 *
 * Chiều ĐỌC thì gom lại thành object này vì client hiển thị luôn cần cả cụm, và một object có
 * tên là thứ `openapi-typescript` sinh ra được một type dùng lại (ADR 0007).
 */
export class AddressViewDto {
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardName!: string | null;
  @ApiPropertyOptional({ enum: WARD_ADMINISTRATIVE_TYPE_VALUES, nullable: true })
  wardAdministrativeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chuỗi hiển thị đã ghép sẵn — dùng thẳng, đừng ghép lại ở client',
  })
  displayAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) placeId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chuỗi thập phân' })
  latitude!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) longitude!: string | null;
  @ApiPropertyOptional({ enum: LOCATION_SOURCE_VALUES, nullable: true })
  locationSource!: string | null;
  @ApiProperty({
    description:
      'Địa chỉ chưa khớp danh mục hành chính hiện hành — cần người dùng mở ra chọn lại và xác nhận',
  })
  needsAddressReview!: boolean;
}
