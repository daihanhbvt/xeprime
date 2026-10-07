import { createPrismaClient, newId } from '@xeprime/prisma';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  SHOP_PROFILE_REQUIREMENT,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UpdateTenantProfileDto } from '../src/modules/tenants/dto/tenant-onboarding.dto';
import { makeBranchesService, makeTenantsService } from './helpers/service-factory';

/**
 * Hồ sơ gian hàng (`PATCH /tenants/current/profile`) — chạy trên PostgreSQL THẬT.
 *
 * Ba bất biến được khoá ở đây, cả ba đều hỏng ÂM THẦM nếu ai đó "đơn giản hoá" service:
 *
 * 1. **Tỉnh/thành đi qua chi nhánh mặc định.** Hai cột tỉnh trên `tenant_profiles` là bản SAO;
 *    ghi thẳng vào chúng đúng cho tới lần chạm chi nhánh kế tiếp rồi bị ghi đè, và trong lúc đó
 *    xe vẫn nằm ở tỉnh cũ trên marketplace.
 * 2. **Đang chờ XÁC MINH là khoá ghi thật, không phải một thuộc tính `disabled` ở frontend.**
 * 3. **Ô để trống = NULL**, không phải chuỗi rỗng.
 * 4. **Chủ gian hàng đọc từ TÀI KHOẢN CHỦ**, không từ hồ sơ (16/09/2026): `ownerAccount` phản
 *    chiếu `users`, endpoint hồ sơ KHÔNG sửa được nó, và `submitForReview` chụp nó vào
 *    snapshot thay vì để reviewer đọc giá trị sống.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const branches = makeBranchesService(asService);
const tenants = makeTenantsService(asService);
/** Quyền của CHỦ gian hàng (có `seller_profile.manage`) — controller đọc nó từ membership. */
const OWNER_ACCESS = { canManageSellerProfile: true };

const HCM = '79';
const DANANG = '48';

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

/**
 * SĐT của tài khoản chủ. `users.phone` là UNIQUE, nên nó phải khác nhau giữa các lần chạy —
 * mốc thời gian là cách rẻ nhất để có điều đó mà vẫn đúng dạng lưu `84` + 9 chữ số.
 */
const OWNER_PHONE = `849${String(Date.now()).slice(-8)}`;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  tenantId = newId();

  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
      phone: OWNER_PHONE,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop hồ sơ',
      // ADR 0036: gian hàng mở ra là ĐANG HOẠT ĐỘNG ngay; vòng xác minh là trục riêng.
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({ data: { tenantId } });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await branches.create(tenantId, ownerId, { name: 'Chi nhánh gốc', provinceCode: HCM });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.approvalLog.deleteMany({ where: { task: { tenantId } } });
    await prisma.approvalTask.deleteMany({ where: { tenantId } });
    await prisma.sellerProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/**
 * CHỦ GIAN HÀNG = TÀI KHOẢN CHỦ (16/09/2026).
 *
 * Ba cột `owner_*` trên `tenant_profiles` đã bị drop. Bộ này khoá cả hai nửa của thay đổi đó:
 * khối `ownerAccount` nói đúng thứ `users` đang giữ, và endpoint hồ sơ KHÔNG còn là một đường
 * để ai đó có `tenant.update` viết lại danh tính người chủ.
 */
