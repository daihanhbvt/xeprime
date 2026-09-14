import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  INSURANCE_CONSENT_SOURCE,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  insuranceRetryDelayMinutes,
  TENANT_STATUS,
  type BookingPriceSnapshot,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InsuranceService } from '../src/modules/insurance/insurance.service';
import { NoopInsurancePartner } from '../src/modules/insurance/partner/noop-insurance.partner';
import type {
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from '../src/modules/insurance/partner/insurance-partner.port';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * BẢO HIỂM CHUYẾN — Phase 7, ADR 0032 điều 4, trên PostgreSQL THẬT.
 *
 * Điều quan trọng nhất spec này khoá: **không có đường nào ghi `issued` mà không cầm số chứng
 * nhận.** Một dòng `issued` là lời khẳng định với khách rằng họ CÓ bảo hiểm; nếu nó sinh ra được
 * từ một adapter trả OK rỗng thì ngày đầu tiên có tai nạn, XePrime sẽ tra ra một hợp đồng không
 * tồn tại ở bất kỳ hãng nào — và đã thu tiền của khách cho nó.
 *
 * Các luật khác:
 *  - Cổng TẮT (phí 0) ⇒ KHÔNG sinh dòng nào. Hàng đợi admin không chứa việc rỗng.
 *  - `IP` phải mang bằng chứng khách CHỌN (ADR 0028 điều 5).
 *  - Huỷ trước bàn giao ⇒ `cancelled`; hợp đồng ĐÃ `issued` KHÔNG bị huỷ theo đường đó.
 *  - Backoff có TRẦN, và lỗi vĩnh viễn thì DỪNG hẳn thay vì quay vòng.
 *  - Adapter mặc định (noop) KHÔNG bao giờ trả thành công.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);

/** Đối tác GIẢ — chỉ tồn tại trong test. Production dùng `NoopInsurancePartner`. */
class FakePartner implements InsurancePartner {
  readonly partnerName = 'Đối tác giả (test)';
  readonly configured = true;
  next: IssuePolicyResult | null = null;
  lastRequest: IssuePolicyRequest | null = null;

  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    this.lastRequest = request;
    return Promise.resolve(
      this.next ?? {
        ok: true,
        certificateNumber: `CERT-${request.idempotencyKey.slice(-8)}`,
        raw: { ok: true },
      },
    );
  }
}

const partner = new FakePartner();
const insurance = new InsuranceService(asService, audit, partner);
const noopInsurance = new InsuranceService(asService, audit, new NoopInsurancePartner());

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let bookingSeq = 0;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Snapshot giá với hai dòng bảo hiểm — đúng hình dạng `computeCustomerFees` sinh ra. */
function snapshotWith(vehicleProtection: string, tripInsurance: string): BookingPriceSnapshot {
  return {
    rows: [],
    depositAmount: '0',
    totalAmount: '1400000',
    fees: {
      billingMode: 'commission',
      policy: { insurancePartnerName: 'Đối tác bảo hiểm (test)' },
      lines: [
        ...(Number(vehicleProtection) > 0
          ? [{ key: 'vehicle_protection', amount: vehicleProtection }]
          : []),
        ...(Number(tripInsurance) > 0 ? [{ key: 'trip_insurance', amount: tripInsurance }] : []),
      ],
    },
  } as unknown as BookingPriceSnapshot;
}

