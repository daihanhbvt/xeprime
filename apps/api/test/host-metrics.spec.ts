import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  CANCELLATION_STAGE,
  HOST_METRIC_MIN_SAMPLES,
  HOST_RELIABILITY_PRIOR,
  hostReliabilityScore,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { HostMetricsService } from '../src/modules/host-metrics/host-metrics.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * BA CHỈ SỐ UY TÍN của một gian hàng — trên PostgreSQL THẬT (ADR 0045 điều 3).
 *
 * Spec này khoá LUẬT ĐẾM, không khoá giao diện. Nó tồn tại vì mọi cách làm sai đều trông đúng
 * cho tới khi có người bán thật nhìn vào con số của chính họ:
 *
 *  1. Suy "đã phản hồi" từ `status` thay vì từ `decided_at` — trao điểm phản hồi cho đúng nhóm
 *     KHÔNG phản hồi (dữ liệu LEGACY ADR 0039).
 *  2. Tính `slot_taken` vào mẫu số — phạt gian hàng vì một việc hệ thống làm.
 *  3. Cho một lượt huỷ sinh HAI mẫu — phạt đúp cho một sự cố.
 *  4. Hiện `0%`/`100%` từ một hai mẫu — một lần tung đồng xu đọc ra như một kết luận.
 *  5. Trộn quyết định của MÁY ("Đặt ngay") vào trung vị thời gian trả lời của NGƯỜI.
 *
 * Mỗi lỗi trên có một bài test dưới đây. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/host-metrics.spec.ts
 */
const prisma = createPrismaClient();
const metrics = new HostMetricsService(prisma as unknown as PrismaService);

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let customerId: string;
/** Gian hàng CHÍNH — mọi bài test một-tenant dùng nó. */
let tenantId: string;
let vehicleId: string;
/** Gian hàng thứ hai — chứng minh phép gộp không rò dữ liệu sang tenant khác. */
let otherTenantId: string;
let otherVehicleId: string;
let seq = 0;

interface RequestFixture {
  status: string;
  /** `null` = gian hàng CHƯA quyết. Đây là cột quyết định "đã phản hồi", không phải `status`. */
  decidedAt?: Date | null;
  decisionSource?: string | null;
  /** Bỏ trống = quá hạn (mốc trong quá khứ) ⇒ yêu cầu ĐÃ là một mẫu. */
  respondBy?: Date;
  createdAt?: Date;
  tenant?: string;
  vehicle?: string;
  /** Ghi thêm một dòng `booking_cancellations` cho yêu cầu này. */
  cancelledBy?: string;
}

async function seedTenant(label: string): Promise<{ tenant: string; vehicle: string }> {
  const tenant = newId();
  const vehicle = newId();
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `HostMetrics-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicle,
      tenantId: tenant,
      code: `XE${vehicle.slice(-5)}`,
      name: `Xe ${label}`,
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: '700000',
      createdBy: ownerId,
    },
  });
  return { tenant, vehicle };
}

/** Một yêu cầu thuê thô — spec này kiểm PHÉP ĐẾM, nên nó ghi thẳng thay vì đi qua service. */
async function seedRequest(fixture: RequestFixture): Promise<string> {
  seq += 1;
  const id = newId();
  const createdAt = fixture.createdAt ?? new Date(Date.now() - 3 * 24 * 3600_000);
  const tenant = fixture.tenant ?? tenantId;
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: fixture.vehicle ?? vehicleId,
      status: fixture.status,
      customerName: `Khách ${seq}`,
      customerPhone: `0955${String(100000 + seq).slice(-6)}`,
      customerUserId: customerId,
      pickupAt: new Date(createdAt.getTime() + 5 * 24 * 3600_000),
      returnAt: new Date(createdAt.getTime() + 7 * 24 * 3600_000),
      // Mặc định QUÁ HẠN: một yêu cầu còn trong hạn chưa phải mẫu, và hầu hết bài test cần mẫu.
      respondBy: fixture.respondBy ?? new Date(createdAt.getTime() + 3600_000),
      createdAt,
      decidedAt: fixture.decidedAt ?? null,
      decisionSource:
        fixture.decisionSource ??
        (fixture.decidedAt ? BOOKING_REQUEST_DECISION_SOURCE.HOST : null),
    },
  });
  if (fixture.cancelledBy) {
    await prisma.bookingCancellation.create({
      data: {
        id: newId(),
        tenantId: tenant,
        bookingRequestId: id,
        responsibleParty: fixture.cancelledBy,
        reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
        stage: CANCELLATION_STAGE.AWAITING_HOLD,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        countsAgainstHost: fixture.cancelledBy === CANCELLATION_PARTY.HOST,
      },
    });
  }
  return id;
}

/** Dọn sạch yêu cầu của cả hai tenant giữa hai bài test — mỗi bài dựng đúng tập mẫu của nó. */
async function resetRequests(): Promise<void> {
  const ids = [tenantId, otherTenantId];
  await prisma.bookingCancellation.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: ids } } });
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
  customerId = newId();
  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `hm-own-${RUN}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `hm-cus-${RUN}@xeprime.test` },
    ],
  });

  const main = await seedTenant('main');
  tenantId = main.tenant;
  vehicleId = main.vehicle;
  const other = await seedTenant('other');
  otherTenantId = other.tenant;
  otherVehicleId = other.vehicle;
});

