import { ApiProperty } from '@nestjs/swagger';

/**
 * GET /public/fee-policies/partner-offer — số liệu cho lời mời "Hợp tác với XePrime".
 *
 * CHỈ có khoảng % hoa hồng (nấc THẤP NHẤT → nấc CAO NHẤT) của chính sách hiện hành — không lộ bảng
 * nấc, thuế hay bất kỳ dòng tiền nào của một chuyến cụ thể (ADR 0064 điều 11).
 */
export class PartnerOfferDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '% hoa hồng thấp nhất trong các nấc; `null` khi chưa có chính sách',
  })
  minOwnerCommissionPercent!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '% hoa hồng cao nhất trong các nấc; `null` khi chưa có chính sách',
  })
  maxOwnerCommissionPercent!: number | null;
}
