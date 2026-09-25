import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  RequiresFeature,
  SubscriptionTrackOnly,
  TenantScoped,
  SupportAction,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BranchesService } from './branches.service';
import {
  BranchDto,
  BranchListDto,
  BranchListQueryDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/branch.dto';

/**
 * Chi nhánh gian hàng — tenant-scoped. `tenantId` lấy từ membership của phiên, KHÔNG nhận từ
 * body/query (CLAUDE.md mục 5): id chi nhánh của gian hàng khác trả 404, không phải 403.
 *
 * Không có `DELETE`: chi nhánh còn xe/đơn là dữ liệu lịch sử của những chuyến đã đi. Vòng đời
 * đúng là `deactivate` (ngừng nhận xe mới) — xoá cứng bị FK chặn ở DB.
 *
 * ⚠️ CẢ HAI cổng — `@RequiresFeature(BRANCHES)` và `@SubscriptionTrackOnly()` — gắn THEO TỪNG
 * ROUTE, không gắn ở class, và gắn lên ĐÚNG CÙNG BỐN route. Đó là chủ đích.
 *
 * Tính năng bán được là **nhiều chi nhánh**, không phải "có chi nhánh". Mọi tenant — gian hàng
 * bậc cơ bản lẫn chủ xe tuyến hoa hồng — luôn có đúng MỘT chi nhánh mặc định do `registerShop`
 * tạo, và địa chỉ của nó là **địa chỉ giao nhận xe công khai của họ trên chợ**: chỗ khách tới
 * lấy xe, và điểm xuất phát của mọi phép tính phí giao tận nơi. Khoá lại là khoá một thứ thuộc
 * bộ cơ bản (ADR 0027 điều 1).
 *
 * Nên ba route dưới đây CỐ Ý không có cổng nào:
 *   GET /branches · GET /branches/:id — không đọc được thì không có form nào để sửa;
 *   PATCH /branches/:id              — sửa địa chỉ chi nhánh của chính mình.
 *
 * ⚠️ Tới 17/09/2026 `@SubscriptionTrackOnly()` còn nằm ở CLASS, và nó khoá luôn ba route trên
 * với tuyến hoa hồng. Hậu quả không phải một menu bị ẩn: `POST /vehicles` BẮT BUỘC `branchId`,
 * nên chủ xe cá nhân không đọc nổi chi nhánh của chính mình ⇒ không đăng nổi chiếc xe đầu tiên
 * (bước "Địa chỉ xe" của `/list-your-vehicle/register` chết ở một bộ chọn rỗng). Ranh giới hai
 * tuyến là bộ quản lý NHIỀU chi nhánh, không phải địa chỉ của chính mình (ADR 0038 điều 4).
 *
 * Ngoại lệ nằm ở METADATA chứ không giấu trong service: nó hiện trong `route-access`, và
 * `plan-feature-coverage.spec.ts` khai đúng ba route này thành danh sách chờ cho CẢ HAI cổng —
 * thêm bớt một route ở đây là đỏ CI, không phải một thay đổi im lặng.
 */
@ApiTags('branches')
@Controller('branches')
@TenantScoped()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions(PERMISSION.BRANCH_VIEW)
  // Ô "chi nhánh giữ xe" ở tab Thông tin xe đọc danh sách này — phiên hỗ trợ chỉ ĐỌC (ADR 0050).
  @SupportAction(SUPPORT_CAPABILITY.BRANCH_VIEW)
  @ApiOperation({ summary: 'Danh sách chi nhánh của gian hàng (kèm số xe mỗi chi nhánh)' })
  @ApiOkResponse({ type: BranchListDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BranchListQueryDto,
  ): Promise<BranchListDto> {
    return this.branches.list(tenant.tenantId, query);
  }

  @Post()
  @RequiresFeature(PLAN_FEATURE.BRANCHES)
  @SubscriptionTrackOnly()
  @RequirePermissions(PERMISSION.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Tạo chi nhánh mới (mã CNxx sinh ở server)' })
  @ApiCreatedResponse({ type: BranchDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchDto> {
    return this.branches.create(tenant.tenantId, user.id, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.BRANCH_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BRANCH_VIEW)
  @ApiOperation({ summary: 'Chi tiết một chi nhánh' })
  @ApiOkResponse({ type: BranchDto })
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<BranchDto> {
    return this.branches.get(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Sửa chi nhánh (đổi tỉnh sẽ đồng bộ lại vị trí công khai của xe)' })
  @ApiOkResponse({ type: BranchDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchDto> {
    return this.branches.update(tenant.tenantId, id, user.id, dto);
  }

  @Post(':id/set-default')
  @RequiresFeature(PLAN_FEATURE.BRANCHES)
  @SubscriptionTrackOnly()
  @RequirePermissions(PERMISSION.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Đặt làm chi nhánh mặc định của gian hàng' })
  @ApiOkResponse({ type: BranchDto })
  setDefault(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BranchDto> {
    return this.branches.setDefault(tenant.tenantId, id, user.id);
  }

  @Post(':id/deactivate')
  @RequiresFeature(PLAN_FEATURE.BRANCHES)
  @SubscriptionTrackOnly()
  @RequirePermissions(PERMISSION.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Ngừng hoạt động (chặn nếu còn xe hoặc đơn đang chạy/sắp tới)' })
  @ApiOkResponse({ type: BranchDto })
  deactivate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BranchDto> {
    return this.branches.deactivate(tenant.tenantId, id, user.id);
  }

  @Post(':id/activate')
  @RequiresFeature(PLAN_FEATURE.BRANCHES)
  @SubscriptionTrackOnly()
  @RequirePermissions(PERMISSION.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Bật lại chi nhánh đã ngừng hoạt động' })
  @ApiOkResponse({ type: BranchDto })
  activate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BranchDto> {
    return this.branches.activate(tenant.tenantId, id, user.id);
  }
}
