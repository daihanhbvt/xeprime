import {
  createInsurancePartner,
  createPrismaClient,
  freezeInsuranceProducts,
  toInsuranceProductSnapshot,
  type InsuranceProductSnapshot,
  MicMockInsurancePartner,
  newId,
  NoopInsurancePartner,
  Prisma,
} from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  type BookingPriceSnapshot,
  INSURANCE_CONSENT_SOURCE,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_ISSUING_LEASE_MINUTES,
  INSURANCE_PRODUCT_KIND,
  insuranceRetryDelayMinutes,
  TENANT_STATUS,
  INSURANCE_PROVIDER,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InsuranceService } from '../src/modules/insurance/insurance.service';
import { InsuranceProductsService } from '../src/modules/insurance/insurance-products.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
import {
  INSURANCE_OFFER_CACHE_TTL_MS,
  InsuranceOfferService,
} from '../src/modules/insurance/insurance-offer.service';
import { ensureInsuranceProducts } from './helpers/insurance-products';
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
        isTest: false,
        raw: { ok: true },
      },
    );
  }
}

const partner = new FakePartner();
const insurance = new InsuranceService(asService, audit, partner);
const noopInsurance = new InsuranceService(asService, audit, new NoopInsurancePartner());
/** Adapter GIẢ LẬP MIC thật (dev/staging) — đúng bản worker chạy khi `INSURANCE_PARTNER=mic_mock`. */
const mockInsurance = new InsuranceService(asService, audit, new MicMockInsurancePartner());
const insuranceRead = new InsuranceReadService(asService);
const insuranceProducts = new InsuranceProductsService(
  asService,
  audit,
  new InsuranceOfferService(new MicMockInsurancePartner(), asService),
);

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
  await ensureInsuranceProducts(asService);
  ownerId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ BH',
      email: `ins-${RUN}@xeprime.test`,
    },
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

  maybe(
    'IV + IP (cả hai tuỳ chọn) có bằng chứng chọn → hai dòng `reserved`, CHƯA tới hạn',
    async () => {
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
       * Luồng tiền v2: `IV` và `IP` đều TUỲ CHỌN — khách tích thì mới có dòng phí, nên CẢ HAI hợp
       * đồng phải mang bằng chứng khách đã chọn (ADR 0028 điều 5).
       */
      for (const policy of [iv, ip]) {
        expect(policy.consentAt?.toISOString()).toBe(consentAt.toISOString());
        expect(policy.consentSource).toBe(INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM);
      }
    },
  );

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