describe('Thông tin chủ gian hàng', () => {
  maybe('ownerAccount phản chiếu tài khoản chủ, kèm cờ đã-xác-minh', async () => {
    const shop = await tenants.getMyShop(tenantId);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { displayName: true, email: true, phone: true },
    });

    expect(shop.ownerAccount.userId).toBe(ownerId);
    expect(shop.ownerAccount.displayName).toBe(owner.displayName);
    expect(shop.ownerAccount.email).toBe(owner.email);
    expect(shop.ownerAccount.phone).toBe(owner.phone);
    // Mốc `email_verified_at` đặt ở `beforeAll`; SĐT thì chưa ai xác minh.
    expect(shop.ownerAccount.emailVerified).toBe(true);
    expect(shop.ownerAccount.phoneVerified).toBe(false);
  });

  /*
   * Lằn ranh của ADR 0038 điều 3 viết thành test: quyền `tenant.update` mở hồ sơ GIAN HÀNG,
   * không mở tài khoản của người CHỦ.
   *
   * Hai nửa của khẳng định đó: lưu hồ sơ KHÔNG đụng tới khối `ownerAccount`, và khối đó đổi
   * khi — và chỉ khi — chính hàng `users` đổi. Ba khoá `owner_*` cũ không còn cách nào đi vào
   * endpoint này: DTO không khai chúng, nên `forbidNonWhitelisted` trả 400 ngay ở biên.
   */
  maybe('lưu hồ sơ KHÔNG đụng tới danh tính chủ — nó đọc từ users', async () => {
    const before = await tenants.updateProfile(
      tenantId,
      ownerId,
      { displayName: 'Shop hồ sơ' },
      OWNER_ACCESS,
    );
    expect(before.ownerAccount.displayName).toBe('Chủ shop');

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop đổi tên' } });
    const after = await tenants.getMyShop(tenantId);
    expect(after.ownerAccount.displayName).toBe('Chủ shop đổi tên');

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop' } });
  });

  /* DTO không còn khai ba khoá đó — `forbidNonWhitelisted` biến chúng thành 400 ở biên. */
  maybe('UpdateTenantProfileDto không còn nhận ba khoá chủ gian hàng', () => {
    const dto = new UpdateTenantProfileDto() as Record<string, unknown>;
    for (const key of ['ownerFullName', 'ownerPhone', 'ownerEmail']) {
      expect(key in dto).toBe(false);
    }
    return Promise.resolve();
  });

  maybe('ô để trống lưu thành NULL, không phải chuỗi rỗng', async () => {
    await tenants.updateProfile(tenantId, ownerId, { businessLicenseNo: '' }, OWNER_ACCESS);

    const row = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { businessLicenseNo: true },
    });
    expect(row.businessLicenseNo).toBeNull();
  });

  maybe('hồ sơ gửi xác minh CHỤP danh tính chủ cho người duyệt', async () => {
    const shop = await tenants.submitForReview(tenantId, ownerId);
    expect(shop.verification).toBe(SHOP_VERIFICATION.PENDING);
    /*
     * ADR 0036: xin xác minh KHÔNG được gỡ gian hàng khỏi trạng thái hoạt động. Bản trước đặt
     * tenant về `pending_review`, mà `TENANT_STATUS_PUBLISHABLE` chỉ nhận `active` — nên xin xác
     * minh để mua gói sẽ làm toàn bộ xe của chính mình biến khỏi marketplace trong lúc chờ.
     */
    expect(shop.status).toBe(TENANT_STATUS.ACTIVE);

    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });
    const snapshot = task.snapshot as Record<string, unknown>;
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { displayName: true, email: true, phone: true },
    });
    /*
     * Ba khoá giữ NGUYÊN TÊN: phiếu cũ trong DB mang đúng chúng và màn duyệt vẽ theo khoá.
     * Snapshot là jsonb đông cứng, không migrate.
     */
    expect(snapshot.ownerFullName).toBe(owner.displayName);
    expect(snapshot.ownerPhone).toBe(owner.phone);
    expect(snapshot.ownerEmail).toBe(owner.email);
  });

  maybe('snapshot ĐÔNG CỨNG — chủ đổi tên sau khi gửi không sửa được phiếu đã gửi', async () => {
    const before = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });

    await prisma.user.update({
      where: { id: ownerId },
      data: { displayName: 'Tên mới sau khi gửi' },
    });

    const after = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });
    expect((after.snapshot as Record<string, unknown>).ownerFullName).toBe(
      (before.snapshot as Record<string, unknown>).ownerFullName,
    );

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop' } });
  });

  /*
   * 24/09/2026: phiếu xác minh CHỜ không còn khoá hồ sơ. Nền tảng tạm ngừng xác minh gian hàng
   * (màn "Duyệt xe" chỉ nhận phiếu xe), nên một phiếu còn chờ không ai xử lý — giữ khoá là khoá
   * hồ sơ vĩnh viễn mà người dùng không có đường tự gỡ.
   */
  maybe('đang chờ xác minh: hồ sơ VẪN sửa được (không còn khoá vĩnh viễn)', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });

    const shop = await tenants.updateProfile(
      tenantId,
      ownerId,
      {
        displayName: 'Sửa khi đang chờ',
      },
      OWNER_ACCESS,
    );
    expect(shop.profile.displayName).toBe('Sửa khi đang chờ');

    await tenants.updateProfile(
      tenantId,
      ownerId,
      {
        displayName: before.name,
      },
      OWNER_ACCESS,
    );
  });

  maybe('gửi phiếu xác minh thứ hai khi phiếu cũ còn chờ bị chặn', async () => {
    await expect(tenants.submitForReview(tenantId, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SHOP_VERIFICATION_PENDING },
    });
    expect(await prisma.approvalTask.count({ where: { tenantId, status: 'pending' } })).toBe(1);

    // Người duyệt trả về để các test sau chạy trên hồ sơ sửa được.
    await prisma.approvalTask.updateMany({
      where: { tenantId, status: 'pending' },
      data: { status: 'needs_revision', reviewedAt: new Date(), reason: 'Bổ sung giấy tờ.' },
    });
  });
});

