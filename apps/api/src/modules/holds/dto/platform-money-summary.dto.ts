import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SỐ ĐẾM của các hàng đợi tiền — dải thẻ đầu màn Tài chính và số trên từng mục hàng đợi.
 *
 * Mỗi nhóm đếm ĐÚNG tập mà danh sách tương ứng hiện ở chế độ mặc định ("việc cần làm"): bấm vào
 * thẻ "12" mà danh sách ra 11 dòng là người trực mất niềm tin vào cả hai con số.
 *
 * Trạng thái HIỆN TẠI, không theo ngày — khác hẳn bảng đối soát ngày (`reconciliation/daily`),
 * vốn chụp số dư tại cuối một ngày cụ thể.
 */
export class MoneyQueueCountDto {
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Tổng tiền của các dòng đang đếm, string — ADR 0007' })
  amount!: string;
}

export class BankInQueueSummaryDto extends MoneyQueueCountDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Lúc khoản CŨ NHẤT còn chưa khớp tới ngân hàng (thiếu mốc ngân hàng thì lúc webhook về) — ISO-8601 UTC',
  })
  oldestAt!: string | null;
}

export class HoldQueueSummaryDto extends MoneyQueueCountDto {
  @ApiProperty({ description: 'Trong số đó, bao nhiêu khoản đang bị tạm giữ vì tranh chấp mở' })
  disputeCount!: number;
}

export class WithdrawalQueueSummaryDto extends MoneyQueueCountDto {
  @ApiProperty({ description: 'Lệnh đã quá hạn cam kết chuyển' }) overdueCount!: number;
}

/**
 * Thuế đã khấu trừ CHƯA KÊ KHAI — mọi kỳ, không chỉ kỳ hiện hành: ngày 1 của tháng là lúc kỳ
 * TRƯỚC đến hạn kê khai, và đếm riêng kỳ này thì kỳ cần làm nhất biến khỏi thẻ.
 */
export class TaxQueueSummaryDto extends MoneyQueueCountDto {
  @ApiProperty({ description: 'Kỳ hiện hành theo giờ VN', example: '2026-10' })
  period!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-09',
    description: 'Kỳ CŨ NHẤT còn dòng chưa kê khai — null khi không còn dòng nào',
  })
  oldestPeriod!: string | null;
}

export class PlatformMoneySummaryDto {
  @ApiProperty({ type: BankInQueueSummaryDto, description: 'Tiền vào CHƯA KHỚP' })
  bankIn!: BankInQueueSummaryDto;
  @ApiProperty({ type: HoldQueueSummaryDto, description: 'Giữ chỗ ĐÃ TRẢ, chưa chốt kết cục' })
  holds!: HoldQueueSummaryDto;
  @ApiProperty({ type: MoneyQueueCountDto, description: 'Khoản hoàn CHỜ CHUYỂN tay' })
  refunds!: MoneyQueueCountDto;
  @ApiProperty({
    type: WithdrawalQueueSummaryDto,
    description: 'Lệnh rút còn việc phải làm (chờ duyệt + đã duyệt chưa chuyển)',
  })
  withdrawals!: WithdrawalQueueSummaryDto;
  @ApiProperty({ type: MoneyQueueCountDto, description: 'Hợp đồng bảo hiểm ĐANG LỖI cấp' })
  insurance!: MoneyQueueCountDto;
  @ApiProperty({ type: TaxQueueSummaryDto, description: 'Dòng thuế kỳ hiện hành CHỜ KÊ KHAI' })
  tax!: TaxQueueSummaryDto;
}