describe('ADR 0064 — adapter giả lập MIC phát hành GCN THỬ NGHIỆM trọn luồng', () => {
  async function dueVehicleTrip(): Promise<{ bookingId: string; policyId: string }> {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      mockInsurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('50000', '0'),
        consent: { at: new Date(), source: INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM },
      }),
    );
    await prisma.$transaction((tx) => mockInsurance.markDueWithinTx(tx, bookingId));
    const row = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    return { bookingId, policyId: row.id };
  }

  maybe('đơn ra đời ⇒ hợp đồng mang SNAPSHOT sản phẩm (tên, mẫu URL, mã sản phẩm)', async () => {
    const { policyId } = await dueVehicleTrip();
    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.productSnapshotJson).toMatchObject({
      kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      provider: INSURANCE_PROVIDER.MIC,
    });
    expect(row.partnerProductCode).toBeTruthy();
    expect(row.isTest).toBe(false);
  });

  maybe('worker ⇒ `issued` với số `TEST-MIC-VCX-…`, cờ is_test, URL dựng từ mẫu', async () => {
    const { bookingId, policyId } = await dueVehicleTrip();
    expect(await mockInsurance.claimDue(10)).toContain(policyId);
    expect(await mockInsurance.issueOne(policyId)).toBe('issued');

    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
    expect(row.certificateNumber).toMatch(/^TEST-MIC-VCX-[0-9A-F]{8}$/);
    expect(row.isTest).toBe(true);
    expect(row.certificateUrl).toContain(encodeURIComponent(row.certificateNumber!));
    expect(row.responsePayloadJson).toMatchObject({ mock: true, isTest: true });

    // Khách và gian hàng đọc được đúng GCN đó — kèm cờ thử nghiệm.
    const certs = await insuranceRead.certificatesForBooking(bookingId, { tenantId });
    expect(certs).toHaveLength(1);
    expect(certs[0]).toMatchObject({
      certificateNumber: row.certificateNumber,
      isTest: true,
      productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    });
    // Gian hàng KHÁC hỏi cùng đơn ⇒ rỗng, không phải GCN của người khác.
    expect(await insuranceRead.certificatesForBooking(bookingId, { tenantId: newId() })).toEqual(
      [],
    );
  });

  maybe('cùng khoá idempotency ⇒ cùng số GCN (đối tác thật cũng phải như vậy)', async () => {
    const mic = new MicMockInsurancePartner();
    const request = {
      idempotencyKey: 'BOOKING:vehicle_trip',
      productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      premiumAmount: '50000',
      coverageFrom: new Date('2026-10-01T00:00:00Z'),
      coverageTo: new Date('2026-10-03T00:00:00Z'),
      vehicle: { name: 'Xe', plateNumber: null, vehicleType: VEHICLE_TYPE.CAR },
      customer: { name: 'Khách', phone: null },
      consent: null,
      product: null,
    };
    const [a, b] = await Promise.all([mic.issue(request), mic.issue(request)]);
    expect(a.ok && b.ok && a.certificateNumber === b.certificateNumber).toBe(true);
  });

  maybe('DB TỪ CHỐI GCN thử nghiệm không mang cờ, và số thật mang cờ thử nghiệm', async () => {
    const { policyId } = await dueVehicleTrip();
    await expect(
      prisma.bookingInsurancePolicy.update({
        where: { id: policyId },
        data: { certificateNumber: 'TEST-MIC-VCX-AAAA0000', isTest: false },
      }),
    ).rejects.toThrow(/booking_insurance_policies_test_certificate_check/);
    await expect(
      prisma.bookingInsurancePolicy.update({
        where: { id: policyId },
        data: { certificateNumber: 'MIC-VCX-AAAA0000', isTest: true },
      }),
    ).rejects.toThrow(/booking_insurance_policies_test_certificate_check/);
  });

  maybe('adapter giả lập KHÔNG chọn được ở production — kể cả khi thiếu APP_ENV', () => {
    expect(() => createInsurancePartner('mic_mock', { appEnv: 'production' })).toThrow(
      /production/,
    );
    expect(() => createInsurancePartner('mic_mock')).toThrow(/production/);
    expect(() => createInsurancePartner('mic_real')).toThrow(/không hợp lệ/);
    expect(createInsurancePartner('mic_mock', { appEnv: 'staging' }).configured).toBe(true);
    expect(createInsurancePartner(undefined).configured).toBe(false);
    return Promise.resolve();
  });
});

