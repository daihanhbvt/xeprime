import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Phản hồi công khai theo đúng hợp đồng webhook của SePay; không dùng envelope `{ data }`. */
export class SepayWebhookAckDto {
  @ApiProperty({
    enum: [true],
    example: true,
    description: 'SePay chỉ coi lần gửi webhook là thành công khi trường này bằng true',
  })
  success!: true;
}

/**
 * Kết quả xử lý nội bộ trước khi controller trả acknowledgement tối giản cho SePay.
 *
 * `received: true` trong MỌI trường hợp đã nhận được (kể cả trùng, kể cả payload bỏ qua) —
 * hợp đồng với SePay là "200 nghĩa là thôi retry" (ADR 0022 ràng buộc 5). Chi tiết cho người
 * vận hành đọc nằm ở `duplicate`/`matched`/`note`, không đổi mã HTTP.
 */
export class SepayWebhookResultDto {
  @ApiProperty() received!: boolean;
  @ApiProperty({
    description:
      'Giao dịch này đã nhận trước đó — dòng `bank_transactions` không được ghi lần nữa. ' +
      'Vẫn có thể `matched: true` nếu dòng cũ còn chưa khớp và lần này khớp được.',
  })
  duplicate!: boolean;
  @ApiProperty({ description: 'Đã khớp tự động vào một khoản giữ chỗ hay hoá đơn gói hay chưa' })
  matched!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Chú thích máy đọc được (partial | activated | already_paid | hold_… | invoice_… | ' +
      'match_failed — giao dịch đã ghi nhưng lượt khớp lỗi, đang nằm ở hàng đợi đối soát)',
  })
  note!: string | null;
}
