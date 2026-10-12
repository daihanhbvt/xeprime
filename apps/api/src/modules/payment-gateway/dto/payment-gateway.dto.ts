import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_GATEWAY_CLIENT_VALUES,
  PAYMENT_GATEWAY_PROVIDER_VALUES,
  PAYMENT_ORDER_APPLY_OUTCOME_VALUES,
  PAYMENT_ORDER_STATUS_VALUES,
  PAYMENT_ORDER_TARGET_VALUES,
  PAYMENT_ORDER_VIEW_STATE_VALUES,
  SUPPORTED_LOCALES,
} from '@xeprime/types';
import { IsIn, IsOptional } from 'class-validator';

/** Phản hồi IPN theo ĐÚNG hợp đồng của VNPAY — không bọc `{ data }`. */
export class VnpayIpnAckDto {
  @ApiProperty({
    example: '00',
    description:
      '00 đã xác nhận · 01 không có đơn · 02 đã xác nhận trước đó · 04 sai số tiền · 97 sai chữ ký · 99 lỗi khác',
  })
  RspCode!: string;
  @ApiProperty({ example: 'Confirm Success' }) Message!: string;
}

/** Một phương thức thanh toán qua cổng đang mở cho một luồng. */
export class PaymentGatewayMethodDto {
  @ApiProperty({ enum: PAYMENT_GATEWAY_PROVIDER_VALUES }) provider!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tiền tối thiểu cổng công bố (VND, chuỗi) — null khi tài liệu không công bố',
  })
  minAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tiền tối đa cổng công bố (VND, chuỗi) — null khi tài liệu không công bố',
  })
  maxAmount!: string | null;
}

/**
 * Phương thức cổng mở cho MỘT luồng. Danh sách rỗng là câu trả lời bình thường (chưa cấu hình hoặc
 * luồng chưa bật) — giao diện không vẽ gì, không vẽ một nút sẽ hỏng.
 */
export class PaymentGatewayMethodsDto {
  @ApiProperty({ enum: PAYMENT_ORDER_TARGET_VALUES }) target!: string;
  @ApiProperty({
    description:
      'Cổng đang ở môi trường thử (sandbox) — giao diện gắn nhãn để người thử không tưởng mình trả tiền thật',
  })
  sandbox!: boolean;
  @ApiProperty({ type: [PaymentGatewayMethodDto] }) methods!: PaymentGatewayMethodDto[];
}

/**
 * Mở phiên thanh toán qua cổng. KHÔNG có số tiền, mã đối soát hay đích nào ở đây — server đọc tất
 * cả từ database theo hoá đơn/chuyến trên đường dẫn, và theo phiên của người gọi.
 */
export class StartGatewayCheckoutDto {
  @ApiProperty({ enum: PAYMENT_GATEWAY_PROVIDER_VALUES })
  @IsIn(PAYMENT_GATEWAY_PROVIDER_VALUES)
  provider!: string;

  @ApiPropertyOptional({
    enum: PAYMENT_GATEWAY_CLIENT_VALUES,
    description:
      'Mở từ đâu — `native` thì trang quay về hiện nút mở lại ứng dụng. Mặc định `web`. Không phải quyền.',
  })
  @IsOptional()
  @IsIn(PAYMENT_GATEWAY_CLIENT_VALUES)
  client?: string;

  @ApiPropertyOptional({
    enum: SUPPORTED_LOCALES,
    description: 'Ngôn ngữ trang của cổng. Vắng thì theo cookie ngôn ngữ, rồi `vi`.',
  })
  @IsOptional()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: string;
}

/**
 * MỘT lượt thanh toán qua cổng nhìn từ phía NGƯỜI TRẢ — trang quay về và khối thanh toán đọc cái này.
 *
 * `viewState` do server tính; client chỉ hiển thị. Không trường nào ở đây đến từ URL quay về của
 * cổng — trình duyệt quay về chỉ mang ID của lượt.
 */
export class PaymentOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PAYMENT_GATEWAY_PROVIDER_VALUES }) provider!: string;
  @ApiProperty({ enum: PAYMENT_ORDER_TARGET_VALUES }) targetType!: string;
  @ApiProperty({ description: 'Mã đối soát của đích (XPG… / XPH…)' }) targetCode!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chuyến (id yêu cầu thuê) — chỉ có ở lượt trả tiền giữ chỗ',
  })
  tripId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hoá đơn gói — chỉ có ở lượt trả hoá đơn gói',
  })
  invoiceId!: string | null;
  @ApiProperty({ description: 'Số tiền đã gửi sang cổng — VND, chuỗi (ADR 0007)' }) amount!: string;
  @ApiProperty({ enum: PAYMENT_ORDER_STATUS_VALUES }) status!: string;
  @ApiProperty({
    enum: PAYMENT_ORDER_VIEW_STATE_VALUES,
    description:
      'Chặng nhìn từ phía người trả — awaiting · confirming · completed · ' +
      'duplicate_refunded (trả trùng, đã ghi hoàn vào Ví điểm) · failed · needs_support',
  })
  viewState!: string;
  @ApiPropertyOptional({ enum: PAYMENT_ORDER_APPLY_OUTCOME_VALUES, nullable: true, type: String })
  applyOutcome!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Liên kết thanh toán — chỉ có khi lượt còn chờ và chưa quá hạn dùng lại; mở lại để trả tiếp',
  })
  checkoutUrl!: string | null;
  @ApiProperty({ description: 'Hạn dùng lại liên kết — ISO-8601 UTC' }) expiresAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lúc cổng báo đã thu — ISO' })
  paidAt!: string | null;
  @ApiProperty({ description: 'Cổng đang ở môi trường thử' }) sandbox!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}