describe('ADR 0064 — admin thử lại giờ CÓ tác dụng', () => {
  async function reservedWith(service: InsuranceService): Promise<string> {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      service.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('50000', '0'),
        consent: null,
      }),
    );
    return bookingId;
  }

  maybe('chưa cắm đối tác ⇒ thử lại bị từ chối với mã riêng, không xếp việc vô ích', async () => {
    const bookingId = await reservedWith(noopInsurance);
    await prisma.$transaction((tx) => noopInsurance.markDueWithinTx(tx, bookingId));
    const policy = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    await noopInsurance.claimDue(10);
    await noopInsurance.issueOne(policy.id);

    await expect(noopInsurance.retry(policy.id, ownerId)).rejects.toMatchObject({
      response: { code: 'INSURANCE_PARTNER_NOT_CONFIGURED' },
    });
    const after = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(after.nextAttemptAt).toBeNull();
  });

  maybe('lỗi vĩnh viễn → admin thử lại → worker cấp GCN ở vòng kế', async () => {
    const bookingId = await reservedWith(mockInsurance);
    const policy = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    // Lượt đầu hỏng vĩnh viễn (ví dụ: đối tác từ chối) — worker thôi tự thử.
    await prisma.bookingInsurancePolicy.update({
      where: { id: policy.id },
      data: {
        status: INSURANCE_POLICY_STATUS.FAILED,
        issueAttempts: 1,
        lastErrorCode: INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
        nextAttemptAt: null,
      },
    });
    expect(await mockInsurance.claimDue(10)).not.toContain(policy.id);

    await mockInsurance.retry(policy.id, ownerId);
    const queued = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(queued.nextAttemptAt).not.toBeNull();
    expect(queued.lastErrorCode).toBeNull();

    expect(await mockInsurance.claimDue(10)).toContain(policy.id);
    expect(await mockInsurance.issueOne(policy.id)).toBe('issued');
    const issued = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(issued.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
    expect(issued.issueAttempts).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { action: 'insurance_policy.retry', targetId: policy.id },
      }),
    ).toBe(1);
  });

  maybe('kết quả MUỘN không hồi sinh hợp đồng admin vừa thu hồi', async () => {
    const bookingId = await reservedWith(mockInsurance);
    const policy = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    await prisma.bookingInsurancePolicy.update({
      where: { id: policy.id },
      data: { status: INSURANCE_POLICY_STATUS.VOIDED, voidedAt: new Date() },
    });
    const applied = await mockInsurance.applyIssueResult(policy.id, {
      ok: true,
      certificateNumber: 'TEST-MIC-VCX-LATE0000',
      isTest: true,
      coverageFrom: new Date(),
      coverageTo: new Date(Date.now() + 86400_000),
      raw: null,
    });
    expect(applied).toBe(false);
    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policy.id } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.VOIDED);
  });
});

describe('ADR 0064 — hàng đợi admin: lọc trạng thái, theo đơn, tìm số GCN', () => {
  maybe('`status=any` thấy cả hợp đồng đã cấp; mặc định chỉ hợp đồng lỗi', async () => {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      mockInsurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('50000', '20000'),
        consent: { at: new Date(), source: INSURANCE_CONSENT_SOURCE.WEB_BOOKING_FORM },
      }),
    );
    await prisma.$transaction((tx) => mockInsurance.markDueWithinTx(tx, bookingId));
    for (const id of await mockInsurance.claimDue(10)) await mockInsurance.issueOne(id);

    const all = await insuranceRead.listForPlatform({ status: 'any', bookingId });
    expect(all.meta.total).toBe(2);
    expect(all.data.every((p) => p.status === INSURANCE_POLICY_STATUS.ISSUED && p.isTest)).toBe(
      true,
    );

    const failedOnly = await insuranceRead.listForPlatform({ bookingId });
    expect(failedOnly.meta.total).toBe(0);

    const cert = all.data[0]!.certificateNumber!;
    const found = await insuranceRead.listForPlatform({ status: 'any', q: cert.toLowerCase() });
    expect(found.data.map((p) => p.certificateNumber)).toContain(cert);

    const detail = await insuranceRead.detailForPlatform(all.data[0]!.id);
    expect(detail.requestPayload).toMatchObject({ idempotencyKey: expect.any(String) });
    expect(detail.responsePayload).toMatchObject({ mock: true });
    expect(detail.productSnapshot).toMatchObject({ provider: INSURANCE_PROVIDER.MIC });
  });
});

/**
 * Hai dòng `insurance_products` là dữ liệu DÙNG CHUNG của cả database test, và jest chạy các spec
 * SONG SONG (`maxWorkers: 4`): tắt một sản phẩm ở đây — dù chỉ vài mili-giây — là làm báo giá của
 * `rental-pricing`/`promo-code-lifecycle` mất dòng `IV` đúng lúc đó. Mọi ca dưới đây KHÔNG đổi
 * `is_active` của dòng thật: cổng theo sản phẩm được kiểm bằng một NGUỒN sản phẩm giả cắm vào
 * service. Ca duy nhất ghi vào dòng thật chỉ đổi khấu trừ (không spec nào khác đọc) và trả lại.
 */