afterAll(async () => {
  if (dbAvailable) {
    await resetRequests();
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await resetRequests();
    await fn();
  });

/** Bốn mẫu "sạch" để đẩy một tenant qua ngưỡng `HOST_METRIC_MIN_SAMPLES` mà không đổi tỉ lệ. */
async function seedKeptSamples(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
    });
  }
}

describe('Mẫu số — ai vào, ai không (ADR 0045 điều 3)', () => {
  maybe('bốn nhóm NGOÀI mẫu số không làm gian hàng xấu đi', async () => {
    // Năm mẫu THẬT, tất cả đều được nhận và giữ ⇒ 100%/100% nếu mẫu số đúng.
    await seedKeptSamples(HOST_METRIC_MIN_SAMPLES);

    // Bốn nhóm loại trừ, mỗi nhóm một lý do khác nhau.
    await seedRequest({ status: BOOKING_REQUEST_STATUS.SLOT_TAKEN });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.HOLD_EXPIRED }); // LEGACY ADR 0039
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      respondBy: new Date(Date.now() + 24 * 3600_000),
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(HOST_METRIC_MIN_SAMPLES);
    expect(m.responseRatePercent).toBe(100);
    expect(m.acceptKeepRatePercent).toBe(100);
  });

  /*
   * `hold_expired` CÓ `decided_at` là chuyện khác hẳn: ở thứ tự ADR 0044 nó nghĩa là gian hàng
   * đã nhận chuyến rồi khách không trả tiền. Gian hàng làm xong phần của mình (ADR 0044 điều 7).
   */
  maybe('`hold_expired` CÓ quyết định = đã nhận, khách không trả ⇒ vẫn tính là giữ chuyến', async () => {
    await seedKeptSamples(4);
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.HOLD_EXPIRED,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    expect(m.responseRatePercent).toBe(100);
    expect(m.acceptKeepRatePercent).toBe(100);
  });

  maybe('quá hạn không ai đụng tới ⇒ là mẫu, và KHÔNG phản hồi', async () => {
    await seedKeptSamples(4);
    await seedRequest({ status: BOOKING_REQUEST_STATUS.EXPIRED });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    expect(m.responseRatePercent).toBe(80);
    // Không trả lời làm giảm CẢ HAI — cùng MỘT mẫu, hai phép chia. Đó không phải phạt đúp.
    expect(m.acceptKeepRatePercent).toBe(80);
  });

  maybe('cửa sổ chặn dữ liệu cũ — yêu cầu ngoài 90 ngày không vào phép đếm', async () => {
    await seedKeptSamples(HOST_METRIC_MIN_SAMPLES);
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.EXPIRED,
      createdAt: new Date(Date.now() - 200 * 24 * 3600_000),
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(HOST_METRIC_MIN_SAMPLES);
    expect(m.responseRatePercent).toBe(100);
  });

  maybe('không rò sang gian hàng khác', async () => {
    await seedKeptSamples(HOST_METRIC_MIN_SAMPLES);
    for (let i = 0; i < HOST_METRIC_MIN_SAMPLES; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.EXPIRED,
        tenant: otherTenantId,
        vehicle: otherVehicleId,
      });
    }

    const both = await metrics.forTenants([tenantId, otherTenantId]);
    expect(both.get(tenantId)?.responseRatePercent).toBe(100);
    expect(both.get(otherTenantId)?.responseRatePercent).toBe(0);
  });

  /** Một gian hàng KHÔNG có yêu cầu nào vẫn phải có một mục — nếu không, nơi gọi phải tự nhớ. */
  maybe('tenant chưa có yêu cầu nào vẫn có mục, với ba chỉ số `null`', async () => {
    const map = await metrics.forTenants([tenantId, otherTenantId]);
    expect(map.get(otherTenantId)).toEqual({
      sampleCount: 0,
      responseRatePercent: null,
      acceptKeepRatePercent: null,
      responseMinutesMedian: null,
      instantBook: false,
    });
  });
});

