import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, type FinanceCategoryType } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CategoryListQueryDto,
  CreateCategoryDto,
  FinanceCategoryDto,
  UpdateCategoryDto,
} from './dto/finance.dto';

const SELECT = {
  id: true,
  type: true,
  name: true,
  isSystem: true,
} satisfies Prisma.FinanceCategorySelect;

/**
 * Danh mục thu/chi. Danh mục hệ thống (`tenant_id` null, `is_system`) seed sẵn dùng chung; tenant
 * tự tạo danh mục riêng. Không sửa/xoá danh mục hệ thống, không đụng danh mục tenant khác.
 */
@Injectable()
export class FinanceCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh mục dùng được cho một tenant = hệ thống + của chính tenant đó. */
  async list(tenantId: string, query: CategoryListQueryDto): Promise<FinanceCategoryDto[]> {
    const rows = await this.prisma.financeCategory.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async create(tenantId: string, dto: CreateCategoryDto): Promise<FinanceCategoryDto> {
    const row = await this.prisma.financeCategory.create({
      data: {
        id: newId(),
        tenantId,
        type: dto.type as FinanceCategoryType,
        name: dto.name.trim(),
        isSystem: false,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  async rename(tenantId: string, id: string, dto: UpdateCategoryDto): Promise<FinanceCategoryDto> {
    await this.loadOwnEditable(tenantId, id);
    const row = await this.prisma.financeCategory.update({
      where: { id },
      data: { name: dto.name.trim() },
      select: SELECT,
    });
    return toDto(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.loadOwnEditable(tenantId, id);
    await this.prisma.financeCategory.delete({ where: { id } });
  }

  /** Chỉ danh mục riêng của tenant (không hệ thống) mới sửa/xoá được. */
  private async loadOwnEditable(tenantId: string, id: string) {
    const cat = await this.prisma.financeCategory.findUnique({
      where: { id },
      select: { id: true, tenantId: true, isSystem: true },
    });
    if (!cat) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy danh mục',
      });
    }
    // Kiểm hệ thống TRƯỚC ownership: danh mục hệ thống (tenant_id null) báo lý do rõ ràng,
    // không lẫn với "không tìm thấy".
    if (cat.isSystem) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể sửa/xoá danh mục hệ thống',
      });
    }
    if (cat.tenantId !== tenantId) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy danh mục',
      });
    }
    return cat;
  }
}

type Row = Prisma.FinanceCategoryGetPayload<{ select: typeof SELECT }>;
function toDto(r: Row): FinanceCategoryDto {
  return { id: r.id, type: r.type, name: r.name, isSystem: r.isSystem };
}
