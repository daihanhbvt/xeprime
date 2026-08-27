import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
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
