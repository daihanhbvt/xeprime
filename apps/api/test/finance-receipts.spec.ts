import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  FINANCE_CATEGORY_TYPE,
  MEMBERSHIP_STATUS,
  PAYMENT_METHOD,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
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
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.receipt.deleteMany({ where: { tenantId: id } });
      await prisma.financeCategory.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: ownerId } });
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
    expect(r.receiptNo).toMatch(/^PC-\d{8}-[0-9A-Z]{4}$/);
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