/**
 * MẶT TIỀN GIAN HÀNG ≠ TÀI KHOẢN CHỦ (05/10/2026).
 *
 * Tên, SĐT, email mà khách thấy là của GIAN HÀNG (`tenants.name/phone/email`); SĐT/email đăng
 * nhập là của TÀI KHOẢN (`users`). Hai bên độc lập: đổi một bên không chạm bên kia. Và tên sửa ở
 * hồ sơ phải tới đúng cột khách đọc — trước đây nó vào bản sao `tenant_profiles.display_name`.
 */
describe('Mặt tiền gian hàng độc lập với tài khoản chủ', () => {
  maybe('đổi tên ở hồ sơ ghi tenants.name — slug giữ nguyên, tên chủ không đổi', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });

    const shop = await tenants.updateProfile(
      tenantId,
      ownerId,
      { displayName: 'Tên mới của shop' },
      OWNER_ACCESS,
    );
    expect(shop.name).toBe('Tên mới của shop');
    expect(shop.profile.displayName).toBe('Tên mới của shop');
    expect(shop.slug).toBe(before.slug);
    expect(shop.ownerAccount.displayName).toBe('Chủ shop');

    await tenants.updateProfile(tenantId, ownerId, { displayName: before.name }, OWNER_ACCESS);
  });

  maybe('SĐT/email liên hệ ghi vào tenants, không chạm SĐT/email đăng nhập', async () => {
    const shop = await tenants.updateProfile(
      tenantId,
      ownerId,
      {
        phone: '0912345678',
        email: 'lienhe@shop.test',
      },
      OWNER_ACCESS,
    );
    expect(shop.phone).toBe('0912345678');
    expect(shop.email).toBe('lienhe@shop.test');
    expect(shop.ownerAccount.phone).toBe(OWNER_PHONE);
    expect(shop.ownerAccount.email).toBe(`own-${ownerId}@xeprime.test`);

    // Ô trống = gỡ liên hệ của gian hàng.
    const cleared = await tenants.updateProfile(
      tenantId,
      ownerId,
      { phone: '', email: '' },
      OWNER_ACCESS,
    );
    expect(cleared.phone).toBeNull();
    expect(cleared.email).toBeNull();
  });

  maybe('đổi SĐT/email của tài khoản chủ không làm đổi liên hệ của gian hàng', async () => {
    await tenants.updateProfile(
      tenantId,
      ownerId,
      {
        phone: '0912345678',
        email: 'lienhe@shop.test',
      },
      OWNER_ACCESS,
    );
    const newOwnerPhone = `848${String(Date.now()).slice(-8)}`;
    await prisma.user.update({
      where: { id: ownerId },
      data: { phone: newOwnerPhone, email: `doi-${ownerId}@xeprime.test` },
    });

    const shop = await tenants.getMyShop(tenantId);
    expect(shop.ownerAccount.phone).toBe(newOwnerPhone);
    expect(shop.phone).toBe('0912345678');
    expect(shop.email).toBe('lienhe@shop.test');

    await prisma.user.update({
      where: { id: ownerId },
      data: { phone: OWNER_PHONE, email: `own-${ownerId}@xeprime.test` },
    });
    await tenants.updateProfile(tenantId, ownerId, { phone: '', email: '' }, OWNER_ACCESS);
  });

  maybe('DTO: tên không gỡ được; SĐT/email trống hợp lệ, sai định dạng bị chặn', async () => {
    const errorsOf = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(UpdateTenantProfileDto, body))).map((e) => e.property);

    expect(await errorsOf({ displayName: '' })).toContain('displayName');
    expect(await errorsOf({ displayName: ' a ' })).toContain('displayName');
    expect(await errorsOf({ phone: '', email: '' })).toEqual([]);
    expect(await errorsOf({ phone: '12345' })).toContain('phone');
    expect(await errorsOf({ email: 'khong-phai-email' })).toContain('email');
  });
});