type ProductRow = Awaited<ReturnType<PrismaService['insuranceProduct']['findMany']>>[number];

/** Nguồn sản phẩm GIẢ — đủ phần `insuranceProduct.findMany` mà hai service đọc. */
function productSource(rows: () => ProductRow[]): PrismaService {
  return {
    insuranceProduct: {
      findMany: (args?: { where?: { isActive?: boolean } }) =>
        Promise.resolve(
          rows().filter(
            (r) => args?.where?.isActive === undefined || r.isActive === args.where.isActive,
          ),
        ),
    },
  } as unknown as PrismaService;
}

function realProducts(): Promise<ProductRow[]> {
  return prisma.insuranceProduct.findMany({
    where: { provider: INSURANCE_PROVIDER.MIC },
    orderBy: { displayOrder: 'asc' },
  });
}

describe('ADR 0064 — danh mục sản phẩm', () => {
  maybe('công khai trả đúng khấu trừ theo loại xe; sửa có audit và xoá bộ nhớ đệm', async () => {
    const iv = await prisma.insuranceProduct.findFirstOrThrow({
      where: { provider: INSURANCE_PROVIDER.MIC, kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP },
    });
    const original = {
      deductibleCar: iv.deductibleCar,
      deductibleMotorbike: iv.deductibleMotorbike,
    };
    const offer = new InsuranceOfferService(new MicMockInsurancePartner(), asService);
    const invalidate = jest.spyOn(offer, 'invalidate');
    const products = new InsuranceProductsService(asService, audit, offer);
    try {
      await products.update(
        iv.id,
        { deductibleCar: '2000000', deductibleMotorbike: '500000' },
        ownerId,
      );
      expect(invalidate).toHaveBeenCalledTimes(1);
      const moto = await products.listPublic(VEHICLE_TYPE.MOTORBIKE);
      expect(
        moto.find((p) => p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP)?.deductibleAmount,
      ).toBe('500000');
      const car = await products.listPublic(VEHICLE_TYPE.CAR);
      expect(
        car.find((p) => p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP)?.deductibleAmount,
      ).toBe('2000000');
      expect(
        await prisma.auditLog.count({
          where: { action: 'insurance_product.update', targetId: iv.id, actorUserId: ownerId },
        }),
      ).toBe(1);
    } finally {
      await prisma.insuranceProduct.update({ where: { id: iv.id }, data: original });
      await prisma.auditLog.deleteMany({
        where: { action: 'insurance_product.update', actorUserId: ownerId },
      });
    }
  });

  maybe('sản phẩm đang TẮT bị ẩn khỏi danh mục công khai', async () => {
    const rows = await realProducts();
    const source = productSource(() =>
      rows.map((r) =>
        r.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? { ...r, isActive: false } : r,
      ),
    );
    const offer = new InsuranceOfferService(new MicMockInsurancePartner(), source);
    const products = new InsuranceProductsService(source, audit, offer);
    const listed = await products.listPublic(VEHICLE_TYPE.CAR);
    expect(listed.map((p) => p.kind)).toEqual([INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]);
  });

  /**
   * Chưa cắm đối tác (`INSURANCE_PARTNER=none` — production hiện nay) thì báo giá không chào ô
   * tích nào; danh mục công khai cũng phải rỗng, không kể quyền lợi của thứ không ai mua được.
   */
  maybe('chưa cắm đối tác ⇒ danh mục công khai RỖNG dù sản phẩm đang bật', async () => {
    const offer = new InsuranceOfferService(new NoopInsurancePartner(), asService);
    const products = new InsuranceProductsService(asService, audit, offer);
    expect(await products.listPublic(VEHICLE_TYPE.CAR)).toEqual([]);
  });

  maybe('số tiền không phải bội số 1.000 bị từ chối trước khi chạm DB', async () => {
    const iv = await prisma.insuranceProduct.findFirstOrThrow({
      where: { provider: INSURANCE_PROVIDER.MIC, kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP },
    });
    await expect(
      insuranceProducts.update(iv.id, { deductibleCar: '2000500' }, ownerId),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });
});

describe('ADR 0064 — cổng bán bảo hiểm theo TỪNG sản phẩm (InsuranceOfferService)', () => {
  maybe('chưa cắm đối tác ⇒ không bán gì, kể cả khi danh mục đang bật', async () => {
    expect(
      await new InsuranceOfferService(new NoopInsurancePartner(), asService).offeredByKind(),
    ).toEqual({ vehicleProtection: false, tripInsurance: false });
  });

  maybe('tắt sản phẩm ⇒ thôi bán ĐÚNG sản phẩm đó (nguồn giả, không đụng dòng dùng chung)', async () => {
    const rows = await realProducts();
    let vehicleTripActive = true;
    const source = productSource(() =>
      rows.map((r) =>
        r.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? { ...r, isActive: vehicleTripActive } : r,
      ),
    );
    const offer = new InsuranceOfferService(new MicMockInsurancePartner(), source);
    expect(await offer.offeredByKind()).toEqual({ vehicleProtection: true, tripInsurance: true });

    vehicleTripActive = false;
    // Bộ nhớ đệm: chưa xoá thì vẫn là câu trả lời cũ — đúng là nó KHÔNG đọc DB mỗi lượt.
    expect(await offer.offeredByKind()).toMatchObject({ vehicleProtection: true });
    offer.invalidate();
    expect(await offer.offeredByKind()).toEqual({ vehicleProtection: false, tripInsurance: true });
  });

  maybe('đọc danh mục MỘT lần trong TTL, đọc lại khi hết hạn', async () => {
    const rows = await realProducts();
    let reads = 0;
    const source = {
      insuranceProduct: {
        findMany: () => {
          reads += 1;
          return Promise.resolve(rows);
        },
      },
    } as unknown as PrismaService;
    const offer = new InsuranceOfferService(new MicMockInsurancePartner(), source);
    const t0 = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      await offer.offeredByKind();
      await offer.offeredByKind();
      expect(reads).toBe(1);
      now.mockReturnValue(t0 + INSURANCE_OFFER_CACHE_TTL_MS + 1);
      await offer.offeredByKind();
      expect(reads).toBe(2);
    } finally {
      now.mockRestore();
    }
  });
});

