import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  ShopOwnerOnly,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
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
@Realms(ACCOUNT_REALM.PARTNER)
export class ShopBankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'Tài khoản nhận tiền của gian hàng — số đã che',
    description: 'Mảng 0 hoặc 1 phần tử: mỗi chủ MỘT tài khoản nhận tiền đang dùng.',
  })
  @ApiOkResponse({ type: [BankAccountDto] })
  list(@CurrentTenant() tenant: TenantContext): Promise<BankAccountDto[]> {
    return this.accounts.list({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm hoặc ĐỔI tài khoản nhận tiền của gian hàng',
    description:
      'Mỗi chủ một tài khoản: đã có thì tài khoản mới THAY cái cũ (cái cũ lưu trữ, lệnh rút đang ' +
      'chờ giữ đích đã chụp). Khai lại đúng tài khoản đang dùng thì không tạo dòng mới.',
  })
  @ApiOkResponse({ type: BankAccountDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveBankAccountDto,
  ): Promise<BankAccountDto> {
    return this.accounts.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      dto,
      user.id,
    );
  }

  @Patch(':id/default')
  @ApiOperation({
    summary: 'Đặt làm tài khoản nhận tiền mặc định của gian hàng',
    description: 'Tương thích ngược — tài khoản duy nhất luôn là mặc định; trả lại chính nó.',
    deprecated: true,
  })
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
  @ApiOperation({ summary: 'Bỏ dùng tài khoản nhận tiền của gian hàng (lưu trữ, không xoá)' })
  @ApiNoContentResponse()
  archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.accounts.archive(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      id,
      user.id,
    );
  }
}