/**
 * MÃ SỐ THUẾ: MỘT NGUỒN LÀ `seller_profiles.tax_id` (07/10/2026).
 *
 * Cột `tenant_profiles.tax_code` đã gỡ; `taxCode` còn trên DTO cho client cũ (app native). Bộ này
 * khoá bốn điều mà một lần "đơn giản hoá" sẽ phá trong im lặng:
 *  1. ghi `taxCode` là ghi HỒ SƠ NGƯỜI BÁN (tạo nháp nếu chưa có) và đọc lại đúng từ đó;
 *  2. ĐỔI nó cần `seller_profile.manage` — `tenant.update` không mở bản khai thuế; gửi lại nguyên
 *     giá trị cũ thì không cần (client cũ làm vậy mỗi lần lưu);
 *  3. hồ sơ người bán đang chờ/đã xác minh thì từ chối, và CẢ lần lưu lùi lại (một transaction);
 *  4. DTO cùng luật định dạng với `SaveSellerProfileDto.taxId`.
 */
describe('Mã số thuế — một nguồn là hồ sơ người bán', () => {
  const sellerOf = () =>
    prisma.sellerProfile.findUnique({
      where: { tenantId },
      select: { taxId: true, entityType: true, status: true },
    });

  maybe(
    'taxCode ghi vào hồ sơ người bán (tạo nháp nếu chưa có), đọc lại qua profile.taxCode',
    async () => {
      await prisma.sellerProfile.deleteMany({ where: { tenantId } });

      const shop = await tenants.updateProfile(
        tenantId,
        ownerId,
        { taxCode: '0316123456' },
        OWNER_ACCESS,
      );

      expect(shop.profile.taxCode).toBe('0316123456');
      const seller = await sellerOf();
      expect(seller?.taxId).toBe('0316123456');
      // Gian hàng của spec này mở ở tuyến hoa hồng (mặc định) ⇒ bản nháp là cá nhân.
      expect(seller?.entityType).toBe(SELLER_ENTITY_TYPE.INDIVIDUAL);
      expect(seller?.status).toBe(SELLER_PROFILE_STATUS.DRAFT);
    },
  );

  maybe(
    'không có seller_profile.manage: gửi lại nguyên MST thì qua, ĐỔI thì 403 và không ghi gì',
    async () => {
      const noSellerAccess = { canManageSellerProfile: false };

      const same = await tenants.updateProfile(
        tenantId,
        ownerId,
        { displayName: 'Shop hồ sơ', taxCode: '0316123456' },
        noSellerAccess,
      );
      expect(same.profile.taxCode).toBe('0316123456');

      await expect(
        tenants.updateProfile(
          tenantId,
          ownerId,
          { displayName: 'Không được lưu', taxCode: '0109999999' },
          noSellerAccess,
        ),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.MISSING_PERMISSION,
          details: { missing: [PERMISSION.SELLER_PROFILE_MANAGE] },
        },
      });
      expect((await sellerOf())?.taxId).toBe('0316123456');
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).name).toBe(
        'Shop hồ sơ',
      );
    },
  );

  maybe('hồ sơ người bán đang chờ xác minh: đổi MST bị từ chối và CẢ lần lưu lùi lại', async () => {
    await prisma.sellerProfile.update({
      where: { tenantId },
      data: { status: SELLER_PROFILE_STATUS.SUBMITTED },
    });
    try {
      await expect(
        tenants.updateProfile(
          tenantId,
          ownerId,
          { displayName: 'Không được lưu', taxCode: '0109999999' },
          OWNER_ACCESS,
        ),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.SELLER_PROFILE_NOT_EDITABLE } });
      expect((await sellerOf())?.taxId).toBe('0316123456');
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).name).toBe(
        'Shop hồ sơ',
      );

      // Nguyên giá trị cũ thì không đụng hồ sơ đang khoá — lần lưu hồ sơ gian hàng đi tiếp.
      const shop = await tenants.updateProfile(
        tenantId,
        ownerId,
        { taxCode: '0316123456', bio: 'Vẫn lưu được' },
        OWNER_ACCESS,
      );
      expect(shop.profile.bio).toBe('Vẫn lưu được');
    } finally {
      await prisma.sellerProfile.update({
        where: { tenantId },
        data: { status: SELLER_PROFILE_STATUS.DRAFT },
      });
    }
  });

  maybe('taxCode rỗng gỡ MST (NULL), khoảng trắng bị bỏ khi chuẩn hoá', async () => {
    await tenants.updateProfile(tenantId, ownerId, { taxCode: '' }, OWNER_ACCESS);
    expect((await sellerOf())?.taxId).toBeNull();

    const errorsOf = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(UpdateTenantProfileDto, body))).map((e) => e.property);
    expect(await errorsOf({ taxCode: '' })).toEqual([]);
    expect(await errorsOf({ taxCode: '0316 123 456' })).toEqual([]);
    expect(await errorsOf({ taxCode: 'MST-abc' })).toContain('taxCode');
    expect(await errorsOf({ taxCode: '123' })).toContain('taxCode');
  });
});

