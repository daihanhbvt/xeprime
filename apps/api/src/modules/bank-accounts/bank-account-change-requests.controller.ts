import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, WALLET_OWNER_TYPE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  PlatformOnly,
  Realms,
  RequirePermissions,
  ShopOwnerOnly,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BankAccountChangeRequestsService } from './bank-account-change-requests.service';
import {
  ApproveBankAccountChangeRequestDto,
  BankAccountChangeRequestDto,
  CreateBankAccountChangeRequestDto,
  PlatformBankAccountChangeRequestDto,
  RejectBankAccountChangeRequestDto,
} from './dto/bank-account-change-request.dto';

/**
 * Yêu cầu ĐỔI tài khoản nhận tiền của VÍ CÁ NHÂN (biên bản họp 19/11/2026) — tài khoản khoá từ lần
 * khai đầu, đổi phải qua yêu cầu + CSKH gọi xác minh. Chủ sở hữu luôn lấy từ session.
 */
@ApiTags('bank-accounts')
@Controller('account/bank-accounts/change-requests')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class AccountBankAccountChangeRequestsController {
  constructor(private readonly requests: BankAccountChangeRequestsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Yêu cầu đổi tài khoản đang chờ xác minh (null nếu không có)' })
  @ApiOkResponse({ type: BankAccountChangeRequestDto })
  current(@CurrentUser() user: AuthenticatedUser): Promise<BankAccountChangeRequestDto | null> {
    return this.requests.current({ type: WALLET_OWNER_TYPE.USER, userId: user.id });
  }

  @Post()
  @ApiOperation({ summary: 'Gửi yêu cầu đổi tài khoản nhận tiền - CSKH gọi xác minh rồi duyệt' })
  @ApiOkResponse({ type: BankAccountChangeRequestDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankAccountChangeRequestDto,
  ): Promise<BankAccountChangeRequestDto> {
    return this.requests.create({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, user.id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Huỷ yêu cầu đổi tài khoản đang chờ' })
  @ApiNoContentResponse()
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.requests.cancel({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, user.id, id);
  }
}

/** Như trên, cho tài khoản nhận tiền của GIAN HÀNG — chỉ chủ gian hàng. */
@ApiTags('bank-accounts')
@Controller('shop/bank-accounts/change-requests')
@TenantScoped()
@ShopOwnerOnly()
@Realms(ACCOUNT_REALM.PARTNER)
export class ShopBankAccountChangeRequestsController {
  constructor(private readonly requests: BankAccountChangeRequestsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Yêu cầu đổi tài khoản của gian hàng đang chờ (null nếu không có)' })
  @ApiOkResponse({ type: BankAccountChangeRequestDto })
  current(@CurrentTenant() tenant: TenantContext): Promise<BankAccountChangeRequestDto | null> {
    return this.requests.current({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post()
  @ApiOperation({ summary: 'Gửi yêu cầu đổi tài khoản nhận tiền của gian hàng' })
  @ApiOkResponse({ type: BankAccountChangeRequestDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankAccountChangeRequestDto,
  ): Promise<BankAccountChangeRequestDto> {
    return this.requests.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      user.id,
      dto,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Huỷ yêu cầu đổi tài khoản đang chờ của gian hàng' })
  @ApiNoContentResponse()
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.requests.cancel(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      user.id,
      id,
    );
  }
}

/**
 * Hàng đợi XÁC MINH đổi tài khoản của admin/CSKH: gọi điện cho người yêu cầu (số trong dòng), đọc
 * số tài khoản mới cho họ xác nhận, rồi duyệt — chỉ lượt duyệt mới thay tài khoản. Không xác minh
 * được ⇒ từ chối kèm lý do.
 */
@ApiTags('platform-money')
@Controller('platform/money/bank-account-change-requests')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformBankAccountChangeRequestsController {
  constructor(private readonly requests: BankAccountChangeRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Yêu cầu đổi tài khoản đang chờ xác minh - cũ nhất trước' })
  @ApiOkResponse({ type: [PlatformBankAccountChangeRequestDto] })
  list(): Promise<PlatformBankAccountChangeRequestDto[]> {
    return this.requests.listPending();
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đã gọi xác minh chính chủ - duyệt và thay tài khoản' })
  @ApiNoContentResponse()
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBankAccountChangeRequestDto,
  ): Promise<void> {
    return this.requests.approve(id, user.id, dto.note?.trim() || null);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Không xác minh được - từ chối, tài khoản giữ nguyên' })
  @ApiNoContentResponse()
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectBankAccountChangeRequestDto,
  ): Promise<void> {
    return this.requests.reject(id, user.id, dto.note.trim());
  }
}
