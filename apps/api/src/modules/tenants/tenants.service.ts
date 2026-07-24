import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  TENANT_STATUS_SUBMITTABLE,
  TENANT_TYPE,
  type TenantStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MyShopDto,
  RegisterShopDto,
  TenantProfileDto,
  UpdateTenantProfileDto,
} from './dto/tenant-onboarding.dto';

const PROFILE_SELECT = {
  displayName: true,
  bio: true,
  logoUrl: true,
  coverUrl: true,
  address: true,
  provinceCode: true,
  provinceName: true,
  taxCode: true,
  businessLicenseNo: true,
  bankName: true,
  bankAccountNo: true,
  bankAccountName: true,
  qrUrl: true,
} satisfies Prisma.TenantProfileSelect;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Đăng ký gian hàng cho user chưa thuộc tenant nào. Tạo tenant (draft) + membership chủ shop
   * + hồ sơ rỗng trong một transaction — nửa vời (có tenant mà không có membership) là hỏng.
   */
  async registerShop(userId: string, dto: RegisterShopDto): Promise<MyShopDto> {
    const existing = await this.prisma.tenantMembership.findFirst({
      where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { tenantId: true },
    });
    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Tài khoản đã thuộc một gian hàng. Hãy đăng nhập vào gian hàng đó.',
      });
    }

    const id = newId();
    const tenantId = await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id,
          code: `SHOP-${id}`,
          slug: await this.uniqueSlug(tx, dto.name, id),
          name: dto.name,
          tenantType: dto.tenantType ?? TENANT_TYPE.INDIVIDUAL,
          status: TENANT_STATUS.DRAFT,
          ownerUserId: userId,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
        },
      });
      await tx.tenantMembership.create({
        data: {
          id: newId(),
          tenantId: id,
          userId,
          roleKey: TENANT_ROLE.SHOP_OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
          joinedAt: new Date(),
        },
      });
      await tx.tenantProfile.create({ data: { tenantId: id, displayName: dto.name } });
      return id;
    });

    return this.getMyShop(tenantId);
  }

  async getMyShop(tenantId: string): Promise<MyShopDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        slug: true,
        name: true,
        tenantType: true,
        status: true,
        phone: true,
        email: true,
        profile: { select: PROFILE_SELECT },
      },
    });
    if (!tenant) throw notFound();

    const latest = await this.prisma.approvalTask.findFirst({
      where: { tenantId, targetType: APPROVAL_TARGET_TYPE.TENANT },
      orderBy: { submittedAt: 'desc' },
      select: { status: true, reason: true, submittedAt: true, reviewedAt: true },
    });

    return {
      id: tenant.id,
      code: tenant.code,
      slug: tenant.slug,
      name: tenant.name,
      tenantType: tenant.tenantType,
      status: tenant.status,
      phone: tenant.phone,
      email: tenant.email,
      profile: emptyProfileIfNull(tenant.profile),
      latestApproval: latest
        ? {
            status: latest.status,
            reason: latest.reason,
            submittedAt: latest.submittedAt.toISOString(),
            reviewedAt: latest.reviewedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async updateProfile(tenantId: string, dto: UpdateTenantProfileDto): Promise<MyShopDto> {
    // upsert: tenant tạo qua đường khác có thể chưa có hồ sơ.
    await this.prisma.tenantProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto },
    });
    return this.getMyShop(tenantId);
  }

  /**
   * Gửi (lại) duyệt. Chỉ cho phép khi tenant đang draft/needs_revision/rejected. Snapshot hồ sơ
   * vào approval_task để reviewer thấy đúng thứ đã gửi. Ghi approval_log + audit cùng transaction.
   */
  async submitForReview(tenantId: string, userId: string): Promise<MyShopDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, status: true, profile: { select: PROFILE_SELECT } },
    });
    if (!tenant) throw notFound();

    if (!TENANT_STATUS_SUBMITTABLE.includes(tenant.status as TenantStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message:
          tenant.status === TENANT_STATUS.PENDING_REVIEW
            ? 'Gian hàng đang chờ duyệt.'
            : 'Gian hàng đang hoạt động, không cần gửi duyệt.',
      });
    }

    const isResubmit = tenant.status !== TENANT_STATUS.DRAFT;

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TENANT_STATUS.PENDING_REVIEW },
      });

      const task = await tx.approvalTask.create({
        data: {
          id: newId(),
          tenantId,
          targetType: APPROVAL_TARGET_TYPE.TENANT,
          targetId: tenantId,
          status: APPROVAL_STATUS.PENDING,
          submittedBy: userId,
          snapshot: (tenant.profile ?? {}) as Prisma.InputJsonValue,
        },
      });

      await tx.approvalLog.create({
        data: {
          id: newId(),
          approvalTaskId: task.id,
          action: isResubmit ? APPROVAL_ACTION.RESUBMIT : APPROVAL_ACTION.SUBMIT,
          fromStatus: tenant.status,
          toStatus: TENANT_STATUS.PENDING_REVIEW,
          actorUserId: userId,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'tenant.submit_review',
          targetType: APPROVAL_TARGET_TYPE.TENANT,
          targetId: tenantId,
          before: { status: tenant.status },
          after: { status: TENANT_STATUS.PENDING_REVIEW },
        },
        tx,
      );
    });

    return this.getMyShop(tenantId);
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
    id: string,
  ): Promise<string> {
    const base = slugify(name).slice(0, 100) || 'shop';
    const suffix = id.slice(-6).toLowerCase();
    // ULID suffix gần như chắc chắn không trùng; vẫn kiểm tra để không bao giờ vỡ unique.
    let slug = `${base}-${suffix}`;
    for (let i = 0; i < 5; i += 1) {
      const clash = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (!clash) return slug;
      slug = `${base}-${id.slice(-6 - i - 1).toLowerCase()}`;
    }
    return `${base}-${id.toLowerCase()}`;
  }
}

/** Slug không dấu, chữ thường, gạch nối. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tổ hợp (đã tách nhờ NFD)
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function emptyProfileIfNull(
  profile: Prisma.TenantProfileGetPayload<{ select: typeof PROFILE_SELECT }> | null,
): TenantProfileDto {
  return {
    displayName: profile?.displayName ?? null,
    bio: profile?.bio ?? null,
    logoUrl: profile?.logoUrl ?? null,
    coverUrl: profile?.coverUrl ?? null,
    address: profile?.address ?? null,
    provinceCode: profile?.provinceCode ?? null,
    provinceName: profile?.provinceName ?? null,
    taxCode: profile?.taxCode ?? null,
    businessLicenseNo: profile?.businessLicenseNo ?? null,
    bankName: profile?.bankName ?? null,
    bankAccountNo: profile?.bankAccountNo ?? null,
    bankAccountName: profile?.bankAccountName ?? null,
    qrUrl: profile?.qrUrl ?? null,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy gian hàng',
  });
}
