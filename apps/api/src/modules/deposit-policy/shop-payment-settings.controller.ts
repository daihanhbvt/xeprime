import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  RequiresFeature,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { DepositPolicyService, type DepositPolicyResolution } from './deposit-policy.service';
import { PaymentSettingsDto, UpdatePaymentSettingsDto } from './dto/payment-settings.dto';

/**
 * Công tắc thu cọc của GIAN HÀNG — Phase 6 (ADR 0032 điều 2 · ADR 0027 điều 2/4).
 *
 * `tenant_id` từ membership qua `@TenantScoped`, không bao giờ từ body: một API nhận chủ từ
 * payload ở đây cho phép người lạ tắt thu cọc của gian hàng khác.
 *
 * `GET` cố ý KHÔNG gắn `@RequiresFeature`: mọi gian hàng phải ĐỌC được trạng thái của mình, kể
 * cả khi gói chưa có `escrow_hold` — đó chính là lúc màn hình cần nói "tính năng này thuộc gói
 * nào". Chỉ đường GHI mới đi qua cờ.
 *
 * Quyền dùng chung với hồ sơ người bán: quyết định XePrime có giữ tiền của khách hay không là
 * quyết định TIỀN của chủ gian hàng, không phải thao tác của nhân viên trực đơn.
 */
@ApiTags('shop-payment-settings')
@Controller('shop/payment-settings')
@TenantScoped()
export class ShopPaymentSettingsController {
  constructor(private readonly depositPolicy: DepositPolicyService) {}

  @Get()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({
    summary: 'Công tắc thu cọc của gian hàng — kèm lý do bật/tắt/khoá',
    description:
      'Tuyến hoa hồng trả `depositRequired = true`, `editable = false`: công tắc hiện ở trạng ' +
      'thái bật và khoá, không ẩn (ADR 0027 điều 4).',
  })
  @ApiOkResponse({ type: PaymentSettingsDto })
  async get(@CurrentTenant() tenant: TenantContext): Promise<PaymentSettingsDto> {
    return toDto(await this.depositPolicy.resolveForTenant(tenant.tenantId));
  }

  @Patch()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @RequiresFeature(PLAN_FEATURE.ESCROW_HOLD)
  @ApiOperation({
    summary: 'Bật/tắt thu cọc qua XePrime (chỉ tuyến gói)',
    description:
      'Tuyến hoa hồng → 403 `DEPOSIT_ALWAYS_REQUIRED`. Gói thiếu `escrow_hold` → 403 ' +
      '`FEATURE_NOT_IN_PLAN`. Đổi công tắc KHÔNG đụng đơn đã tạo — `deposit_collection_mode` ' +
      'đóng băng lúc tạo đơn (ADR 0025 ràng buộc 4).',
  })
  @ApiOkResponse({ type: PaymentSettingsDto })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentSettingsDto,
  ): Promise<PaymentSettingsDto> {
    return toDto(
      await this.depositPolicy.updateSettings(
        tenant.tenantId,
        user.id,
        dto.depositCollectionEnabled,
      ),
    );
  }
}

function toDto(resolution: DepositPolicyResolution): PaymentSettingsDto {
  return {
    billingMode: resolution.billingMode,
    depositRequired: resolution.required,
    depositCollectionEnabled: resolution.toggleEnabled,
    planAllows: resolution.planAllows,
    editable: resolution.editable,
    reason: resolution.reason,
  };
}
