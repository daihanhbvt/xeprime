import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  BILLING_MODE,
  LISTING_STATUS,
  NOTIFICATION_TYPE,
  PLAN_STATUS,
  PUBLISH_REQUIREMENT,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  TENANT_TYPE,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBillingService,
  makeNotificationService,
  makeTenantsService,
  makeVehiclesService,
} from './helpers/service-factory';

/**
 * ADR 0036 — **cá nhân tuyến hoa hồng chỉ đi qua MỘT cổng: duyệt XE.**
 *
 * Spec này khoá đúng cái bế tắc đã có thật trên `develop`, và nó là loại lỗi không spec cũ nào
 * bắt được vì mỗi mảnh đều "đúng" một mình:
 *
 *  - `registerShop` tạo tenant ở `draft`;
 *  - `submitForPublicReview` đòi tenant `active`;
 *  - nên chiếc xe đầu tiên của một chủ xe cá nhân KHÔNG BAO GIỜ vào được hàng đợi, còn hàng đợi
 *    của admin thì chỉ có phiếu duyệt GIAN HÀNG.
 *
 * Bảy nhóm dưới đây chạy trọn vòng trên PostgreSQL THẬT: đăng ký → đăng xe → admin duyệt → xe
 * lên chợ, cộng các nhánh trả về, chống trùng, và hai cổng KHÔNG được phép biến mất (gian hàng
 * bị khoá, và xác minh trước khi mua gói thuê bao).
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test owner-single-gate
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService);
const tenants = makeTenantsService(asService);
const billing = makeBillingService(asService);
const approvals = new PlatformApprovalService(asService, audit, notifications, listings);

const HCM = '79';

let dbAvailable = false;
let ownerId: string;
let reviewerId: string;
let tenantId: string;
let branchId: string;
/** Gói tuyến THUÊ BAO dựng riêng cho spec — cổng xác minh chỉ áp với `billingMode = package`. */
let packagePlanId: string;

/** Hồ sơ xe ĐỦ điều kiện lên chợ theo luật 09/09/2026 + ADR 0036 (chi nhánh phải có tỉnh). */
async function seedVehicle(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51K-${id.slice(-3)}.45`,
      mainImageUrl: `https://img.example/${id.slice(-6)}-main.jpg`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: 7.5,
      weekdayPrice: '600000',
      ...overrides,
    },
  });
  // Luật 09/09/2026: tối thiểu 4 URL KHÁC NHAU, ảnh đại diện tính là một.
  await prisma.vehicleImage.createMany({
    data: [1, 2, 3].map((n) => ({
      id: newId(),
      tenantId,
      vehicleId: id,
      imageUrl: `https://img.example/${id.slice(-6)}-${n}.jpg`,
      sortOrder: n,
    })),
  });
  return id;
}

function pendingVehicleTasks(vehicleId: string) {
  return prisma.approvalTask.count({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
  });
}

