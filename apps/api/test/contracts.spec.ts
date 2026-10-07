import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  CONTRACT_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { ContractsService } from '../src/modules/contracts/contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';

/**
 * S3 — Hợp đồng snapshot từ booking, chạy trên PostgreSQL THẬT. Kiểm chứng: snapshot đúng
 * (khách/xe/giá/còn phải trả), **idempotent** theo booking (tạo 2 lần → 1 dòng, cùng số HĐ),
 * và tenant scope (xe/HĐ shop khác → NOT_FOUND).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const contracts = new ContractsService(
  asService,
  new AuditService(asService),
  new BankAccountsService(asService),
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let bookingId: string;

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
  vehicleId = newId();
  bookingId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
      // SĐT đăng nhập ĐÃ XÁC THỰC — bên cho thuê ở mặt tiền cá nhân (ADR 0054). Email CHƯA xác thực.
      phone: `849${Date.now().toString().slice(-8)}`,
      phoneVerifiedAt: new Date(),
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop HĐ',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
      phone: '0900000000',
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE-${vehicleId.slice(-6)}`,
      name: 'Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '51A-12345',
    },
  });
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DH${bookingId.slice(-6).toUpperCase()}`,
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901234567',
      pickupAt: new Date('2026-08-01T02:00:00.000Z'),
      returnAt: new Date('2026-08-03T02:00:00.000Z'),
      baseAmount: '700000',
      totalAmount: '700000',
      depositAmount: '500000',
      paidAmount: '200000',
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
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

describe('Contracts (Phase 6 S3)', () => {
  maybe('tạo từ booking → snapshot đúng (khách/xe/giá/còn phải trả) + số HĐ HD-...', async () => {
    const c = await contracts.createFromBooking(tenantId, ownerId, bookingId);
    expect(c.contractNo).toMatch(/^HD-\d{8}-[0-9A-Z]{5}$/);
    expect(c.status).toBe(CONTRACT_STATUS.ACTIVE);
    expect(c.snapshot.customer.name).toBe('Nguyễn Văn A');
    expect(c.snapshot.vehicle.name).toBe('Vios');
    expect(c.snapshot.vehicle.plateNumber).toBe('51A-12345');
    /*
     * Tenant chưa có gói ⇒ mặt tiền CÁ NHÂN ⇒ bên cho thuê là chính tài khoản chủ (ADR 0054): họ
     * tên + SĐT đăng nhập đã xác thực, KHÔNG phải tên/số tự khai của "gian hàng". Email chưa xác
     * thực thì không in lên hợp đồng.
     */
    expect(c.snapshot.shop.name).toBe('Chủ shop');
    expect(c.snapshot.shop.phone).toHaveLength(10);
    expect(c.snapshot.shop.phone).not.toBe('0900000000');
    expect(c.snapshot.shop.email).toBeNull();
    expect(c.snapshot.rental.days).toBe(2);
    expect(c.snapshot.pricing.totalAmount).toBe('700000');
    expect(c.snapshot.pricing.paidAmount).toBe('200000');
    expect(c.snapshot.pricing.remainingAmount).toBe('500000');
  });

  maybe('tạo lại cùng booking → idempotent (1 dòng, cùng id + số HĐ)', async () => {
    const first = await contracts.getByBooking(tenantId, bookingId);
    const again = await contracts.createFromBooking(tenantId, ownerId, bookingId);
    expect(again.id).toBe(first.id);
    expect(again.contractNo).toBe(first.contractNo);
    const count = await prisma.contract.count({ where: { bookingId } });
    expect(count).toBe(1);
  });

  maybe('tuyến gói: bên cho thuê là bộ RIÊNG của gian hàng (tên + SĐT liên hệ)', async () => {
    await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.PACKAGE });
    const secondBookingId = newId();
    await prisma.booking.create({
      data: {
        id: secondBookingId,
        tenantId,
        vehicleId,
        code: `DH${secondBookingId.slice(-6).toUpperCase()}`,
        customerName: 'Trần Thị B',
        customerPhone: '0907654321',
        pickupAt: new Date('2026-09-01T02:00:00.000Z'),
        returnAt: new Date('2026-09-02T02:00:00.000Z'),
        baseAmount: '350000',
        totalAmount: '350000',
        depositAmount: '0',
        paidAmount: '0',
      },
    });

    const c = await contracts.createFromBooking(tenantId, ownerId, secondBookingId);
    expect(c.snapshot.shop.name).toBe('Shop HĐ');
    expect(c.snapshot.shop.phone).toBe('0900000000');
  });

  maybe('getById trả đúng; shop khác đọc → NOT_FOUND', async () => {
    const c = await contracts.getByBooking(tenantId, bookingId);
    const byId = await contracts.getById(tenantId, c.id);
    expect(byId.id).toBe(c.id);
    await expect(contracts.getById(newId(), c.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });

  maybe('tạo HĐ cho booking không thuộc shop → NOT_FOUND', async () => {
    await expect(contracts.createFromBooking(newId(), ownerId, bookingId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
