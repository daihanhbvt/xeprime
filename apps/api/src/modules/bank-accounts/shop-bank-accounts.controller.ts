import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WALLET_OWNER_TYPE } from '@xeprime/types';
import { CurrentTenant, ShopOwnerOnly, TenantScoped } from '../../common/decorators';
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
 * `@ShopOwnerOnly()` (15/09/2026): CHỈ chủ gian hàng. Đổi tài khoản nhận tiền là đổi ĐÍCH của
 * lệnh chuyển kế tiếp — cùng mức hệ quả với việc bấm rút, nên cùng một cổng. Trước đó nhóm này
 * gác bằng `seller_profile.*`, và `shop_manager` có khoá `view` mặc định.
 *
 * Không gắn `@RequiresFeature` — nhận được tiền thuộc bộ CƠ BẢN (ADR 0027 điều 1); gian hàng hết
 * hạn gói vẫn phải rút được tiền của họ.
 */
@ApiTags('bank-accounts')
@Controller('shop/bank-accounts')
@TenantScoped()
@ShopOwnerOnly()
export class ShopBankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Tài khoản nhận tiền của gian hàng — số đã che' })
  @ApiOkResponse({ type: [BankAccountDto] })
  list(@CurrentTenant() tenant: TenantContext): Promise<BankAccountDto[]> {
    return this.accounts.list({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post()
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ dùng một tài khoản của gian hàng (lưu trữ, không xoá)' })
  @ApiNoContentResponse()
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.accounts.archive({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId }, id);
  }
}