async function pendingTaskId(vehicleId: string): Promise<string> {
  const task = await prisma.approvalTask.findFirstOrThrow({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
    select: { id: true },
  });
  return task.id;
}

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
  reviewerId = newId();
  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe cá nhân', email: `own-${ownerId}@xeprime.test` },
      { id: reviewerId, displayName: 'Reviewer', email: `rev-${reviewerId}@xeprime.test` },
    ],
  });

  packagePlanId = newId();
  await prisma.plan.create({
    data: {
      id: packagePlanId,
      code: `SPEC-PKG-${packagePlanId.slice(-6)}`,
      name: 'Gói gian hàng (spec)',
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: '500000',
      price: '500000',
      status: PLAN_STATUS.ACTIVE,
      durationDays: 90,
      // Gói được bán theo mọi kỳ hạn toàn cục; `slots` để `priceTerm` ra số > 0.
      limitsJson: { perVehiclePrice: { car: '100000', motorbike: '50000' }, includedCars: 0, includedMotorbikes: 0 },
      sortOrder: 900,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.approvalLog.deleteMany({ where: { task: { tenantId } } });
    await prisma.approvalTask.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { userId: { in: [ownerId, reviewerId] } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.plan.deleteMany({ where: { id: packagePlanId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, reviewerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('1. Mở hồ sơ chủ xe: không sinh phiếu duyệt gian hàng', () => {
  maybe('đăng ký → gian hàng ĐANG HOẠT ĐỘNG ngay, chưa xác minh, không có phiếu nào', async () => {
    const shop = await tenants.registerShop(ownerId, {
      name: 'Nguyễn Văn A',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: HCM,
      phone: '84901234567',
    });
    tenantId = shop.id;

    /*
     * Cả ba mệnh đề cùng phải đúng, và đây là tim của ADR 0036:
     *  - `active` để xe được duyệt là lên chợ NGAY (`TENANT_STATUS_PUBLISHABLE`);
     *  - `unverified` để "mở tenant nội bộ" KHÔNG bị hiểu thành "gian hàng đã xác minh";
     *  - không phiếu nào, để hàng đợi của admin chỉ chứa việc thật.
     */
    expect(shop.status).toBe(TENANT_STATUS.ACTIVE);
    expect(shop.verification).toBe(SHOP_VERIFICATION.UNVERIFIED);
    expect(await prisma.approvalTask.count({ where: { tenantId } })).toBe(0);

    const branch = await prisma.tenantBranch.findFirstOrThrow({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { id: true, provinceCode: true },
    });
    branchId = branch.id;
    expect(branch.provinceCode).toBe(HCM);
  });

  maybe('hồ sơ mang sẵn họ tên + SĐT — không phải điền lại ở một màn khác', async () => {
    const profile = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { ownerFullName: true, ownerPhone: true },
    });
    expect(profile.ownerFullName).toBe('Nguyễn Văn A');
    expect(profile.ownerPhone).toBe('84901234567');
  });

  maybe('gói mặc định là TUYẾN HOA HỒNG — nguồn phân biệt hai tuyến là billingMode', async () => {
    const sub = await prisma.tenantSubscription.findFirstOrThrow({
      where: { tenantId },
      select: { billingMode: true },
    });
    expect(sub.billingMode).toBe(BILLING_MODE.COMMISSION);
  });
});

describe('2. Gửi duyệt xe: một cổng, một phiếu', () => {
  let vehicleId: string;

  maybe('xe đủ điều kiện → chờ duyệt + ĐÚNG MỘT phiếu VEHICLE', async () => {
    vehicleId = await seedVehicle();
    const submitted = await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);

    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
    expect(await pendingVehicleTasks(vehicleId)).toBe(1);

    // Người gửi là CHỦ XE, không phải reviewer — cột "người gửi" của hàng đợi phải nói đúng.
    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: vehicleId },
      select: { submittedBy: true, snapshot: true },
    });
    expect(task.submittedBy).toBe(ownerId);
  });

  maybe('hàng đợi của admin CHỈ có phiếu XE — không có phiếu gian hàng nào', async () => {
    const queue = await approvals.list({ status: APPROVAL_STATUS.PENDING });
    const mine = queue.data.filter((t) => t.tenantId === tenantId);

    expect(mine).toHaveLength(1);
    expect(mine[0]!.targetType).toBe(APPROVAL_TARGET_TYPE.VEHICLE);
  });

  maybe('reviewer thấy đủ ẢNH và VỊ TRÍ để quyết định', async () => {
    const taskId = await pendingTaskId(vehicleId);
    const detail = await approvals.getTask(taskId);
    const snapshot = detail.snapshot as Record<string, unknown>;

    /*
     * Cổng gửi duyệt bắt buộc ≥4 ảnh và chi nhánh có tỉnh, nhưng snapshot cũ chỉ mang
     * `mainImageUrl` — reviewer phải duyệt một chiếc xe lên chợ khi chỉ nhìn được một tấm ảnh và
     * không biết nó nằm ở tỉnh nào. Không thể duyệt đúng thứ mình không thấy.
     */
    expect(Array.isArray(snapshot.images) && (snapshot.images as string[]).length).toBe(4);
    expect(snapshot.provinceName).toBe('Hồ Chí Minh');
    // Thông tin liên hệ của chủ xe đi kèm phiếu, không phải reviewer tự đi tra.
    expect(detail.tenant?.phone).toBe('84901234567');
  });

  maybe('bấm lại / tải lại trang: không phiếu thứ hai, không lỗi đỏ', async () => {
    const again = await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);

    // Kết quả người dùng MUỐN đã đạt từ lần bấm trước → trả trạng thái hiện tại, không ném.
    expect(again.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
    expect(await pendingVehicleTasks(vehicleId)).toBe(1);
  });

  maybe('hai request SONG SONG cũng chỉ ra một phiếu (constraint DB, không phải check app)', async () => {
    const racing = await seedVehicle();
    const results = await Promise.allSettled([
      vehicles.submitForPublicReview(tenantId, racing, ownerId),
      vehicles.submitForPublicReview(tenantId, racing, ownerId),
    ]);

    // Không request nào được phép hỏng: cả hai đều là "gửi duyệt chiếc xe này", và cả hai đều đạt.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await pendingVehicleTasks(racing)).toBe(1);
  });

  maybe('admin duyệt → xe công khai + có trên marketplace + báo chủ xe', async () => {
    const taskId = await pendingTaskId(vehicleId);
    const detail = await approvals.approve(taskId, reviewerId);
    expect(detail.status).toBe(APPROVAL_STATUS.APPROVED);

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);

    /*
     * Bài kiểm THẬT của "xe xuất hiện trên marketplace": bản chiếu `public_listings` phải bật và
     * mang đúng tỉnh. Chỉ nhìn `publicStatus` là bỏ lọt đúng cái lỗi mà ADR 0008 dựng listing để
     * chặn — xe được duyệt nhưng không ai tìm thấy.
     */
    const listing = await prisma.publicListing.findFirstOrThrow({
      where: { vehicleId },
      select: { status: true, provinceCode: true },
    });
    expect(listing.status).toBe(LISTING_STATUS.ACTIVE);
    expect(listing.provinceCode).toBe(HCM);

    const notif = await prisma.notification.findFirst({
      where: { userId: ownerId, type: NOTIFICATION_TYPE.VEHICLE_APPROVED },
    });
    expect(notif).not.toBeNull();
  });

  maybe('xe đã duyệt vẫn nằm trong "Xe của tôi"', async () => {
    const page = await vehicles.list(tenantId, {});
    expect(page.data.some((v) => v.id === vehicleId)).toBe(true);
  });
});

