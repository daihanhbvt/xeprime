import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { PartnerOfferDto } from './dto/partner-offer.dto';
import { FeePoliciesService } from './fee-policies.service';

/** Số liệu công khai của chính sách phí — chỉ phần dùng để mời chủ xe, không có kinh tế từng chuyến. */
@ApiTags('public-fee-policies')
@Controller('public/fee-policies')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicFeePoliciesController {
  constructor(private readonly policies: FeePoliciesService) {}

  @Public()
  @Get('partner-offer')
  @ApiOperation({ summary: 'Khoảng % hoa hồng (thấp nhất → cao nhất) của chính sách hiện hành — cho lời mời hợp tác' })
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
}