describe('Tỉnh/thành đi qua chi nhánh mặc định', () => {
  maybe('đổi tỉnh ở hồ sơ = dời chi nhánh mặc định, hai cột sao chép theo sau', async () => {
    const shop = await tenants.updateProfile(
      tenantId,
      ownerId,
      { provinceCode: DANANG },
      OWNER_ACCESS,
    );

    expect(shop.defaultBranch?.provinceCode).toBe(DANANG);
    expect(shop.profile.provinceCode).toBe(DANANG);
    expect(shop.profile.provinceName).toBe('Đà Nẵng');

    const branch = await prisma.tenantBranch.findFirstOrThrow({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { provinceCode: true },
    });
    expect(branch.provinceCode).toBe(DANANG);
  });

  maybe('mã tỉnh không hợp lệ bị từ chối, hồ sơ không đổi gì', async () => {
    await expect(
      tenants.updateProfile(
        tenantId,
        ownerId,
        {
          provinceCode: 'ZZ',
          displayName: 'Không được lưu',
        },
        OWNER_ACCESS,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const [tenant, row] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
      prisma.tenantProfile.findUniqueOrThrow({
        where: { tenantId },
        select: { provinceCode: true },
      }),
    ]);
    expect(tenant.name).not.toBe('Không được lưu');
    expect(row.provinceCode).toBe(DANANG);
  });
});

/**
 * Cổng thứ hai của `submitForReview`.
 *
 * Trước đây hàm chỉ soi TRẠNG THÁI tenant, nên một hồ sơ trắng trơn vẫn vào được hàng đợi duyệt
 * và reviewer nhận `{}` làm bằng chứng. Nút mờ ở web là gợi ý; chặn thật phải ở đây — và khi
 * chặn thì phải nói ĐÚNG mục nào thiếu, vì đó là thứ web dùng để nhảy tới ô còn trống.
 */
describe('Gửi duyệt đòi hồ sơ đủ thông tin bắt buộc', () => {
  maybe(
    'thiếu SĐT chủ gian hàng → từ chối kèm danh sách mục thiếu, không tạo hồ sơ duyệt',
    async () => {
      // Thiếu SĐT nghĩa là TÀI KHOẢN CHỦ chưa có số — cổng đọc `users`, không đọc hồ sơ.
      await prisma.user.update({ where: { id: ownerId }, data: { phone: null } });
      const tasksBefore = await prisma.approvalTask.count({ where: { tenantId } });

      await expect(tenants.submitForReview(tenantId, ownerId)).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PROFILE_INCOMPLETE,
          details: { missing: [SHOP_PROFILE_REQUIREMENT.OWNER_PHONE] },
        },
      });

      // Không nửa vời: gian hàng vẫn hoạt động và hàng đợi duyệt không có gì mới.
      const row = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { status: true },
      });
      expect(row.status).toBe(TENANT_STATUS.ACTIVE);
      expect(await prisma.approvalTask.count({ where: { tenantId } })).toBe(tasksBefore);
    },
  );

  maybe('điền lại đủ → gửi xác minh đi qua', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { phone: OWNER_PHONE } });
    const shop = await tenants.submitForReview(tenantId, ownerId);

    expect(shop.verification).toBe(SHOP_VERIFICATION.PENDING);
  });
});
