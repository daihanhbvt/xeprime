import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, WALLET_OWNER_TYPE } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountDto, SaveBankAccountDto } from './dto/bank-account.dto';

/**
 * Tài khoản nhận tiền của GIAN HÀNG (ADR 0033).
 *
 * `tenant_id` lấy từ membership qua `@TenantScoped`, không bao giờ từ body — đây là bề mặt mà
 * một API nhận chủ từ payload sẽ cho phép người lạ chuyển tiền của gian hàng khác về tài khoản
 * của mình.
 *
 * Quyền dùng chung với hồ sơ người bán: đổi tài khoản nhận tiền là quyết định tiền của chủ gian
 * hàng, không phải việc của nhân viên trực đơn. Không gắn `@RequiresFeature` — nhận được tiền
 * thuộc bộ CƠ BẢN (ADR 0027 điều 1); gian hàng hết hạn gói vẫn phải rút được tiền của họ.
 */
@ApiTags('bank-accounts')
@Controller('shop/bank-accounts')
@TenantScoped()
export class ShopBankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({ summary: 'Tài khoản nhận tiền của gian hàng — số đã che' })
  @ApiOkResponse({ type: [BankAccountDto] })
  list(@CurrentTenant() tenant: TenantContext): Promise<BankAccountDto[]> {
    return this.accounts.list({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @ApiOperation({ summary: 'Thêm tài khoản nhận tiền cho gian hàng' })
  @ApiOkResponse({ type: BankAccountDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SaveBankAccountDto,
  ): Promise<BankAccountDto> {
    return this.accounts.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      dto,
    );
  }

  @Patch(':id/default')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @ApiOperation({ summary: 'Đặt làm tài khoản nhận tiền mặc định của gian hàng' })
  @ApiOkResponse({ type: BankAccountDto })
  setDefault(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BankAccountDto> {
    return this.accounts.setDefault(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      id,
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ dùng một tài khoản của gian hàng (lưu trữ, không xoá)' })
  @ApiNoContentResponse()
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.accounts.archive({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId }, id);
  }
}
