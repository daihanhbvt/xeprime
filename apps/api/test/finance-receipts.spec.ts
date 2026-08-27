import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  FINANCE_CATEGORY_TYPE,
  MEMBERSHIP_STATUS,
  PAYMENT_METHOD,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { FinanceCategoriesService } from '../src/modules/finance/finance-categories.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Slice D — Thu/Chi (phiếu + danh mục + workflow duyệt), chạy trên PostgreSQL THẬT. Kiểm chứng:
 * tạo→duyệt→huỷ, chặn duyệt 2 lần, tiền ra string, tenant isolation, danh mục hệ thống bất khả xoá.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const receipts = new ReceiptsService(asService, new AuditService(asService));
const categories = new FinanceCategoriesService(asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
/**
 * Danh mục hệ thống do spec tự tạo (nếu database chưa được seed) — chỉ dọn lại cái NÀY.
 *
 * Trước đây spec dựa vào danh mục hệ thống mà `pnpm db:seed` để lại: nó xanh trên database dev
 * đã seed và đỏ trên một database test sạch. Test phải tự dựng đủ điều kiện của nó.
 */
let ownedSystemCategoryId: string | null = null;
/** Hai xe + một đơn của tenant chính, và một xe của tenant KHÁC — bộ tối thiểu để kiểm cặp đơn↔xe. */
let vehicleId: string;
let otherVehicleId: string;
let foreignVehicleId: string;
let bookingId: string;
let foreignBookingId: string;

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
  otherTenantId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  for (const id of [tenantId, otherTenantId]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop Finance',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  // Xe + đơn thuê: cặp `bookingId`/`vehicleId` của phiếu tay là thứ spec này kiểm, nên nó phải
  // có xe thật của CẢ HAI gian hàng — kiểm "xe của tenant khác bị từ chối" bằng một id bịa ra chỉ
  // chứng minh được rằng id bịa không tồn tại.
  const vehicles: [string, string, string][] = [];
  vehicleId = newId();
  otherVehicleId = newId();
  foreignVehicleId = newId();
  vehicles.push([vehicleId, tenantId, 'Vios'], [otherVehicleId, tenantId, 'Xpander']);
  vehicles.push([foreignVehicleId, otherTenantId, 'Fortuner nhà khác']);
  for (const [id, owner, name] of vehicles) {
    await prisma.vehicle.create({
      data: {
        id,
        tenantId: owner,
        code: `XE-${id.slice(-6)}`,
        name,
        plateNumber: `51A-${id.slice(-5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
      },
    });
  }

  bookingId = newId();
  foreignBookingId = newId();
  for (const [id, owner, vehicle] of [
    [bookingId, tenantId, vehicleId],
    [foreignBookingId, otherTenantId, foreignVehicleId],
  ] as const) {
    await prisma.booking.create({
      data: {
        id,
        tenantId: owner,
        vehicleId: vehicle,
        code: `BK-${id.slice(-6)}`,
        customerName: 'Khách A',
        status: BOOKING_STATUS.COMPLETED,
        pickupAt: new Date('2026-08-01T02:00:00Z'),
        returnAt: new Date('2026-08-03T02:00:00Z'),
        baseAmount: '2000000',
        totalAmount: '2000000',
        paidAmount: '500000',
      },
    });
  }

  // Danh mục hệ thống (tenantId = null) là dữ liệu NỀN, không thuộc tenant nào. Trên database
  // đã seed thì đã có; trên database test sạch thì chưa — tự tạo một cái để phần khẳng định
  // "hệ thống hiển thị + không xoá được" luôn có đối tượng để kiểm.
  const existingSystem = await prisma.financeCategory.findFirst({
    where: { tenantId: null, isSystem: true },
    select: { id: true },
  });
  if (!existingSystem) {
    const created = await prisma.financeCategory.create({
      data: {
        id: newId(),
        tenantId: null,
        type: FINANCE_CATEGORY_TYPE.EXPENSE,
        name: 'Chi phí vận hành (fixture)',
        isSystem: true,
      },
      select: { id: true },
    });
    ownedSystemCategoryId = created.id;
  }
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.receipt.deleteMany({ where: { tenantId: id } });
      await prisma.booking.deleteMany({ where: { tenantId: id } });
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.financeCategory.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: ownerId } });
    // Chỉ xoá danh mục hệ thống nếu CHÍNH spec này tạo ra nó — database đã seed thì để nguyên.
    if (ownedSystemCategoryId) {
      await prisma.financeCategory.deleteMany({ where: { id: ownedSystemCategoryId } });
    }
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function createExpense() {
  return receipts.create(tenantId, ownerId, {
    type: RECEIPT_TYPE.EXPENSE,
    amount: '500000',
    paymentMethod: PAYMENT_METHOD.CASH,
    description: 'Rửa xe',
  });
}

describe('Thu/Chi — receipts + categories (Slice D)', () => {
  maybe('tạo phiếu chi → pending_approval, receiptNo PC-, tiền string', async () => {
    const r = await createExpense();
    expect(r.status).toBe(RECEIPT_STATUS.PENDING_APPROVAL);
    // Hậu tố nới từ 4 lên 8 ký tự khi `receipt_no` có unique index: mọi lời gọi nằm trong một
    // transaction, mà Postgres huỷ cả transaction ở vi phạm đầu tiên nên không retry được —
    // cách duy nhất còn lại là làm cho va chạm không xảy ra.
    expect(r.receiptNo).toMatch(/^PC-\d{8}-[0-9A-Z]{8}$/);
    expect(r.amount).toBe('500000');
    expect(typeof r.amount).toBe('string');
  });

  maybe('duyệt phiếu → approved; duyệt lần 2 → 409 INVALID_STATUS_TRANSITION', async () => {
    const r = await createExpense();
    const approved = await receipts.approve(tenantId, ownerId, r.id);
    expect(approved.status).toBe(RECEIPT_STATUS.APPROVED);
    expect(approved.approvedAt).not.toBeNull();
    await expect(receipts.approve(tenantId, ownerId, r.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('huỷ phiếu đã duyệt → cancelled', async () => {
    const r = await createExpense();
    await receipts.approve(tenantId, ownerId, r.id);
    const cancelled = await receipts.cancel(tenantId, ownerId, r.id, 'Nhập nhầm');
    expect(cancelled.status).toBe(RECEIPT_STATUS.CANCELLED);
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  maybe('phiếu có đính kèm ảnh minh chứng', async () => {
    const r = await receipts.create(tenantId, ownerId, {
      type: RECEIPT_TYPE.INCOME,
      amount: '1000000.50',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
      referenceCode: 'FT123',
      attachments: ['https://img/bill1.jpg', 'https://img/bill2.jpg'],
    });
    expect(r.receiptNo).toMatch(/^PT-/);
    expect(r.amount).toBe('1000000.5');
    expect(r.attachments).toEqual(['https://img/bill1.jpg', 'https://img/bill2.jpg']);
  });

  maybe('tenant isolation: tenant khác không đọc được phiếu', async () => {
    const r = await createExpense();
    await expect(receipts.getOne(otherTenantId, r.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });

  // --- Gắn phiếu vào đơn / vào xe -----------------------------------------
  //
  // Cặp `booking_id`/`vehicle_id` không có ràng buộc nào ở DB (hai FK độc lập, và FK của chúng
  // là khoá đơn chứ không phải composite kèm `tenant_id`). Toàn bộ bảo đảm nằm ở service, nên
  // toàn bộ nó phải được kiểm ở đây.

  maybe('gắn THẲNG vào xe, không cần đơn — chi phí của xe không thuộc chuyến nào', async () => {
    const r = await receipts.create(tenantId, ownerId, {
      type: RECEIPT_TYPE.EXPENSE,
      amount: '250000',
      paymentMethod: PAYMENT_METHOD.CASH,
      vehicleId,
      description: 'Vá lốp',
    });
    expect(r.vehicleId).toBe(vehicleId);
    expect(r.bookingId).toBeNull();
    expect(r.vehicleName).toBe('Vios');
    // Không có đơn thì không có khách — client KHÔNG được tự gắn khách vào phiếu.
    expect(r.tenantCustomerId).toBeNull();
  });

  maybe('không gắn gì cả vẫn tạo được — chi phí marketing/văn phòng là có thật', async () => {
    const r = await createExpense();
    expect(r.bookingId).toBeNull();
    expect(r.vehicleId).toBeNull();
  });

  maybe('gắn đơn mà bỏ trống xe → server SUY xe từ đơn, không để null', async () => {
    const r = await receipts.create(tenantId, ownerId, {
      type: RECEIPT_TYPE.INCOME,
      amount: '500000',
      paymentMethod: PAYMENT_METHOD.CASH,
      bookingId,
    });
    expect(r.bookingId).toBe(bookingId);
    expect(r.vehicleId).toBe(vehicleId);
  });

  maybe('gắn đơn + đúng xe của đơn → nhận', async () => {
    const r = await receipts.create(tenantId, ownerId, {
      type: RECEIPT_TYPE.INCOME,
      amount: '500000',
      paymentMethod: PAYMENT_METHOD.CASH,
      bookingId,
      vehicleId,
    });
    expect(r.bookingId).toBe(bookingId);
    expect(r.vehicleId).toBe(vehicleId);
  });

  maybe('gắn đơn + xe KHÁC xe của đơn → 409 RECEIPT_BOOKING_VEHICLE_MISMATCH', async () => {
    await expect(
      receipts.create(tenantId, ownerId, {
        type: RECEIPT_TYPE.EXPENSE,
        amount: '100000',
        paymentMethod: PAYMENT_METHOD.CASH,
        bookingId,
        vehicleId: otherVehicleId,
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.RECEIPT_BOOKING_VEHICLE_MISMATCH },
    });
  });

  maybe('đơn của gian hàng KHÁC → 404, không lộ là đơn có tồn tại', async () => {
    await expect(
      receipts.create(tenantId, ownerId, {
        type: RECEIPT_TYPE.INCOME,
        amount: '100000',
        paymentMethod: PAYMENT_METHOD.CASH,
        bookingId: foreignBookingId,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('xe của gian hàng KHÁC → 404', async () => {
    await expect(
      receipts.create(tenantId, ownerId, {
        type: RECEIPT_TYPE.EXPENSE,
        amount: '100000',
        paymentMethod: PAYMENT_METHOD.CASH,
        vehicleId: foreignVehicleId,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('đơn + xe mỗi cái một gian hàng → chặn ở vế đơn trước, vẫn 404', async () => {
    await expect(
      receipts.create(tenantId, ownerId, {
        type: RECEIPT_TYPE.INCOME,
        amount: '100000',
        paymentMethod: PAYMENT_METHOD.CASH,
        bookingId: foreignBookingId,
        vehicleId,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  // --- Ô chọn xe của form -------------------------------------------------

  maybe('vehicle-options: chỉ xe của gian hàng này', async () => {
    const list = await receipts.vehicleOptions(tenantId, {});
    const ids = list.map((v) => v.id);
    expect(ids).toContain(vehicleId);
    expect(ids).toContain(otherVehicleId);
    expect(ids).not.toContain(foreignVehicleId);
    expect(list.find((v) => v.id === vehicleId)).toMatchObject({ name: 'Vios' });
  });

  maybe('vehicle-options: tìm theo tên, mã xe và biển số', async () => {
    const byName = await receipts.vehicleOptions(tenantId, { q: 'xpand' });
    expect(byName.map((v) => v.id)).toEqual([otherVehicleId]);

    const plate = `51A-${vehicleId.slice(-5)}`;
    expect((await receipts.vehicleOptions(tenantId, { q: plate })).map((v) => v.id)).toEqual([
      vehicleId,
    ]);

    const code = `XE-${vehicleId.slice(-6)}`;
    expect((await receipts.vehicleOptions(tenantId, { q: code })).map((v) => v.id)).toEqual([
      vehicleId,
    ]);
  });

  maybe('vehicle-options: includeId giữ xe đang chọn dù không khớp từ khoá', async () => {
    const list = await receipts.vehicleOptions(tenantId, { q: 'xpand', includeId: vehicleId });
    expect(list[0]?.id).toBe(vehicleId);
    // Không nhân đôi khi xe đang chọn vốn đã nằm trong kết quả tìm.
    const dedup = await receipts.vehicleOptions(tenantId, { q: 'xpand', includeId: otherVehicleId });
    expect(dedup.filter((v) => v.id === otherVehicleId)).toHaveLength(1);
  });

  maybe('vehicle-options: includeId trỏ xe gian hàng khác → không trả về', async () => {
    const list = await receipts.vehicleOptions(tenantId, { includeId: foreignVehicleId });
    expect(list.map((v) => v.id)).not.toContain(foreignVehicleId);
  });

  maybe('danh mục: hệ thống hiển thị + không xoá được; custom tạo/xoá được', async () => {
    const list = await categories.list(tenantId, {});
    const system = list.filter((c) => c.isSystem);
    expect(system.length).toBeGreaterThan(0);
    // Không xoá được danh mục hệ thống.
    await expect(categories.remove(tenantId, system[0]!.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
    // Danh mục custom của tenant tạo + xoá được.
    const custom = await categories.create(tenantId, {
      type: FINANCE_CATEGORY_TYPE.EXPENSE,
      name: 'Phí giữ xe',
    });
    expect(custom.isSystem).toBe(false);
    await expect(categories.remove(tenantId, custom.id)).resolves.toBeUndefined();
  });
});