describe('ADR 0064 — lượt `issuing` bỏ dở được nhặt lại (worker chết giữa chừng)', () => {
  async function claimedPolicy(): Promise<{ bookingId: string; policyId: string }> {
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      mockInsurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot: snapshotWith('50000', '0'),
        consent: null,
      }),
    );
    await prisma.$transaction((tx) => mockInsurance.markDueWithinTx(tx, bookingId));
    const row = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    expect(await mockInsurance.claimDue(10)).toContain(row.id);
    return { bookingId, policyId: row.id };
  }
  const leaseMs = INSURANCE_ISSUING_LEASE_MINUTES * 60_000;

  maybe('quá hạn thuê ⇒ worker chiếm lại và phát hành ĐÚNG số GCN cũ; còn hạn ⇒ không đụng', async () => {
    const { policyId } = await claimedPolicy();
    // Lượt vừa chiếm còn trong hạn thuê: chiếm lại là gọi đôi.
    expect(await mockInsurance.claimDue(10)).not.toContain(policyId);

    await prisma.bookingInsurancePolicy.update({
      where: { id: policyId },
      data: { lastAttemptAt: new Date(Date.now() - leaseMs - 60_000) },
    });
    const reclaimed = await mockInsurance.claimDue(10);
    expect(reclaimed).toContain(policyId);
    // Hai worker cùng thấy nó quá hạn: chỉ một bên chiếm được (mốc vừa được ghi mới).
    expect(await mockInsurance.claimDue(10)).not.toContain(policyId);

    expect(await mockInsurance.issueOne(policyId)).toBe('issued');
    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: policyId } });
    expect(row.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
    // Khoá idempotency không đổi ⇒ số GCN tất định, đúng như lượt bỏ dở lẽ ra đã nhận.
    expect(row.certificateNumber).toMatch(/^TEST-MIC-VCX-[0-9A-F]{8}$/);
  });

  maybe('admin thử lại nhận `issuing` quá hạn, từ chối `issuing` còn hạn', async () => {
    const { policyId } = await claimedPolicy();
    await expect(mockInsurance.retry(policyId, ownerId)).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });

    await prisma.bookingInsurancePolicy.update({
      where: { id: policyId },
      data: { lastAttemptAt: new Date(Date.now() - leaseMs - 60_000) },
    });
    await mockInsurance.retry(policyId, ownerId);
    const queued = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
    });
    expect(queued.status).toBe(INSURANCE_POLICY_STATUS.FAILED);
    expect(queued.nextAttemptAt).not.toBeNull();
    expect(await mockInsurance.claimDue(10)).toContain(policyId);
    expect(await mockInsurance.issueOne(policyId)).toBe('issued');
    await prisma.auditLog.deleteMany({ where: { action: 'insurance_policy.retry', targetId: policyId } });
  });
});