describe('Tử số — phản hồi ≠ đồng ý', () => {
  /*
   * Đây là hệ quả 1 của ADR 0045 điều 3, và cũng là câu trả lời cho "nếu đổi tên nhãn thành Tỉ
   * lệ đồng ý thì sao": từ chối TRONG hạn là một lần phản hồi đàng hoàng, nhưng không phải một
   * lần đồng ý. Một gian hàng từ chối mọi thứ phải đọc ra đúng như vậy.
   */
  maybe('từ chối trong hạn: phản hồi 100%, nhận-và-giữ 0%', async () => {
    for (let i = 0; i < HOST_METRIC_MIN_SAMPLES; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
        decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      });
    }

    const m = await metrics.forTenant(tenantId);
    expect(m.responseRatePercent).toBe(100);
    expect(m.acceptKeepRatePercent).toBe(0);
  });

  /*
   * LEGACY ADR 0039: worker `expirePaidAwaitingAccept` ghi `rejected_by_host` khi gian hàng
   * KHÔNG hề phản hồi, và cố ý để trống `decided_at`. Hỏi `status` ở đây là trao điểm phản hồi
   * cho đúng nhóm không phản hồi.
   */
  maybe('`rejected_by_host` do worker ghi (không có `decided_at`) KHÔNG phải đã phản hồi', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
        decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      });
    }
    for (let i = 0; i < 2; i += 1) {
      await seedRequest({ status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, decidedAt: null });
    }

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    // Suy từ status sẽ ra 100%. Đọc `decided_at` ra 60% — con số đúng.
    expect(m.responseRatePercent).toBe(60);
  });

  maybe('khách huỷ SAU khi gian hàng đã nhận ⇒ vẫn là một lượt nhận-và-giữ', async () => {
    await seedKeptSamples(4);
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      cancelledBy: CANCELLATION_PARTY.CUSTOMER,
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    expect(m.responseRatePercent).toBe(100);
    // Gian hàng đã làm đúng phần của mình; phần còn lại không thuộc về họ.
    expect(m.acceptKeepRatePercent).toBe(100);
  });

  /*
   * Hệ quả 4: gian hàng huỷ sau khi đã nhận ⇒ mẫu đó RỜI tử số thứ hai, và KHÔNG sinh mẫu thứ
   * hai. Một chuyến hỏng là một lần trừ điểm, không phải hai.
   */
  maybe('gian hàng huỷ sau khi nhận: MỘT mẫu, vẫn là đã phản hồi, nhưng không giữ', async () => {
    await seedKeptSamples(4);
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      cancelledBy: CANCELLATION_PARTY.HOST,
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    expect(m.responseRatePercent).toBe(100);
    expect(m.acceptKeepRatePercent).toBe(80);
  });

  /** Nền tảng huỷ và sự cố ĐÃ XÁC MINH không phải lỗi của gian hàng — không rời tử số. */
  maybe('XePrime huỷ / bất khả kháng đã xác minh KHÔNG tính cho gian hàng', async () => {
    await seedKeptSamples(3);
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      cancelledBy: CANCELLATION_PARTY.PLATFORM,
    });
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      cancelledBy: CANCELLATION_PARTY.FORCE_MAJEURE,
    });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    expect(m.acceptKeepRatePercent).toBe(100);
  });
});

