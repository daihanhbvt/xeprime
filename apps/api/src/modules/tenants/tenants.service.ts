import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { markBadgesDirty, newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  canSubmitShopVerification,
  MEMBERSHIP_STATUS,
  missingPackageShopRegistrationFields,
  missingShopProfileRequirements,
  REGISTRATION_TRACK,
  registrationTrackOf,
  resolveShopVerification,
  shopOnboardingStateForTrack,
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
  ShopOwnerAccountDto,
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
} satisfies Prisma.TenantProfileSelect;

/**
 * Tài khoản CHỦ gian hàng — nguồn DUY NHẤT của "chủ gian hàng là ai" (16/09/2026).
 *
 * Thay cho ba cột text `owner_*` trên `tenant_profiles` (đã drop): ở đây email và SĐT là thứ
 * đã đi qua luồng xác minh OTP, nên hai cờ `*Verified` nói được điều mà một ô chữ gõ tay không
 * bao giờ nói được.
 */
const OWNER_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
} satisfies Prisma.UserSelect;

type OwnerRow = Prisma.UserGetPayload<{ select: typeof OWNER_SELECT }>;

function toOwnerAccount(owner: OwnerRow): ShopOwnerAccountDto {
  return {
    userId: owner.id,
    displayName: owner.displayName,
    email: owner.email,
    phone: owner.phone,
    // Đi trên dây là BOOLEAN, không phải mốc thời gian: màn hình chỉ hỏi "đã xác minh chưa",
    // và một mốc `…VerifiedAt` lọt ra ngoài là mời client tự nghĩ ra cách hiển thị nó.
    emailVerified: owner.emailVerifiedAt !== null,
    phoneVerified: owner.phoneVerifiedAt !== null,
  };
}

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
   *
   * ## HAI TUYẾN, một endpoint (16/09/2026 — ADR 0040)
   *
   * `dto.registrationTrack` là thứ tách hai cửa vào, và nó được LƯU (`onboarding_state`) chứ
   * không chỉ dùng một lần rồi bỏ:
   *
   * | | `commission` (mặc định) | `package` |
   * | --- | --- | --- |
   * | Trường bắt buộc | tỉnh | tỉnh + **xã** + **địa chỉ chi tiết** + **SĐT** |
   * | Gói gán lúc tạo | gói hoa hồng mặc định | **KHÔNG gán gì** |
   * | `onboarding_state` | `commission` | `package_pending` |
   * | Đi đâu sau khi tạo | Owner Lite ở `/account` | bước 2 của onboarding (chọn gói → chuyển khoản) |
   *
   * Vì sao tuyến gói KHÔNG nhận một gói hoa hồng tạm: dòng thuê bao là thứ `/auth/me` đọc để
   * chọn KHU làm việc, nên gán nó nghĩa là người vừa bấm "Đăng ký gian hàng" trở thành chủ xe
   * tuyến hoa hồng về mặt sản phẩm — đúng lỗi đang sửa. Hệ quả đi kèm là đúng: pha của họ là
   * `unconfigured`, nên `billingModeForMoneyOrThrow` từ chối mọi đường ghi tiền cho tới khi gói
   * bật. Một gian hàng chưa trả tiền thì cũng chưa được nhận đơn.
   *
   * `subscription.purchase` KHÔNG cần một dòng thuê bao nào: quyền đến từ VAI
   * (`permissionsForTenantMember`), và `/subscription/*` cố ý không mang `@SubscriptionTrackOnly`
   * — đó là phễu nâng cấp. Nên tuyến gói mua được gói ngay mà không cần quyền tạm nào.
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

    const track = registrationTrackOf(dto.registrationTrack);
    const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;

    /*
     * Bộ trường của tuyến GÓI kiểm ở đây, không bằng `@ValidateIf` trong DTO.
     *
     * Quy tắc sống ở `@xeprime/types` và dùng CHUNG với cổng đăng xe
     * (`missingPackageShopListingRequirements` trừ logo) — một định nghĩa, hai điểm thi hành.
     * Diễn đạt lại nó bằng bốn decorator có điều kiện là bản sao thứ hai sẽ lệch ở lần đổi quy
     * tắc tiếp theo, và lúc đó người dùng trả tiền xong mới bị cổng đăng xe từ chối.
     *
     * Trả `details.missing` là danh sách MÃ (ADR 0012) — web dựng nhãn theo ngôn ngữ đang dùng.
     */
    if (isPackageTrack) {
      const missing = missingPackageShopRegistrationFields({
        displayName: dto.name,
        contactPhone: dto.phone,
        provinceCode: dto.provinceCode,
        addressLine: dto.addressLine ?? dto.address,
      });
      if (missing.length > 0) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Gian hàng trả phí cần đủ tên, số điện thoại và địa chỉ trước khi mở.',
          details: { missing },
        });
      }
    }

    /*
     * Kiểm danh mục + ghép chuỗi hiển thị + tra toạ độ TRƯỚC transaction: `AddressService` có
     * thể phải hỏi bản đồ, và giữ transaction mở trong lúc chờ Internet là cách để một sự cố
     * bên ngoài thành một hàng đợi khoá bên trong.
     *
     * `requireWard: false` ở CẢ HAI tuyến (ADR 0042). Không màn hình nào còn hỏi xã/phường cho
     * một địa chỉ có ghim, nên đòi nó ở đây là từ chối đúng payload mà giao diện gửi lên. Mã xã
     * vẫn được NHẬN nếu client gửi (app bản cũ, dữ liệu nhập tay) và vẫn bị `AddressService` đối
     * chiếu với tỉnh khi có giá trị — chỉ là không bắt buộc nữa.
     */
    const address = await this.address.resolve(
      {
        provinceCode: dto.provinceCode,
        wardCode: dto.wardCode,
        addressLine: dto.addressLine ?? dto.address,
        placeId: dto.placeId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationSource: dto.locationSource,
      },
      { requireWard: false },
    );

    const tenantType = dto.tenantType ?? TENANT_TYPE.INDIVIDUAL;
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
          // Cửa vào, lưu bền vững — xem docblock của hàm và `shop-onboarding.ts`.
          onboardingState: shopOnboardingStateForTrack(track),
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
           * KHÔNG còn ba cột chủ gian hàng ở đây (16/09/2026).
           *
           * `missingShopProfileRequirements` vẫn đòi họ tên + SĐT chủ mới cho gửi duyệt, nhưng
           * nó đọc chúng từ `tenants.owner_user_id → users` — tức từ chính tài khoản vừa gọi
           * endpoint này. Không có bước ghi nào ở đây thì cũng không có bản sao nào trôi khỏi
           * bản gốc, và một chủ xe đổi SĐT trong hồ sơ cá nhân không còn để lại một số cũ trên
           * phiếu duyệt.
           */
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
       *
       * ⚠️ CHỈ tuyến hoa hồng (ADR 0040). Gán một dòng hoa hồng cho người vừa bấm "Đăng ký gian
       * hàng" là biến họ thành chủ xe tuyến hoa hồng ở mọi nơi đọc `billingMode` — khu làm việc,
       * nhãn tài khoản, trần 3 xe của Owner Lite — và đó chính là lỗi ADR 0040 sửa. Họ nhận gói
       * THẬT ở `activateFromInvoiceWithinTx`, khi tiền đã về.
       */
      if (!isPackageTrack) await this.billing.assignDefaultPlanWithinTx(tx, id);

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
        onboardingState: true,
        phone: true,
        email: true,
        profile: { select: PROFILE_SELECT },
        owner: { select: OWNER_SELECT },
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
      /*
       * Trục THỨ TƯ (ADR 0040) — cửa vào của gian hàng này. Trang Cửa hàng đọc nó để biết cổng
       * logo có áp hay không; suy từ `billingMode` là sai ở cả hai đầu (gian hàng hết gói vẫn là
       * gian hàng; chủ xe hoa hồng vừa mua gói thì chưa từng đi qua cửa gian hàng).
       */
      onboardingState: tenant.onboardingState,
      profile: emptyProfileIfNull(tenant.profile),
      /*
       * Chủ gian hàng đọc từ TÀI KHOẢN, không từ hồ sơ (16/09/2026). Đây là lý do khối này là
       * một object riêng chứ không phải ba trường nữa nằm trong `profile`: `profile` là thứ
       * `tenant.update` sửa được, còn khối này thì không — nó chỉ đổi khi chính người chủ đổi
       * tài khoản của họ.
       */
      ownerAccount: toOwnerAccount(tenant.owner),
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
   * 1. **KHÔNG còn khoá khi đang chờ xác minh (24/09/2026).** Tới ngày này hồ sơ bị khoá suốt
   *    thời gian phiếu xác minh gian hàng còn `pending` (`SHOP_VERIFICATION_PENDING`). Nền tảng đã
   *    tạm ngừng xác minh gian hàng: web không còn nút gửi, và màn "Duyệt xe" chỉ nhận phiếu XE —
   *    nên một phiếu gian hàng còn chờ không bao giờ được ai xử lý, và cái khoá thành vĩnh viễn
   *    mà người dùng không có đường nào tự gỡ.
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
        owner: { select: OWNER_SELECT },
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

    /*
     * Họ tên + SĐT chủ đọc từ TÀI KHOẢN CHỦ (16/09/2026), không từ hồ sơ gian hàng.
     *
     * Cổng này tồn tại để reviewer luôn liên hệ được với một người thật. Ba cột text cũ không
     * làm được việc đó: không ai chứng minh số trên chúng có thật, và chúng trôi khỏi tài khoản
     * ngay lần đầu chủ shop đổi SĐT đăng nhập. Đọc thẳng `users` vừa là một nguồn, vừa là nguồn
     * ĐÃ QUA xác minh OTP.
     */
    const missing = missingShopProfileRequirements({
      displayName: tenant.profile?.displayName,
      provinceCode: tenant.branches[0]?.provinceCode ?? tenant.profile?.provinceCode,
      ownerFullName: tenant.owner.displayName,
      ownerPhone: tenant.owner.phone,
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
          /*
           * SNAPSHOT = hồ sơ + DANH TÍNH CHỦ tại thời điểm gửi (16/09/2026).
           *
           * Reviewer phải duyệt đúng bản người gửi đã gửi. Đọc `users` LIVE lúc mở phiếu nghĩa
           * là chủ shop đổi tên/SĐT trong lúc chờ thì hồ sơ đang duyệt âm thầm đổi theo — và
           * phiếu đã duyệt xong cũng không còn kể được nó đã duyệt cái gì.
           *
           * Ba khoá giữ NGUYÊN TÊN `ownerFullName`/`ownerPhone`/`ownerEmail`: phiếu cũ trong
           * DB mang đúng ba khoá đó. Snapshot là jsonb đông cứng, không migrate — đổi tên khoá
           * là làm mù mọi phiếu đã lưu. (Từ 24/09/2026 web không còn màn duyệt phiếu gian hàng —
           * xác minh gian hàng tạm ngừng, ADR 0049 điều 7.)
           */
          snapshot: {
            ...(tenant.profile ?? {}),
            ownerFullName: tenant.owner.displayName,
            ownerPhone: tenant.owner.phone,
            ownerEmail: tenant.owner.email,
          } as Prisma.InputJsonValue,
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
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy gian hàng',
  });
}
