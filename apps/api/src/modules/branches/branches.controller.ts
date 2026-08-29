import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  RequiresFeature,
  TenantScoped,
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
 * ⚠️ `@RequiresFeature(BRANCHES)` gắn THEO TỪNG ROUTE, không gắn ở class — và đó là chủ đích.
 *
 * Tính năng bán được là **nhiều chi nhánh**, không phải "có chi nhánh". Một gian hàng bậc cơ bản
 * luôn có đúng MỘT chi nhánh mặc định do `registerShop` tạo, và địa chỉ của nó là **địa chỉ công
 * khai của họ trên chợ** — khoá lại là khoá một thứ thuộc bộ cơ bản (ADR 0027 điều 1).
 *
 * Nên ba route dưới đây CỐ Ý không có marker:
 *   GET /branches · GET /branches/:id — không đọc được thì không có form nào để sửa;
 *   PATCH /branches/:id              — sửa địa chỉ chi nhánh của chính mình.
 *
 * Ngoại lệ nằm ở METADATA chứ không giấu trong service: nó hiện trong `route-access`, và
 * `plan-feature-coverage.spec.ts` khai đúng ba route này thành danh sách chờ — thêm bớt một
 * route ở đây là đỏ CI, không phải một thay đổi im lặng.
 */
@ApiTags('branches')
@Controller('branches')
@TenantScoped()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions(PERMISSION.BRANCH_VIEW)
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
