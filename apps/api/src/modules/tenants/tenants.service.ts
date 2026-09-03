import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  missingShopProfileRequirements,
  TENANT_ROLE,
  TENANT_STATUS,
  TENANT_STATUS_SUBMITTABLE,
  TENANT_TYPE,
  type TenantStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BranchesService } from '../branches/branches.service';
import { ProvincesService } from '../locations/provinces.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DefaultBranchDto,
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
  ownerFullName: true,
  ownerPhone: true,
  ownerEmail: true,
} satisfies Prisma.TenantProfileSelect;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provinces: ProvincesService,
    private readonly branches: BranchesService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Đăng ký gian hàng cho user chưa thuộc tenant nào.
   *
   * MỘT transaction cho bốn thứ: tenant (draft) + membership chủ shop + hồ sơ + CHI NHÁNH MẶC
   * ĐỊNH. Nửa vời là hỏng theo nhiều kiểu khác nhau — có tenant mà không có membership thì chủ
   * shop không vào được; có tenant mà không có chi nhánh thì không tạo được xe nào.
   *
   * Tỉnh kiểm TRƯỚC transaction: sai mã là lỗi nhập liệu của người dùng, không đáng để mở
   * transaction rồi rollback.
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

    const province = await this.provinces.assertSelectable(dto.provinceCode);

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
      await tx.tenantProfile.create({
        data: {
          tenantId: id,
          displayName: dto.name,
          address: dto.address ?? null,
          // Hai cột này là bản SAO tương thích ngược của chi nhánh mặc định; nguồn sự thật vận
          // hành là `tenant_branches`. Đồng bộ về sau đi qua `syncProfileFromDefaultBranch`.
          provinceCode: province.code,
          provinceName: province.name,
        },
      });
      await this.branches.createDefaultBranch(tx, {
        tenantId: id,
        userId,
        provinceCode: province.code,
        provinceName: province.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
      });
      /*
       * Gói mặc định trong CÙNG transaction (ADR 0015 điều 9) — cùng lý do với chi nhánh và
       * membership ở trên: một gian hàng nửa vời hỏng theo nhiều kiểu khác nhau.
       *
       * Ở đây kiểu hỏng là: từ ADR 0027, cờ năng lực đọc từ gói hiện hành, nên tenant không gói
       * có tập cờ RỖNG và mất sạch tính năng nâng cao ngày cổng chặn bật. Ghi qua
       * `BillingService` chứ không tự `tx.tenantSubscription.create` — nó là writer duy nhất của
       * bảng đó (ADR 0010).
       */
      await this.billing.assignDefaultPlanWithinTx(tx, id);
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

    const [latest, defaultBranch] = await Promise.all([
      this.prisma.approvalTask.findFirst({
        where: { tenantId, targetType: APPROVAL_TARGET_TYPE.TENANT },
        orderBy: { submittedAt: 'desc' },
        select: { status: true, reason: true, submittedAt: true, reviewedAt: true },
      }),
      this.prisma.tenantBranch.findFirst({
        where: { tenantId, isDefault: true, deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          provinceCode: true,
          province: { select: { name: true } },
        },
      }),
    ]);

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
      defaultBranch: defaultBranch
        ? ({
            id: defaultBranch.id,
            code: defaultBranch.code,
            name: defaultBranch.name,
            provinceCode: defaultBranch.provinceCode,
            provinceName: defaultBranch.province?.name ?? null,
          } satisfies DefaultBranchDto)
        : null,
    };
  }

  /**
   * Cập nhật hồ sơ gian hàng.
   *
   * Hai thứ KHÔNG phải là "ghi thẳng vào `tenant_profiles`" và được tách riêng ở đây:
   *
   * 1. **Đang chờ duyệt thì khoá.** Frontend đã nói "tạm khoá chỉnh sửa" từ lâu nhưng backend
   *    vẫn nhận — nghĩa là lời hứa đó chỉ là một thuộc tính `disabled`. Duyệt xong hồ sơ LIVE mới
   *    là thứ lên marketplace, nên sửa trong lúc chờ là duyệt một đằng công khai một nẻo.
   * 2. **Tỉnh/thành đi qua `BranchesService`.** Hai cột tỉnh trên hồ sơ là BẢN SAO của chi nhánh
   *    mặc định (xem `syncProfileFromDefaultBranch`); ghi thẳng vào chúng sẽ đúng cho tới lần
   *    chạm chi nhánh kế tiếp rồi âm thầm bị ghi đè, và trong lúc đó xe vẫn hiển thị ở tỉnh cũ
   *    trên marketplace vì `public_listings` không hề biết có thay đổi.
   */
  async updateProfile(
    tenantId: string,
    userId: string,
    dto: UpdateTenantProfileDto,
  ): Promise<MyShopDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { status: true },
    });
    if (!tenant) throw notFound();
    if (tenant.status === TENANT_STATUS.PENDING_REVIEW) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Hồ sơ đang chờ nền tảng duyệt nên không sửa được.',
      });
    }

    const { provinceCode, ...profile } = dto;
    if (provinceCode !== undefined) await this.moveDefaultBranch(tenantId, userId, provinceCode);

    const data = normalizeProfileWrite(profile);
    // upsert: tenant tạo qua đường khác có thể chưa có hồ sơ.
    await this.prisma.tenantProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.getMyShop(tenantId);
  }

  /**
   * Đổi tỉnh của chi nhánh mặc định — hệ quả (đồng bộ `public_listings`, đồng bộ lại hai cột
   * sao chép trên hồ sơ, ghi audit) nằm trọn trong `BranchesService.update`.
   */
  private async moveDefaultBranch(
    tenantId: string,
    userId: string,
    provinceCode: string,
  ): Promise<void> {
    const branch = await this.prisma.tenantBranch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { id: true, provinceCode: true },
    });
    // Dữ liệu cũ chưa qua migration chi nhánh: không có gì để dời, và tuyệt đối không tự ghi hai
    // cột sao chép — làm vậy là tạo ra đúng cái lệch mà hàm này sinh ra để tránh.
    if (!branch || branch.provinceCode === provinceCode) return;
    await this.branches.update(tenantId, branch.id, userId, { provinceCode });
  }

  /**
   * Gửi (lại) duyệt. Chỉ cho phép khi tenant đang draft/needs_revision/rejected. Snapshot hồ sơ
   * vào approval_task để reviewer thấy đúng thứ đã gửi. Ghi approval_log + audit cùng transaction.
   *
   * Hai cổng, không phải một: trạng thái ĐÚNG **và** hồ sơ ĐỦ. Cổng thứ hai từng không tồn tại —
   * hàm này chỉ soi `status`, nên một hồ sơ trắng trơn vẫn vào được hàng đợi và reviewer nhận
   * `{}` làm bằng chứng để duyệt. Nút mờ ở web là gợi ý; chặn thật nằm ở đây.
   */
  async submitForReview(tenantId: string, userId: string): Promise<MyShopDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        profile: { select: PROFILE_SELECT },
        // Tỉnh HIỆU LỰC nằm ở chi nhánh mặc định; hai cột trên hồ sơ chỉ là bản sao
        // (`syncProfileFromDefaultBranch`), nên chấm theo bản sao là chấm nhầm nguồn.
        branches: {
          where: { isDefault: true, deletedAt: null },
          select: { provinceCode: true },
          take: 1,
        },
      },
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

    const missing = missingShopProfileRequirements({
      displayName: tenant.profile?.displayName,
      provinceCode: tenant.branches[0]?.provinceCode ?? tenant.profile?.provinceCode,
      ownerFullName: tenant.profile?.ownerFullName,
      ownerPhone: tenant.profile?.ownerPhone,
    });
    if (missing.length > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.PROFILE_INCOMPLETE,
        message: 'Hồ sơ gian hàng còn thiếu thông tin bắt buộc nên chưa gửi duyệt được.',
        // Danh sách MÃ, không phải câu tiếng Việt — web tự dựng nhãn theo ngôn ngữ đang dùng.
        details: { missing },
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

/**
 * Ô để trống = XOÁ giá trị, tức `NULL`, không phải chuỗi rỗng.
 *
 * `''` và `NULL` trông giống nhau trên màn hình nhưng khác nhau ở mọi nơi khác: `COALESCE`,
 * `IS NULL`, và các bộ đếm "hồ sơ đã điền gì" của khu duyệt. Chuẩn hoá đúng một lần tại biên ghi
 * để không có cột nào giữ hai cách nói "chưa có".
 */
function normalizeProfileWrite<T extends Record<string, string | undefined>>(
  dto: T,
): { [K in keyof T]: string | null | undefined } {
  const out = {} as { [K in keyof T]: string | null | undefined };
  for (const [key, value] of Object.entries(dto) as [keyof T, string | undefined][]) {
    out[key] = value === undefined ? undefined : value.trim() === '' ? null : value;
  }
  return out;
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
    ownerFullName: profile?.ownerFullName ?? null,
    ownerPhone: profile?.ownerPhone ?? null,
    ownerEmail: profile?.ownerEmail ?? null,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy gian hàng',
  });
}
