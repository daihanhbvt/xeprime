import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HANDOVER_CONDITION_VALUES,
  HANDOVER_PHOTO_SLOT_VALUES,
  HANDOVER_TYPE_VALUES,
} from '@xeprime/types';

/**
 * Một ô ảnh hiện trạng, bản của KHÁCH.
 *
 * KHÔNG có `fileId`, không tên file gốc, không object key, không URL dài hạn: khách mở ảnh
 * bằng GÓC CHỤP trên chính chuyến của mình (`.../photos/:slot/download`), nên không có định
 * danh nào cầm đi thử ở chuyến khác được. Đây là khác biệt cố ý so với `HandoverPhotoDto` của
 * gian hàng — người vận hành cần `fileId` để quản kho bằng chứng, khách thì không.
 */
export class CustomerTripHandoverEvidencePhotoDto {
  @ApiProperty({
    enum: HANDOVER_PHOTO_SLOT_VALUES,
    description: '@xeprime/types → HandoverPhotoSlot. Mã, không phải nhãn — client tự dịch',
  })
  slot!: string;

  @ApiProperty({ description: 'ISO-8601 UTC — thời điểm ảnh được tải lên' })
  uploadedAt!: string;

  /**
   * Ảnh được đính SAU khi biên bản đã xác nhận.
   *
   * Ảnh vẫn bổ sung được sau lúc xác nhận (`HANDOVER_PHOTO_ATTACHABLE_STATUS`) — nới đúng chỗ
   * đó là chủ ý, vì bằng chứng vào muộn vẫn hơn không bao giờ vào. Cái giá phải trả là bản ghi
   * KHÔNG được im lặng: một tấm chụp ba ngày sau không được đọc như hiện trạng lúc bàn giao,
   * nên cờ này đi kèm mọi tấm để giao diện nói thẳng điều đó với khách.
   */
  @ApiProperty({ description: 'Ảnh thêm sau mốc xác nhận — giao diện phải nói rõ' })
  addedAfterConfirmation!: boolean;
}

/**
 * Một biên bản bàn giao ĐÃ XÁC NHẬN, đứng từ phía khách.
 *
 * Chỉ có biên bản `confirmed` mới ra tới đây: nháp/chờ xác nhận chưa có hiệu lực nghiệp vụ nào
 * (KM chưa vào hồ sơ xe, đơn chưa đổi trạng thái), còn bản đã huỷ thì không còn là hồ sơ của
 * chuyến nào cả. Trưng một bản nháp cho khách là mời họ đối chiếu với thứ gian hàng còn đang gõ.
 *
 * Những gì CỐ Ý không có mặt: `notes`, `conditionNote`, `damageNote` (ghi chú nội bộ),
 * `confirmedByName` và mọi id nhân sự, `rowVersion`, `odometerReadingId`, `fileId`. Chúng thuộc
 * bề mặt vận hành của gian hàng — DTO này là hàng rào, không phải một bản lược bớt tuỳ hứng.
 */
export class CustomerTripHandoverEvidenceDto {
  @ApiProperty({
    enum: HANDOVER_TYPE_VALUES,
    description: '@xeprime/types → HandoverType (`pickup` = giao xe, `return` = nhận lại xe)',
  })
  type!: string;

  /**
   * Khi việc giao/nhận THỰC SỰ xảy ra. Bản ghi trước Wave 10 không có mốc này nên lùi về
   * `confirmedAt` (`handoverOccurredAt`) — `null` chỉ xảy ra với dữ liệu hỏng.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  occurredAt!: string | null;

  /**
   * Khi biên bản được GHI NHẬN trên hệ thống. Trả kèm `occurredAt` chứ không thay nó: hai mốc
   * lệch nhau là chuyện bình thường (giao xe lúc 9h, 9h20 mới vào ghi), và khách có quyền biết
   * biên bản của mình được lập lúc nào.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  confirmedAt!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Chỉ số Odo đọc trên đồng hồ. `null` = CHƯA GHI NHẬN, tuyệt đối không phải 0 km',
  })
  odometerKm!: number | null;

  /** Suy trực tiếp từ `odometerKm === null` — cờ và số không bao giờ nói ngược nhau. */
  @ApiProperty({ description: 'Biên bản đã xác nhận nhưng không có chỉ số Odo' })
  odometerMissing!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: HANDOVER_CONDITION_VALUES,
    description: '@xeprime/types → HandoverCondition. `null` = gian hàng chưa đánh giá hiện trạng',
  })
  condition!: string | null;

  @ApiProperty({ type: [CustomerTripHandoverEvidencePhotoDto] })
  photos!: CustomerTripHandoverEvidencePhotoDto[];
}