describe('Ngưỡng "đủ dữ liệu" — `null` KHÔNG phải 0', () => {
  maybe('dưới ngưỡng ⇒ ba chỉ số `null`, nhưng số mẫu vẫn nói thật', async () => {
    await seedRequest({ status: BOOKING_REQUEST_STATUS.EXPIRED });

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(1);
    // Một yêu cầu duy nhất cho ra 0% — một lần tung đồng xu nghe như một kết luận.
    expect(m.responseRatePercent).toBeNull();
    expect(m.acceptKeepRatePercent).toBeNull();
  });

  maybe('đúng ngưỡng là đủ — không phải "trên ngưỡng"', async () => {
    for (let i = 0; i < HOST_METRIC_MIN_SAMPLES; i += 1) {
      await seedRequest({ status: BOOKING_REQUEST_STATUS.EXPIRED });
    }

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(HOST_METRIC_MIN_SAMPLES);
    expect(m.responseRatePercent).toBe(0);
  });

  /*
   * Sổ ví của CHÍNH gian hàng hạ ngưỡng về 1: nó bảo vệ người LẠ khỏi kết luận vội, còn chủ xe
   * đọc tháng của mình đã sống qua từng yêu cầu — và bảng in số mẫu ngay cạnh.
   */
  maybe('`minSamples` hạ được cho đường đọc riêng tư', async () => {
    await seedRequest({ status: BOOKING_REQUEST_STATUS.EXPIRED });
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
    });

    const m = await metrics.forTenant(tenantId, { minSamples: 1 });
    expect(m.sampleCount).toBe(2);
    expect(m.responseRatePercent).toBe(50);
  });

  /** Hạ ngưỡng xuống 0 cũng KHÔNG bịa ra một con số từ không có mẫu nào. */
  maybe('không mẫu nào thì `minSamples: 1` vẫn trả `null`', async () => {
    const m = await metrics.forTenant(tenantId, { minSamples: 1 });
    expect(m.sampleCount).toBe(0);
    expect(m.responseRatePercent).toBeNull();
  });
});

describe('Thời gian phản hồi — chỉ đếm quyết định của NGƯỜI', () => {
  maybe('trung vị tính trên khoảng gửi → quyết, làm tròn về phút', async () => {
    const base = new Date(Date.now() - 2 * 24 * 3600_000);
    for (const minutes of [10, 20, 30, 40, 50]) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        createdAt: base,
        decidedAt: new Date(base.getTime() + minutes * 60_000),
      });
    }

    const m = await metrics.forTenant(tenantId);
    expect(m.responseMinutesMedian).toBe(30);
    expect(m.instantBook).toBe(false);
  });

  /*
   * Xe bật "Đặt ngay" quyết trong vài mili-giây. Trộn vào trung vị là quảng cáo một tốc độ trả
   * lời THỦ CÔNG không có thật — và con số đó sẽ đứng cạnh ảnh chân dung của một con người.
   */
  maybe('lượt tự nhận KHÔNG vào trung vị, mà bật cờ `instantBook`', async () => {
    const base = new Date(Date.now() - 2 * 24 * 3600_000);
    for (let i = 0; i < 4; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        createdAt: base,
        decidedAt: new Date(base.getTime() + 60 * 60_000),
      });
    }
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      createdAt: base,
      decidedAt: new Date(base.getTime() + 20),
      decisionSource: BOOKING_REQUEST_DECISION_SOURCE.SYSTEM,
    });

    const m = await metrics.forTenant(tenantId);
    // Trộn vào sẽ kéo trung vị xuống ~48 phút; loại ra thì nó đúng là 60.
    expect(m.responseMinutesMedian).toBe(60);
    expect(m.instantBook).toBe(true);
    // Lượt tự nhận vẫn là một mẫu, và vẫn là một lượt nhận-và-giữ.
    expect(m.sampleCount).toBe(5);
    expect(m.acceptKeepRatePercent).toBe(100);
  });

  maybe('gian hàng CHỈ dùng "Đặt ngay" ⇒ trung vị `null`, không phải 0 phút', async () => {
    const base = new Date(Date.now() - 2 * 24 * 3600_000);
    for (let i = 0; i < HOST_METRIC_MIN_SAMPLES; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        createdAt: base,
        decidedAt: new Date(base.getTime() + 15),
        decisionSource: BOOKING_REQUEST_DECISION_SOURCE.SYSTEM,
      });
    }

    const m = await metrics.forTenant(tenantId);
    expect(m.responseMinutesMedian).toBeNull();
    expect(m.instantBook).toBe(true);
  });
});

