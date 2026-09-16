import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { markBadgesDirty, newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  canSubmitShopVerification,
  MEMBERSHIP_STATUS,
  missingShopProfileRequirements,
  resolveShopVerification,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
  TENANT_TYPE,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BranchesService } from '../branches/branches.service';
import { WalletService } from '../wallet/wallet.service';
import { AddressService } from '../locations/address.service';
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
  wardCode: true,
  wardName: true,
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
    private readonly address: AddressService,
    private readonly branches: BranchesService,
    private readonly billing: BillingService,
    /** Writer duy nhất của ví (ADR 0023 ràng buộc 3) — dùng để đổi chủ ví lúc mở gian hàng. */
    private readonly wallet: WalletService,
  ) {}

  /**
   * Đăng ký gian hàng cho user chưa thuộc tenant nào.
   *
   * MỘT transaction cho bốn thứ: tenant + membership chủ shop + hồ sơ + CHI NHÁNH MẶC ĐỊNH.
   * Nửa vời là hỏng theo nhiều kiểu khác nhau — có tenant mà không có membership thì chủ shop
   * không vào được; có tenant mà không có chi nhánh thì không tạo được xe nào.
   *
   * ## Vì sao tenant mở thẳng ở `active` (14/09/2026)
   *
   * Trước đây tenant sinh ra ở `draft`, và `VehiclesService.submitForPublicReview` đòi tenant
   * `active`. Ghép hai luật đó lại thì chủ xe CÁ NHÂN tuyến hoa hồng phải đi qua HAI cổng duyệt
   * cho chiếc xe đầu tiên: duyệt gian hàng rồi mới duyệt xe. Cổng thứ nhất không hỏi thêm được
   * gì mà cổng duyệt xe không hỏi (họ tên, SĐT, địa chỉ đều đã nằm trong chính phiếu duyệt xe),
   * và nó là chỗ rơi rụng lớn nhất của phễu chủ xe — xem [ADR 0036].
   *
   * `active` ở đây KHÔNG có nghĩa "gian hàng đã được xác minh". Nó chỉ có nghĩa "chưa bị khoá":
   * cột này là trục VẬN HÀNH (`TENANT_STATUS_PUBLISHABLE`, khoá/mở khoá của nền tảng), còn việc
   * nền tảng đã xem xét pháp nhân hay chưa nằm ở trục THỨ HAI `SHOP_VERIFICATION`
   * (`shop-verification.ts`), đọc từ phiếu duyệt và là điều kiện để MUA GÓI.
   *
   * Và nó KHÔNG tự công khai bất cứ thứ gì: xe vẫn sinh ra ở `draft`, vẫn phải qua
   * `approval_tasks` loại `VEHICLE` mới lên chợ (ADR 0008). Cái được bỏ là cổng thứ hai, không
   * phải cổng kiểm duyệt.
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

    /*
     * Kiểm danh mục + ghép chuỗi hiển thị + tra toạ độ TRƯỚC transaction: `AddressService` có
     * thể phải hỏi bản đồ, và giữ transaction mở trong lúc chờ Internet là cách để một sự cố
     * bên ngoài thành một hàng đợi khoá bên trong.
     *
     * `requireWard: false` — đăng ký gian hàng là bước đầu tiên và người đăng ký thường chưa có
     * địa chỉ chính xác. Thiếu xã/phường thì chi nhánh mặc định mang cờ chờ bổ sung, và cổng
     * `submitForReview` mới là chỗ đòi địa chỉ đủ.
     */
    const address = await this.address.resolve({
      provinceCode: dto.provinceCode,
      wardCode: dto.wardCode,
      addressLine: dto.addressLine ?? dto.address,
      placeId: dto.placeId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      locationSource: dto.locationSource,
    });

    const tenantType = dto.tenantType ?? TENANT_TYPE.INDIVIDUAL;
    /*
     * Tên gian hàng CÁ NHÂN chính là tên người cho thuê (tuyến hoa hồng của ADR 0028) — hỏi lại
     * cùng một cái tên ở một ô thứ hai là ma sát không đổi lấy gì. Gian hàng doanh nghiệp thì
     * KHÔNG suy diễn: tên công ty không phải tên người chịu trách nhiệm, và đoán sai ở đây nghĩa
     * là reviewer duyệt một cái tên không ai khai.
     */
    const ownerFullName =
      dto.ownerFullName ?? (tenantType === TENANT_TYPE.INDIVIDUAL ? dto.name : null);

    const id = newId();
    const tenantId = await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id,
          code: `SHOP-${id}`,
          slug: await this.uniqueSlug(tx, dto.name, id),
          name: dto.name,
          tenantType,
          status: TENANT_STATUS.ACTIVE,
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
      // Từ giây này người dùng có thêm một hộp thư công việc — huy hiệu phải biết (ADR 0034).
      await markBadgesDirty(tx, [userId]);
      await tx.tenantProfile.create({
        data: {
          tenantId: id,
          displayName: dto.name,
          // Bốn cột dưới là bản SAO tương thích ngược của chi nhánh mặc định; nguồn sự thật vận
          // hành là `tenant_branches`. Đồng bộ về sau đi qua `syncProfileFromDefaultBranch`.
          address: address.displayAddress,
          provinceCode: address.provinceCode,
          provinceName: address.provinceName,
          wardCode: address.wardCode,
          wardName: address.wardName,
          /*
           * Ba cột chủ gian hàng ghi NGAY tại đây, không để trống chờ một màn khác điền nốt.
           *
           * `missingShopProfileRequirements` đòi `ownerFullName` + `ownerPhone` mới cho gửi
           * duyệt. Trước đây `registerShop` không ghi hai cột đó, nên MỌI hồ sơ mở từ luồng đăng
           * xe công khai đều gửi duyệt thất bại với `PROFILE_INCOMPLETE`, và lối thoát duy nhất
           * là vào cổng quản lý điền tay — đúng con đường mà tuyến hoa hồng không được đi.
           */
          ownerFullName,
          ownerPhone: dto.phone ?? null,
          ownerEmail: dto.email ?? null,
        },
      });
      await this.branches.createDefaultBranch(tx, {
        tenantId: id,
        userId,
        address,
        phone: dto.phone ?? null,
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

      /*
       * VÍ THEO NGƯỜI CHỦ (15/09/2026) — trong CHÍNH transaction này, cùng lý do với dòng gói ở
       * trên: không được có khoảnh khắc nào tenant đã tồn tại mà ví còn đứng tên cá nhân.
       *
       * Người đăng ký thường đã là KHÁCH THUÊ trước đó, nên họ có thể đang có số dư từ tiền hoàn
       * khoản giữ chỗ, có tài khoản ngân hàng đã khai, thậm chí một lệnh rút đang chờ admin
       * chuyển. Tất cả đi theo — không chuyển tiền, chỉ đổi chủ của hàng ví (`wallets.id` không
       * đổi nên lệnh rút và mọi tham chiếu vẫn trỏ đúng).
       *
       * Ghi qua `WalletService` vì nó là writer DUY NHẤT của ba bảng ví (ADR 0023 ràng buộc 3).
       */
      await this.wallet.adoptUserWalletWithinTx(tx, userId, id);
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
          wardCode: true,
          address: true,
          needsLocationReview: true,
          province: { select: { name: true } },
          ward: { select: { name: true } },
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
      /*
       * Trục THỨ HAI, độc lập với `status` — xem `shop-verification.ts`. `status` trả lời "còn
       * được hoạt động không", trường này trả lời "nền tảng đã xem xét pháp nhân chưa", và chỉ
       * trường này mới là cổng của việc mua gói thuê bao.
       */
      verification: resolveShopVerification(latest?.status),
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
            wardCode: defaultBranch.wardCode,
            wardName: defaultBranch.ward?.name ?? null,
            address: defaultBranch.address,
            needsLocationReview: defaultBranch.needsLocationReview,
          } satisfies DefaultBranchDto)
        : null,
    };
  }

  /**
   * Cập nhật hồ sơ gian hàng.
   *
   * Hai thứ KHÔNG phải là "ghi thẳng vào `tenant_profiles`" và được tách riêng ở đây:
   *
   * 1. **Đang chờ XÁC MINH thì khoá.** Frontend đã nói "tạm khoá chỉnh sửa" từ lâu nhưng backend
   *    vẫn nhận — nghĩa là lời hứa đó chỉ là một thuộc tính `disabled`. Reviewer duyệt hồ sơ
   *    LIVE, nên sửa trong lúc chờ là duyệt một đằng công khai một nẻo. Điều kiện đọc từ PHIẾU
   *    (`SHOP_VERIFICATION.PENDING`), không từ `tenants.status` — cột đó không còn mang nghĩa
   *    "đang chờ duyệt" từ [ADR 0036].
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
      select: {
        status: true,
        approvalTasks: {
          where: { targetType: APPROVAL_TARGET_TYPE.TENANT },
          orderBy: { submittedAt: 'desc' },
          select: { status: true },
          take: 1,
        },
      },
    });
    if (!tenant) throw notFound();
    if (resolveShopVerification(tenant.approvalTasks[0]?.status) === SHOP_VERIFICATION.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.SHOP_VERIFICATION_PENDING,
        message: 'Hồ sơ đang chờ nền tảng xác minh nên không sửa được.',
      });
    }

    /*
     * MỌI mảnh địa chỉ đi qua chi nhánh mặc định, không chỉ mã tỉnh như trước. Bốn cột địa chỉ
     * trên `tenant_profiles` là BẢN SAO (`syncProfileFromDefaultBranch`) — ghi thẳng vào chúng
     * sẽ đúng cho tới lần chạm chi nhánh kế tiếp rồi âm thầm bị ghi đè, trong khi xe vẫn hiển
     * thị ở địa chỉ cũ trên marketplace vì `public_listings` không hề biết có thay đổi.
     */
    const { provinceCode, wardCode, addressLine, address, ...profile } = dto;
    if (
      provinceCode !== undefined ||
      wardCode !== undefined ||
      addressLine !== undefined ||
      address !== undefined
    ) {
      await this.moveDefaultBranch(tenantId, userId, {
        provinceCode,
        wardCode,
        addressLine: addressLine ?? address,
      });
    }

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
    patch: { provinceCode?: string; wardCode?: string; addressLine?: string },
  ): Promise<void> {
    const branch = await this.prisma.tenantBranch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { id: true, provinceCode: true, wardCode: true, addressLine: true },
    });
    // Dữ liệu cũ chưa qua migration chi nhánh: không có gì để dời, và tuyệt đối không tự ghi các
    // cột sao chép — làm vậy là tạo ra đúng cái lệch mà hàm này sinh ra để tránh.
    if (!branch) return;

    const unchanged =
      (patch.provinceCode === undefined || patch.provinceCode === branch.provinceCode) &&
      (patch.wardCode === undefined || patch.wardCode === branch.wardCode) &&
      (patch.addressLine === undefined || patch.addressLine === branch.addressLine);
    if (unchanged) return;

    await this.branches.update(tenantId, branch.id, userId, patch);
  }

  /**
   * Gửi (lại) hồ sơ XÁC MINH gian hàng.
   *
   * ## Đây KHÔNG còn là cổng để đăng xe
   *
   * Từ 14/09/2026 ([ADR 0036]) tuyến hoa hồng chỉ có MỘT cổng kiểm duyệt: phiếu duyệt XE. Hàm
   * này phục vụ tuyến THUÊ BAO — gian hàng muốn mua gói phải có pháp nhân đã được nền tảng xem
   * xét (`BillingService.purchase`). Gọi nó không bắt buộc, và không gọi cũng không cản trở việc
   * đưa xe lên chợ.
   *
   * ## Hai thay đổi so với bản cũ, và lý do
   *
   * 1. **Không hạ `tenants.status` nữa.** Bản cũ đặt tenant về `pending_review`, mà
   *    `TENANT_STATUS_PUBLISHABLE` chỉ nhận `active` — nghĩa là một gian hàng đang bán tốt mà
   *    xin xác minh để mua gói thì TOÀN BỘ xe của họ biến khỏi marketplace trong lúc chờ. Đó là
   *    hình phạt cho việc muốn trả tiền. Hai trục tách ra thì việc này không xảy ra được nữa.
   * 2. **Cổng chống trùng đọc từ PHIẾU, không từ `status`.** Nguồn sự thật của "đang chờ xác
   *    minh" là phiếu `pending`; hỏi `status` là hỏi một bản sao.
   *
   * Vẫn giữ nguyên: cổng hồ sơ ĐỦ (`missingShopProfileRequirements`) — reviewer không được nhận
   * một hồ sơ trắng làm bằng chứng để duyệt. Nút mờ ở web là gợi ý; chặn thật nằm ở đây.
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
        approvalTasks: {
          where: { targetType: APPROVAL_TARGET_TYPE.TENANT },
          orderBy: { submittedAt: 'desc' },
          select: { status: true },
          take: 1,
        },
      },
    });
    if (!tenant) throw notFound();

    /*
     * Gian hàng bị khoá không được xin xác minh: quyết định khoá là của nền tảng và phải gỡ
     * bằng chính đường mở khoá, không phải bằng cách gửi một phiếu mới vào hàng đợi.
     */
    if (tenant.status !== TENANT_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.SHOP_NOT_ACTIVE,
        message: 'Gian hàng đang không hoạt động nên chưa gửi xác minh được.',
        details: { status: tenant.status },
      });
    }

    const verification = resolveShopVerification(tenant.approvalTasks[0]?.status);
    if (!canSubmitShopVerification(verification)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SHOP_VERIFICATION_PENDING,
        message: 'Hồ sơ gian hàng đang chờ nền tảng xác minh.',
        details: { verification },
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

    const isResubmit = verification !== SHOP_VERIFICATION.UNVERIFIED;

    await this.prisma.$transaction(async (tx) => {
      /*
       * KHÔNG đụng `tenants.status` — xem docblock của hàm. Xin xác minh không được phép gỡ xe
       * của chính mình khỏi marketplace trong lúc chờ.
       */
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
          // Hai cột này theo dõi trục XÁC MINH, không phải `tenants.status` — cột đó không đổi.
          fromStatus: verification,
          toStatus: SHOP_VERIFICATION.PENDING,
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
          before: { verification },
          after: { verification: SHOP_VERIFICATION.PENDING },
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
    wardCode: profile?.wardCode ?? null,
    wardName: profile?.wardName ?? null,
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