describe('ADR 0064 — sản phẩm ĐÓNG BĂNG lúc duyệt, không lúc tiền về', () => {
  /** Bản sản phẩm khách thấy LÚC DUYỆT — cố ý khác danh mục hiện hành ở tên và mẫu URL. */
  async function frozenAtApproval(): Promise<InsuranceProductSnapshot> {
    const live = await prisma.insuranceProduct.findFirstOrThrow({
      where: { provider: INSURANCE_PROVIDER.MIC, kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP },
    });
    return {
      ...toInsuranceProductSnapshot(live),
      nameVi: `Bản đóng băng lúc duyệt ${RUN}`,
      certificateUrlTemplate: `https://frozen-${RUN}.test/gcn/{certCode}`,
    };
  }

  maybe('freezeInsuranceProducts chỉ chụp loại CÓ phí, và không viết lại bản đã chụp', async () => {
    const snapshot = snapshotWith('50000', '0');
    const frozen = await freezeInsuranceProducts(prisma, snapshot);
    expect(Object.keys(frozen.insuranceProducts ?? {})).toEqual([
      INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    ]);
    expect(frozen.insuranceProducts?.vehicle_trip).toMatchObject({
      kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      provider: INSURANCE_PROVIDER.MIC,
    });
    expect(await freezeInsuranceProducts(prisma, frozen)).toBe(frozen);
    const none = snapshotWith('0', '0');
    expect(await freezeInsuranceProducts(prisma, none)).toBe(none);
  });

  /**
   * Admin sửa/TẮT sản phẩm giữa lúc duyệt và lúc khách trả: hợp đồng sinh lúc tiền về vẫn mang
   * bản khách đã thấy lúc duyệt, và worker phát hành bằng đúng bản đó — không đọc lại danh mục.
   * Không tắt dòng dùng chung (spec chạy song song): bản đóng băng KHÁC danh mục hiện hành là đủ
   * để chứng minh không ai đọc lại danh mục.
   */
  maybe('hợp đồng và lượt phát hành dùng bản đóng băng, không dùng danh mục hiện hành', async () => {
    const product = await frozenAtApproval();
    const snapshot: BookingPriceSnapshot = {
      ...snapshotWith('50000', '0'),
      insuranceProducts: { [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: product },
    };
    const bookingId = await makeBooking();
    await prisma.$transaction((tx) =>
      mockInsurance.reserveForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        holdId: null,
        snapshot,
        consent: null,
      }),
    );
    const row = await prisma.bookingInsurancePolicy.findFirstOrThrow({ where: { bookingId } });
    expect(row.productSnapshotJson).toMatchObject({ nameVi: product.nameVi });

    await prisma.$transaction((tx) => mockInsurance.markDueWithinTx(tx, bookingId));
    expect(await mockInsurance.claimDue(10)).toContain(row.id);
    expect(await mockInsurance.issueOne(row.id)).toBe('issued');
    const issued = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id: row.id } });
    expect(issued.certificateUrl?.startsWith(`https://frozen-${RUN}.test/gcn/`)).toBe(true);
    expect(issued.requestPayloadJson).toMatchObject({ product: { nameVi: product.nameVi } });
  });
});