describe('Điểm uy tín cho XẾP HẠNG — làm mượt, không chặn ngưỡng', () => {
  /*
   * Đây là chỗ hai đường đọc TÁCH nhau (ADR 0045 điều 5). Hiển thị thì thà không nói còn hơn
   * nói sai; xếp hạng thì buộc phải cho MỌI xe một con số để so.
   *
   * Nếu điểm xếp hạng đọc lại `HostMetrics` đã bị chặn ngưỡng, một gian hàng giữ đúng 3/3
   * chuyến sẽ vào công thức như thể giữ 0/3 — phạt đúng người làm đúng, vì một lý do thuần kỹ
   * thuật. Bài test này khoá chính điều đó.
   */
  maybe('dưới ngưỡng: hiển thị `null` nhưng điểm xếp hạng vẫn dùng con số THẬT', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      });
    }

    const display = await metrics.forTenant(tenantId);
    expect(display.acceptKeepRatePercent).toBeNull();

    const reliability = await metrics.reliabilityFor([tenantId]);
    // 3 giữ / 3 mẫu, KHÔNG phải 0/3.
    expect(reliability.get(tenantId)).toBeCloseTo(hostReliabilityScore(3, 3), 10);
    expect(reliability.get(tenantId)!).toBeGreaterThan(HOST_RELIABILITY_PRIOR.priorRate);
  });

  maybe('chủ xe MỚI (0 mẫu) nhận đúng mức nền trung tính, không phải 0', async () => {
    const reliability = await metrics.reliabilityFor([tenantId]);
    expect(reliability.get(tenantId)).toBeCloseTo(HOST_RELIABILITY_PRIOR.priorRate, 10);
  });

  maybe('MỘT sự cố đơn lẻ kéo xuống nhẹ, không đẩy xuống đáy', async () => {
    await seedRequest({
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
      decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
      cancelledBy: CANCELLATION_PARTY.HOST,
    });

    const score = (await metrics.reliabilityFor([tenantId])).get(tenantId)!;
    expect(score).toBeCloseTo((0 + 5 * 0.8) / (1 + 5), 10);
    // Vẫn ở nửa trên của thang — một lần hỏng không phải một bản án.
    expect(score).toBeGreaterThan(0.6);
  });

  maybe('huỷ chuyến LIÊN TỤC mới kéo điểm về gần đáy', async () => {
    for (let i = 0; i < 30; i += 1) {
      await seedRequest({
        status: BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
        decidedAt: new Date(Date.now() - 2 * 24 * 3600_000),
        cancelledBy: CANCELLATION_PARTY.HOST,
      });
    }

    const score = (await metrics.reliabilityFor([tenantId])).get(tenantId)!;
    expect(score).toBeLessThan(0.15);
  });
});