describe('3. Xe thiếu điều kiện: vẫn là nháp, nói rõ thiếu gì', () => {
  maybe('thiếu ảnh + giá → chặn kèm MÃ từng mục, xe không nhúc nhích', async () => {
    const bare = await seedVehicle({ weekdayPrice: null, mainImageUrl: null });

    await expect(vehicles.submitForPublicReview(tenantId, bare, ownerId)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
        details: {
          // MÃ, không phải câu tiếng Việt — web dựng nhãn theo ngôn ngữ đang dùng (ADR 0012).
          missing: expect.arrayContaining([
            PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE,
            PUBLISH_REQUIREMENT.MAIN_IMAGE,
          ]),
        },
      },
    });

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: bare },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);
    expect(await pendingVehicleTasks(bare)).toBe(0);
  });

  maybe('chi nhánh chưa có tỉnh cũng là MỘT MỤC trong danh sách, không phải lỗi rời', async () => {
    const orphan = await seedVehicle({ branchId: null });

    await expect(vehicles.submitForPublicReview(tenantId, orphan, ownerId)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
        details: { missing: expect.arrayContaining([PUBLISH_REQUIREMENT.BRANCH_LOCATION]) },
      },
    });
  });

  maybe('xe nháp VẪN nằm trong danh sách của chủ xe — không biến mất', async () => {
    const page = await vehicles.list(tenantId, { publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT });
    expect(page.data.length).toBeGreaterThan(0);
  });

  maybe('bổ sung rồi gửi lại → đi qua', async () => {
    const fixable = await seedVehicle({ weekdayPrice: null });
    await vehicles.update(tenantId, fixable, ownerId, { weekdayPrice: '650000' });

    const submitted = await vehicles.submitForPublicReview(tenantId, fixable, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });
});

describe('4. Từ chối / yêu cầu bổ sung: chủ xe thấy lý do và gửi lại được', () => {
  maybe('yêu cầu bổ sung → xe về tay chủ xe, CÓ thông báo riêng, lý do đi kèm', async () => {
    const vehicleId = await seedVehicle();
    await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);
    const taskId = await pendingTaskId(vehicleId);

    await approvals.requestRevision(taskId, reviewerId, 'Ảnh nội thất bị mờ.');

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION);

    /*
     * Nhánh này trước 14/09/2026 KHÔNG gửi thông báo nào. Đó là tin quan trọng nhất của cả vòng
     * đăng xe — xe rời hàng đợi và quay về tay chủ xe — nên không báo nghĩa là chiếc xe nằm im ở
     * `needs_revision` vô thời hạn.
     */
    const notif = await prisma.notification.findFirstOrThrow({
      where: { userId: ownerId, type: NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION },
      orderBy: { createdAt: 'desc' },
      select: { body: true },
    });
    expect(notif.body).toContain('Ảnh nội thất bị mờ.');

    // Lý do đi kèm ngay trong DANH SÁCH xe, không bắt chủ xe mở từng chiếc để đi tìm.
    const page = await vehicles.list(tenantId, {
      publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
    });
    const listed = page.data.find((v) => v.id === vehicleId);
    expect(listed?.latestPublicReview?.reason).toBe('Ảnh nội thất bị mờ.');

    // Và gửi lại được ngay, không phải chờ thêm vòng nào.
    const resubmitted = await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);
    expect(resubmitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
    expect(await pendingVehicleTasks(vehicleId)).toBe(1);
  });

  maybe('từ chối phải có lý do, và xe rời khỏi chợ', async () => {
    const vehicleId = await seedVehicle();
    await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);
    const taskId = await pendingTaskId(vehicleId);

    await expect(approvals.reject(taskId, reviewerId)).rejects.toThrow(/lý do/);
    await approvals.reject(taskId, reviewerId, 'Biển số không khớp giấy tờ.');

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.REJECTED);

    const listing = await prisma.publicListing.findFirst({
      where: { vehicleId },
      select: { status: true },
    });
    // Listing có thể chưa từng tồn tại (chưa bao giờ duyệt) — nếu có thì phải TẮT.
    expect(listing?.status ?? LISTING_STATUS.HIDDEN).not.toBe(LISTING_STATUS.ACTIVE);
  });
});

