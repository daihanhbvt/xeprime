import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_TERM_MONTHS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBillingService } from './helpers/service-factory';

/**
 * `BillingService.purchase` — bất biến MỘT hoá đơn trả được cho mỗi tenant (16/09/2026).
 *
 * Vì sao cần spec riêng: bất biến này nói về sự VẮNG MẶT của hàng ("không có hoá đơn payable
 * nào khác"), nên không unique index nào đại diện cho nó được — `code` là chuỗi ngẫu nhiên nên
 * DB luôn nhận thêm một dòng nữa. Hai lỗ hổng đã tồn tại và bộ này khoá cả hai:
 *
 *  1. `purchase()` chỉ void hoá đơn `issued`. Một hoá đơn `partially_paid` (khách đã chuyển
 *     thiếu) không bị void — đúng, vì void nó là xoá dấu vết tiền thật — nhưng bản cũ vẫn tạo
 *     thêm hoá đơn mới bên cạnh, và `applyBankPaymentWithinTx` coi CẢ HAI đều trả được.
 *  2. Hai lượt `purchase` song song ở Read Committed cùng đọc tập cũ, cùng void, rồi mỗi bên
 *     INSERT một dòng ⇒ hai mã XPG cùng sống.
 *
 * Chạy trên PostgreSQL THẬT: advisory lock là thứ không mock được, và đó chính là thứ đang thử.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing = makeBillingService(asService);

const RUN = newId().slice(-8).toLowerCase();
const TERM = SUBSCRIPTION_TERM_MONTHS[0]!;

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];
type PurchaseInput = Parameters<typeof billing.purchase>[2];

let dbAvailable = false;
let actorId: string;
let tenantId: string;
let planId: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  actorId = newId();
  tenantId = newId();
  await prisma.user.create({
    data: { id: actorId, displayName: 'Purchase Spec', email: `purchase-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `PurchaseShop-${RUN}`,
      status: 'active',
      ownerUserId: actorId,
    },
  });
  const input: CreatePlanInput = {
    code: `purchase-${RUN}`,
    name: 'Gói theo chỗ (spec)',
    billingMode: BILLING_MODE.PACKAGE,
    limits: {
      maxVehicles: null,
      // Bán CẢ BỐN kỳ hạn: spec này đua hai lượt mua song song, nên kỳ nào cũng phải hợp lệ.
      termPrices: SUBSCRIPTION_TERM_MONTHS.map((months) => ({
        months,
        price: String(months * 100_000),
      })),
    },
  };
  const plan = await billing.createPlan(actorId, input);
  planId = plan.id;
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Xoá sạch hoá đơn giữa các ca — mỗi ca tự dựng trạng thái đầu vào của nó. */
async function resetInvoices() {
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
}

function purchase() {
  const input: PurchaseInput = { planId, termMonths: TERM };
  return billing.purchase(tenantId, actorId, input);
}

/** Hoá đơn còn "trả được" — đúng tập mà `applyBankPaymentWithinTx` chấp nhận tiền. */
function payableInvoices() {
  return prisma.subscriptionInvoice.findMany({
    where: {
      tenantId,
      status: {
        in: [SUBSCRIPTION_INVOICE_STATUS.ISSUED, SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID],
      },
    },
    select: { id: true, code: true, status: true },
  });
}

describe('purchase — mỗi tenant chỉ giữ MỘT hoá đơn trả được', () => {
  maybe('mua lần hai khi hoá đơn cũ CHƯA có tiền: void cái cũ, giữ đúng một mã sống', async () => {
    await resetInvoices();
    const first = await purchase();
    const second = await purchase();

    expect(second.code).not.toBe(first.code);
    const payable = await payableInvoices();
    expect(payable).toHaveLength(1);
    expect(payable[0]!.code).toBe(second.code);

    const old = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: first.id },
      select: { status: true },
    });
    expect(old.status).toBe(SUBSCRIPTION_INVOICE_STATUS.VOID);
  });

  maybe('hoá đơn ĐÃ nhận một phần tiền: chặn mua mới, KHÔNG void tiền khách đã chuyển', async () => {
    await resetInvoices();
    const invoice = await purchase();
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
        paidAmount: '50000',
        // `applyBankPaymentWithinTx` xoá hạn khi đã có tiền vào — giữ fixture giống production.
        expiresAt: null,
      },
    });

    await expect(purchase()).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.SUBSCRIPTION_INVOICE_PARTIALLY_PAID,
        details: { code: invoice.code },
      },
    });

    // Hoá đơn dang dở còn nguyên: cả trạng thái lẫn số tiền đã nhận.
    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { status: true, paidAmount: true },
    });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    expect(after.paidAmount.toString()).toBe('50000');
    expect(await payableInvoices()).toHaveLength(1);
  });

  /*
   * Bằng chứng bất biến sống ở DATABASE, không chỉ ở service: ghi THẲNG qua Prisma, bỏ qua mọi
   * guard của `BillingService`. Đây là ca mà một writer thứ ba (job mới, script vá tay, một
   * service tương lai) sẽ gặp — và phải gặp.
   */
  maybe('DB tự từ chối hoá đơn payable thứ hai, kể cả khi ghi thẳng không qua service', async () => {
    await resetInvoices();
    const first = await purchase();

    await expect(
      prisma.subscriptionInvoice.create({
        data: {
          id: newId(),
          tenantId,
          code: `XPG${newId().slice(-8).toUpperCase()}`,
          periodFrom: new Date(),
          periodTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          linesJson: {},
          subtotal: '100000',
          discountAmount: '0',
          totalAmount: '100000',
          paidAmount: '0',
          status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await payableInvoices()).toHaveLength(1);

    // Hoá đơn đã `void` KHÔNG chiếm chỗ: mua lại sau khi void phải chạy được.
    await prisma.subscriptionInvoice.update({
      where: { id: first.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });
    const replacement = await purchase();
    expect(replacement.code).not.toBe(first.code);
    expect(await payableInvoices()).toHaveLength(1);
  });

  maybe('hai lượt mua ĐỒNG THỜI chỉ để lại một hoá đơn trả được', async () => {
    await resetInvoices();
    const results = await Promise.allSettled([purchase(), purchase(), purchase()]);

    // Không lượt nào được phép chết vì lỗi kỹ thuật: advisory lock xếp hàng chúng lại, lượt sau
    // void hoá đơn của lượt trước. Thứ phải đúng là TRẠNG THÁI CUỐI, không phải số lần thành công.
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
    }
    expect(await payableInvoices()).toHaveLength(1);
  });
});
