import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import {
  CurrentTenant,
  RequirePermissions,
  RequiresFeature,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import {
  CategoryListQueryDto,
  CreateCategoryDto,
  FinanceCategoryDto,
  UpdateCategoryDto,
} from './dto/finance.dto';
import { FinanceCategoriesService } from './finance-categories.service';

/** Danh mục thu/chi — hệ thống (dùng chung) + của tenant. Sửa/xoá chỉ danh mục riêng của tenant. */
@ApiTags('finance-categories')
@Controller('finance/categories')
@TenantScoped()
@RequiresFeature(PLAN_FEATURE.FINANCE)
export class FinanceCategoriesController {
  constructor(private readonly categories: FinanceCategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Danh mục thu/chi (hệ thống + của tenant)' })
  @ApiOkResponse({ type: [FinanceCategoryDto] })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CategoryListQueryDto,
  ): Promise<FinanceCategoryDto[]> {
    return this.categories.list(tenant.tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @ApiOperation({ summary: 'Tạo danh mục riêng của tenant' })
  @ApiCreatedResponse({ type: FinanceCategoryDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateCategoryDto,
  ): Promise<FinanceCategoryDto> {
    return this.categories.create(tenant.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @ApiOperation({ summary: 'Đổi tên danh mục (chỉ danh mục riêng)' })
  @ApiOkResponse({ type: FinanceCategoryDto })
  rename(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<FinanceCategoryDto> {
    return this.categories.rename(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá danh mục (chỉ danh mục riêng)' })
  @ApiNoContentResponse()
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.categories.remove(tenant.tenantId, id);
  }
}