describe('5. Hai cổng KHÔNG được biến mất', () => {
  maybe('gian hàng bị khoá → không đăng được xe lên chợ', async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.SUSPENDED },
    });
    const blocked = await seedVehicle();

    await expect(vehicles.submitForPublicReview(tenantId, blocked, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SHOP_NOT_ACTIVE },
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.ACTIVE },
    });
  });

  maybe('mua gói THUÊ BAO khi chưa xác minh → bị chặn', async () => {
    /*
     * Đây là điều khoản mà ADR 0036 nợ ADR 0014 điều 5: bỏ cổng duyệt gian hàng khỏi tuyến hoa
     * hồng KHÔNG được phép làm tuyến thuê bao mất cổng của nó. Cổng chuyển về đúng chỗ nó có
     * nghĩa — muốn mua gói thì pháp nhân phải đã được xem xét.
     */
    await expect(
      billing.purchase(tenantId, ownerId, { planId: packagePlanId, termMonths: 3, slots: { car: 1, motorbike: 0 } }),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.SHOP_VERIFICATION_REQUIRED,
        details: { verification: SHOP_VERIFICATION.UNVERIFIED },
      },
    });
  });

  maybe('xác minh xong → mua gói đi qua, và xe trên chợ KHÔNG hề bị ảnh hưởng', async () => {
    const liveBefore = await prisma.publicListing.count({
      where: { tenantId, status: LISTING_STATUS.ACTIVE },
    });

    const submitted = await tenants.submitForReview(tenantId, ownerId);
    expect(submitted.verification).toBe(SHOP_VERIFICATION.PENDING);
    // Xin xác minh không được gỡ xe của chính mình khỏi chợ trong lúc chờ.
    expect(submitted.status).toBe(TENANT_STATUS.ACTIVE);
    expect(
      await prisma.publicListing.count({ where: { tenantId, status: LISTING_STATUS.ACTIVE } }),
    ).toBe(liveBefore);

    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId, targetType: APPROVAL_TARGET_TYPE.TENANT, status: APPROVAL_STATUS.PENDING },
      select: { id: true },
    });
    await approvals.approve(task.id, reviewerId);

    const shop = await tenants.getMyShop(tenantId);
    expect(shop.verification).toBe(SHOP_VERIFICATION.VERIFIED);

    const invoice = await billing.purchase(tenantId, ownerId, {
      planId: packagePlanId,
      termMonths: 3,
      slots: { car: 1, motorbike: 0 },
    });
    expect(invoice.code).toMatch(/^XPG/);
  });

  maybe('xác minh bị từ chối KHÔNG gỡ gian hàng khỏi trạng thái hoạt động', async () => {
    // Trục xác minh và trục vận hành tách hẳn nhau: một quyết định về pháp nhân không được phép
    // làm xe đang chạy biến mất khỏi chợ.
    await prisma.approvalTask.create({
      data: {
        id: newId(),
        tenantId,
        targetType: APPROVAL_TARGET_TYPE.TENANT,
        targetId: tenantId,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: ownerId,
      },
    });
    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId, targetType: APPROVAL_TARGET_TYPE.TENANT, status: APPROVAL_STATUS.PENDING },
      select: { id: true },
    });

    await approvals.reject(task.id, reviewerId, 'Giấy tờ pháp nhân không hợp lệ.');

    const row = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { status: true },
    });
    expect(row.status).toBe(TENANT_STATUS.ACTIVE);
    expect((await tenants.getMyShop(tenantId)).verification).toBe(SHOP_VERIFICATION.REJECTED);
  });
});
