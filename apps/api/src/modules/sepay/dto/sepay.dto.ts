import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Kết quả webhook trả cho SePay.
 *
 * `received: true` trong MỌI trường hợp đã nhận được (kể cả trùng, kể cả payload bỏ qua) —
 * hợp đồng với SePay là "200 nghĩa là thôi retry" (ADR 0022 ràng buộc 5). Chi tiết cho người
 * vận hành đọc nằm ở `duplicate`/`matched`/`note`, không đổi mã HTTP.
 */
export class SepayWebhookResultDto {
  @ApiProperty() received!: boolean;
  @ApiProperty({ description: 'Giao dịch này đã nhận trước đó — lần này không ghi gì thêm' })
  duplicate!: boolean;
  @ApiProperty({ description: 'Đã khớp tự động vào một hoá đơn gói hay chưa' })
  matched!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chú thích máy đọc được (partial | activated | already_paid | invoice_… )',
  })
  note!: string | null;
}
