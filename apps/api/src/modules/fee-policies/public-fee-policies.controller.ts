import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { BookingLimitsDto } from './dto/fee-policy.dto';
import { PartnerOfferDto } from './dto/partner-offer.dto';
import { FeePoliciesService } from './fee-policies.service';

/**
 * Số liệu công khai của chính sách phí — phần dùng để mời chủ xe và giới hạn đặt xe của khách, không có
 * kinh tế từng chuyến.
 */
@ApiTags('public-fee-policies')
@Controller('public/fee-policies')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicFeePoliciesController {
  constructor(private readonly policies: FeePoliciesService) {}

  @Public()
  @Get('partner-offer')
  @ApiOperation({ summary: 'Khoảng % hoa hồng (thấp nhất → cao nhất) của chính sách hiện hành - cho lời mời hợp tác' })
  @ApiOkResponse({ type: PartnerOfferDto })
  async partnerOffer(): Promise<PartnerOfferDto> {
    const policy = await this.policies.findEffective();
    const percents = policy?.ownerCommissionTiers.map((tier) => tier.percent) ?? [];
    if (!percents.length) return { minOwnerCommissionPercent: null, maxOwnerCommissionPercent: null };
    return {
      minOwnerCommissionPercent: Math.min(...percents),
      maxOwnerCommissionPercent: Math.max(...percents),
    };
  }

  @Public()
  @Get('booking-limits')
  @ApiOperation({
    summary:
      'Giới hạn đặt xe của khách trên chợ - đặt trước tối đa N ngày, tự lái tối đa M ngày (ADR 0091 điều 4)',
  })
  @ApiOkResponse({ type: BookingLimitsDto })
  bookingLimits(): Promise<BookingLimitsDto> {
    return this.policies.bookingLimits();
  }
}