async function makeBooking(): Promise<string> {
  bookingSeq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId,
      code: `DHINS${bookingSeq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách bảo hiểm',
      customerPhone: `0911${String(100000 + bookingSeq).slice(-6)}`,
      status: 'reserved',
      pickupAt: new Date(Date.now() + 86400_000),
      returnAt: new Date(Date.now() + 3 * 86400_000),
      baseAmount: new Prisma.Decimal(1_400_000),
      totalAmount: new Prisma.Decimal(1_400_000),
    },
  });
  return id;
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
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ BH', email: `ins-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `InsShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe bảo hiểm',
      vehicleType: 'car',
      plateNumber: `51H-${RUN.slice(0, 5)}`,
      createdBy: ownerId,
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  partner.next = null;
  await prisma.bookingInsurancePolicy.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Giữ chỗ hợp đồng lúc tạo đơn', () => {
  maybe('cổng TẮT (phí 0) → KHÔNG sinh dòng nào', async () => {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('0', '0'),
        consent: null,
      }),
    );
    expect(await prisma.bookingInsurancePolicy.count({ where: { bookingId } })).toBe(0);
  });

  maybe('IV bắt buộc + IP có bằng chứng chọn → hai dòng `reserved`, CHƯA tới hạn', async () => {
    const bookingId = await makeBooking();
    const consentAt = new Date();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('28000', '14000'),
        consent: { at: consentAt, source: INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM },
      }),
    );

    const rows = await prisma.bookingInsurancePolicy.findMany({
      where: { bookingId },
      orderBy: { productKind: 'asc' },
    });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe(INSURANCE_POLICY_STATUS.RESERVED);
      // Chưa tới mốc bàn giao ⇒ worker KHÔNG được nhặt.
      expect(r.nextAttemptAt).toBeNull();
    }

    const iv = rows.find((r) => r.productKind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP)!;
    const ip = rows.find((r) => r.productKind === INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT)!;
    expect(iv.premiumAmount.toFixed(0)).toBe('28000');
    expect(ip.premiumAmount.toFixed(0)).toBe('14000');

    /*
     * `IV` BẮT BUỘC nên không có gì để đồng ý; `IP` TUỲ CHỌN nên phải có bằng chứng khách chọn
     * (ADR 0028 điều 5). Gắn consent cho cả hai sẽ làm bằng chứng của `IP` mất giá trị — không
     * phân biệt được "khách chọn" với "hệ thống điền sẵn".
     */
    expect(iv.consentAt).toBeNull();
    expect(ip.consentAt?.toISOString()).toBe(consentAt.toISOString());
    expect(ip.consentSource).toBe(INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM);
  });

  maybe('chạy lại (webhook retry) KHÔNG mua hai lần', async () => {
    const bookingId = await makeBooking();
    const run = () =>
      prisma.$transaction((tx) =>
        insurance.reserveForBookingWithinTx(tx, {
          bookingId,
          tenantId,
          holdId: null,
          snapshot: snapshotWith('28000', '0'),
          consent: null,
        }),
      );
    await run();
    await run();
    expect(await prisma.bookingInsurancePolicy.count({ where: { bookingId } })).toBe(1);
  });
});

describe('Phát hành — không có đường nào ghi `issued` tay không', () => {
  async function reserved(): Promise<{ bookingId: string; policyId: string }> {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('28000', '0'),
        consent: null,
      }),
    );
    const row = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    return { bookingId, policyId: row.id };
  }

  maybe('chuyến BẮT ĐẦU chỉ đặt mốc — không gọi ai trong transaction', async () => {
    const { bookingId, policyId } = await reserved();
    partner.lastRequest = null;

    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));

    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.RESERVED);
    // Đối tác KHÔNG được gọi ở bước này — HTTP trong transaction DB là lệnh cấm của CLAUDE.md.
    expect(partner.lastRequest).toBeNull();
  });

  maybe('worker gọi đối tác OK → `issued` kèm số chứng nhận và mốc bảo hiểm', async () => {
    const { bookingId, policyId } = await reserved();
    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));

    const claimed = await insurance.claimDue(10);
    expect(claimed).toContain(policyId);

    const outcome = await insurance.issueOne(policyId);
    expect(outcome).toBe('issued');

    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
    expect(row.certificateNumber).toBeTruthy();
    expect(row.issuedAt).not.toBeNull();
    expect(row.nextAttemptAt).toBeNull();
    // Khoá idempotency ĐI KÈM mỗi lần gọi — đối tác dùng nó để không bán hai lần.
    expect(partner.lastRequest?.idempotencyKey).toBe(`${bookingId}:vehicle_trip`);
  });

  /**
   * BẤT BIẾN QUAN TRỌNG NHẤT của bảng này.
   *
   * Một adapter (hoặc một lần sửa code vụng về) trả `ok: true` mà không có số chứng nhận sẽ tạo
   * ra một hợp đồng KHÔNG TỒN TẠI. DB phải từ chối, không phải code nhớ kiểm.
   */
  maybe('DB TỪ CHỐI `issued` không có số chứng nhận — CHECK, không phải quy ước', async () => {
    const { policyId } = await reserved();
    await expect(
      prisma.bookingInsurancePolicy.update({
        where: { id: policyId },
        data: { status: INSURANCE_POLICY_STATUS.ISSUED, issuedAt: new Date() },
      }),
    ).rejects.toThrow(/booking_insurance_policies_issued_needs_certificate_check/);
  });

  maybe('adapter MẶC ĐỊNH (noop) không bao giờ trả thành công', async () => {
    const { bookingId, policyId } = await reserved();
    await prisma.$transaction((tx) => noopInsurance.markDueWithinTx(tx, bookingId));
    await noopInsurance.claimDue(10);

    const outcome = await noopInsurance.issueOne(policyId);
    expect(outcome).toBe('failed');

    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.FAILED);
    expect(row.lastErrorCode).toBe(INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED);
    expect(row.certificateNumber).toBeNull();
    /*
     * Lỗi VĨNH VIỄN ⇒ thôi thử lại. Quay vòng mỗi phút trên một lỗi cấu hình chỉ đốt log và
     * giấu mất những lỗi thật sự tạm thời.
     */
    expect(row.nextAttemptAt).toBeNull();
  });

  maybe('lỗi TẠM THỜI → backoff tăng dần, có TRẦN', async () => {
    const { bookingId, policyId } = await reserved();
    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));

    partner.next = {
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
      message: 'timeout',
      retryable: true,
    };

    const at = new Date();
    await insurance.claimDue(10, at);
    await insurance.issueOne(policyId, at);

    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.FAILED);
    expect(row.issueAttempts).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    // Lần 1 ⇒ 2^1 = 2 phút.
    const delayMin = Math.round((row.nextAttemptAt!.getTime() - at.getTime()) / 60_000);
    expect(delayMin).toBe(insuranceRetryDelayMinutes(1));
  });

  maybe('backoff kẹp TRẦN 60 phút — đối tác sập nửa ngày không đẩy lần thử sang năm sau', () => {
    expect(insuranceRetryDelayMinutes(0)).toBe(1);
    expect(insuranceRetryDelayMinutes(1)).toBe(2);
    expect(insuranceRetryDelayMinutes(5)).toBe(32);
    expect(insuranceRetryDelayMinutes(6)).toBe(60);
    expect(insuranceRetryDelayMinutes(99)).toBe(60);
    return Promise.resolve();
  });

  maybe('hai worker song song: đúng MỘT bên chiếm được', async () => {
    const { bookingId, policyId } = await reserved();
    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));

    const [a, b] = await Promise.all([insurance.claimDue(10), insurance.claimDue(10)]);
    const winners = [...a, ...b].filter((id) => id === policyId);
    expect(winners).toHaveLength(1);
  });
});

describe('Huỷ trước bàn giao — hợp đồng chưa bao giờ được mua', () => {
  maybe('`reserved` → `cancelled`, thôi chờ worker', async () => {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('28000', '14000'),
        consent: { at: new Date(), source: INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM },
      }),
    );

    const count = await prisma.$transaction((tx) =>
      insurance.cancelForBookingWithinTx(tx, bookingId),
    );
    expect(count).toBe(2);

    const rows = await prisma.bookingInsurancePolicy.findMany({ where: { bookingId } });
    for (const r of rows) {
      expect(r.status).toBe(INSURANCE_POLICY_STATUS.CANCELLED);
      expect(r.cancelledAt).not.toBeNull();
      expect(r.nextAttemptAt).toBeNull();
    }
  });

  /**
   * Hợp đồng ĐÃ phát hành không được huỷ theo đường này: nó có hiệu lực ở phía hãng bảo hiểm, và
   * biến nó khỏi sổ bằng một `updateMany` nghĩa là hãng vẫn tính phí còn XePrime thì không biết.
   * Đường đúng là `void` — có lý do, có audit, và có người làm việc với đối tác.
   */
  maybe('`issued` KHÔNG bị huỷ theo đường huỷ-trước-bàn-giao', async () => {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('28000', '0'),
        consent: null,
      }),
    );
    const policy = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));
    await insurance.claimDue(10);
    await insurance.issueOne(policy.id);

    const count = await prisma.$transaction((tx) =>
      insurance.cancelForBookingWithinTx(tx, bookingId),
    );
    expect(count).toBe(0);

    const after = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(after.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
  });
});

describe('Admin: thử lại và thu hồi', () => {
  maybe('thu hồi ghi lý do + audit; hợp đồng `reserved` thì KHÔNG thu hồi được', async () => {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      insurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('28000', '0'),
        consent: null,
      }),
    );
    const policy = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });

    // `reserved` chưa có gì để thu hồi — chuyến còn đang chạy.
    await expect(insurance.voidPolicy(policy.id, ownerId, 'lý do đủ dài')).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });

    await prisma.$transaction((tx) => insurance.markDueWithinTx(tx, bookingId));
    await insurance.claimDue(10);
    await insurance.issueOne(policy.id);

    await insurance.voidPolicy(policy.id, ownerId, 'Đối tác báo sai biển số');
    const after = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(after.status).toBe(INSURANCE_POLICY_STATUS.VOIDED);
    expect(after.voidedAt).not.toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'insurance_policy.void', targetId: policy.id },
    });
    expect(log.afterJson).toMatchObject({ reason: 'Đối tác báo sai biển số' });
  });
});
