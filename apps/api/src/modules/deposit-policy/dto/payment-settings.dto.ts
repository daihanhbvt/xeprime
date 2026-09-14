import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import {
  BILLING_MODE_VALUES,
  DEPOSIT_POLICY_REASON_VALUES,
  type BillingMode,
  type DepositPolicyReason,
} from '@xeprime/types';

/** Thân của `PATCH /shop/payment-settings`. `tenantId` KHÔNG có ở đây — nó đến từ membership. */
export class UpdatePaymentSettingsDto {
  @ApiProperty({
    description:
      'Gian hàng có muốn XePrime thu cọc của khách hộ mình không. Chỉ tuyến GÓI đổi được; ' +
      'tuyến hoa hồng luôn thu và trả 403 nếu gọi vào đây.',
  })
  @IsBoolean()
  depositCollectionEnabled!: boolean;
}

/**
 * Trạng thái công tắc + LÝ DO, đủ để màn hình vẽ đúng một trong bốn cảnh mà không phải suy đoán.
 *
 * `editable = false` không có nghĩa là ẩn: tuyến hoa hồng vẫn thấy công tắc BẬT và KHOÁ kèm giải
 * thích (ADR 0027 điều 4 — ẩn nút chỉ là trang trí, chặn thật nằm ở server).
 */
export class PaymentSettingsDto {
  @ApiProperty({ enum: BILLING_MODE_VALUES, description: 'Tuyến thu phí hiện hành của gian hàng' })
  billingMode!: BillingMode;

  @ApiProperty({ description: 'Chuyến mới của gian hàng này có thu cọc qua XePrime không' })
  depositRequired!: boolean;

  @ApiProperty({ description: 'Giá trị công tắc đang lưu. Tuyến hoa hồng luôn true.' })
  depositCollectionEnabled!: boolean;

  @ApiProperty({ description: 'Gói hiện hành có mở quyền bật công tắc không' })
  planAllows!: boolean;

  @ApiProperty({ description: 'Công tắc có sửa được không' })
  editable!: boolean;

  @ApiProperty({
    enum: DEPOSIT_POLICY_REASON_VALUES,
    description: 'Vì sao — client ánh xạ sang câu giải thích, KHÔNG hiện mã này ra màn hình',
  })
  reason!: DepositPolicyReason;
}
