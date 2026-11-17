import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PartnerContactDto } from './dto/platform-partner.dto';
import { PlatformPartnerContactService } from './platform-partner-contact.service';

/**
 * Bỏ che liên hệ của đối tác trên drawer Platform Admin.
 *
 * Controller RIÊNG, không nằm trong `PlatformPartnersController`: controller đó hứa "chỉ có GET,
 * đọc không để lại dấu" (khoá bằng `platform-partners.spec.ts`), còn lượt này là POST và ghi
 * audit từng lần — hai lời hứa khác nhau thì hai lớp khác nhau.
 */
@ApiTags('platform-tenants')
@Controller('platform/partners/:tenantId/contact')
@PlatformOnly()
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformPartnerContactController {
  constructor(private readonly contact: PlatformPartnerContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_TENANT_PII_VIEW)
  @ApiOperation({
    summary: 'Xem SĐT/email đầy đủ của chủ và liên hệ công khai của đối tác (ghi audit từng lần)',
  })
  @ApiOkResponse({ type: PartnerContactDto })
  reveal(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnerContactDto> {
    return this.contact.reveal(tenantId, user.id);
  }
}
