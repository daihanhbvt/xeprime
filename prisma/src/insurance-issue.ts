import { createHash } from 'node:crypto';
import {
  FEE_LINE,
  INSURANCE_CERTIFICATE_URL_PLACEHOLDER,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_ISSUING_LEASE_MINUTES,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PROVIDER,
  INSURANCE_TEST_CERTIFICATE_PREFIX,
  insuranceCertificateUrl,
  insuranceRetryDelayMinutes,
  type InsuranceConsentSource,
  type BookingPriceSnapshot,
  type InsuranceIssueError,
  type InsuranceProductKind,
  type InsuranceProductSnapshot,
} from '@xeprime/types';
import { Prisma, type InsuranceProduct, type PrismaClient } from '../generated/client';

/**
 * PHÁT HÀNH bảo hiểm chuyến — ADR 0032 điều 4 · ADR 0064.
 *
 * ## Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api`
 *
 * Cùng lý do với `promo-redemption.ts` và `push-outbox.ts`: có HAI tiến trình phải làm đúng một
 * chuỗi chuyển trạng thái này.
 *
 *   - **Worker** (`jobs/insurance-issue`) quét hợp đồng tới hạn mỗi phút và gọi đối tác. Worker
 *     cố ý không kéo runtime Nest vào nên không gọi được `InsuranceService`.
 *   - **API** (`InsuranceService`) là lớp vỏ tiêm được của chính các hàm này — spec của API khoá
 *     luật trên đúng đoạn code worker chạy, không phải trên một bản sao.
 *
 * Trước 21/10/2026 worker chỉ biết ghi `failed/partner_not_configured`, còn `claimDue/issueOne`
 * của API không có ai gọi — hai bản, một bản chết. Bản này là MỘT bản.
 *
 * Phương án đã cân nhắc và bỏ: worker gọi một endpoint nội bộ của API. Nó cần một bí mật dùng
 * chung mới, một đường mạng worker → api và một biến env nữa ở GitHub Environment — ba thứ để
 * chạy đúng một hàm thuần trên cùng một database mà cả hai tiến trình đã nối sẵn.
 *
 * ## Ba bất biến
 *
 *  1. **CHIẾM bằng `updateMany` có điều kiện**, không đọc-rồi-ghi: hai worker (deploy chồng) thì
 *     đúng một bên thấy `count = 1`.
 *  2. **Gọi đối tác NGOÀI mọi transaction.** Một đối tác treo 30 giây không được giữ khoá trên
 *     `bookings`.
 *  3. **Không có đường ghi `issued` tay không.** `CHECK …issued_needs_certificate_check` đòi số
 *     GCN; `CHECK …test_certificate_check` buộc GCN thử nghiệm mang tiền tố `TEST-`.
 */

// ── Cổng đối tác ─────────────────────────────────────────────────────────────

/**
 * Snapshot sản phẩm — kiểu sống ở `@xeprime/types` (`BookingPriceSnapshot.insuranceProducts` cần
 * nó), re-export ở đây cho các chỗ import cũ.
 */
export type { InsuranceProductSnapshot };

/** Dòng `insurance_products` đủ để dựng snapshot. */
export type InsuranceProductRow = InsuranceProduct;

export function toInsuranceProductSnapshot(row: InsuranceProductRow): InsuranceProductSnapshot {
  const money = (v: Prisma.Decimal | null) => (v === null ? null : v.toFixed(0));
  return {
    id: row.id,
    kind: row.kind as InsuranceProductKind,
    provider: row.provider,
    partnerProductCode: row.partnerProductCode,
    nameVi: row.nameVi,
    nameEn: row.nameEn,
    coverageVi: row.coverageVi,
    coverageEn: row.coverageEn,
    deductibleCar: money(row.deductibleCar),
    deductibleMotorbike: money(row.deductibleMotorbike),
    maxPayoutCar: money(row.maxPayoutCar),
    maxPayoutMotorbike: money(row.maxPayoutMotorbike),
    maxPayoutNoteVi: row.maxPayoutNoteVi,
    maxPayoutNoteEn: row.maxPayoutNoteEn,
    certificateUrlTemplate: row.certificateUrlTemplate,
  };
}

/** Đọc lại snapshot từ JSON — `null` khi không có hoặc hỏng hình dạng (hợp đồng cũ). */
export function readInsuranceProductSnapshot(value: unknown): InsuranceProductSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<InsuranceProductSnapshot>;
  if (typeof v.id !== 'string' || typeof v.certificateUrlTemplate !== 'string') return null;
  return v as InsuranceProductSnapshot;
}

export interface IssuePolicyRequest {
  /** Khoá chống mua đôi ở phía đối tác — KHÔNG đổi qua các lần thử lại. */
  idempotencyKey: string;
  productKind: InsuranceProductKind;
  premiumAmount: string;
  coverageFrom: Date;
  coverageTo: Date;
  vehicle: { plateNumber: string | null; name: string; vehicleType: string };
  customer: { name: string; phone: string | null };
  /** Bằng chứng khách chọn — đối tác có thể đòi khi đối chiếu. */
  consent: { at: Date; source: InsuranceConsentSource } | null;
  /** Sản phẩm đã bán — mã sản phẩm đối tác + mẫu URL tra cứu GCN. `null` = hợp đồng cũ. */
  product: InsuranceProductSnapshot | null;
}

export type IssuePolicyResult =
  | {
      ok: true;
      certificateNumber: string;
      certificateUrl?: string;
      partnerProductCode?: string;
      /** GCN của adapter GIẢ LẬP — không có hiệu lực bảo hiểm. */
      isTest: boolean;
      /** Nguyên trạng phản hồi của đối tác — bằng chứng, ghi thẳng vào DB. */
      raw: unknown;
    }
  | {
      ok: false;
      code: InsuranceIssueError;
      message: string;
      /** `false` = lỗi vĩnh viễn, thử lại vô ích (đối tác từ chối, dữ liệu sai). */
      retryable: boolean;
      raw?: unknown;
    };

export interface InsurancePartner {
  /** Tên hiện cho khách và ghi vào snapshot hợp đồng. */
  readonly partnerName: string;
  /** Có cắm đối tác chưa — `false` thì cổng phát hành báo `partner_not_configured`. */
  readonly configured: boolean;
  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult>;
}

/** Ghi log tối thiểu — API truyền `Logger` của Nest, worker truyền `console`. */
export interface InsuranceLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

const SILENT: InsuranceLogger = { warn: () => undefined };

/** Giá trị của `INSURANCE_PARTNER` — `apps/api/src/config/env.schema.ts` canh cùng tập. */
export const INSURANCE_PARTNER_MODE = {
  NONE: 'none',
  MIC_MOCK: 'mic_mock',
} as const;

export type InsurancePartnerMode =
  (typeof INSURANCE_PARTNER_MODE)[keyof typeof INSURANCE_PARTNER_MODE];

/**
 * Adapter MẶC ĐỊNH — không có đối tác nào, và nói thẳng ra điều đó.
 *
 * Một adapter trả `ok: true` với một số chứng nhận bịa là một lời khẳng định với khách rằng họ
 * CÓ bảo hiểm. Bản mặc định trả `partner_not_configured`, `retryable: false`: hợp đồng dừng ở
 * `failed`, hiện trong hàng đợi admin, và phí vẫn nằm ở vế GIỮ HỘ của đối soát ba vế.
 *
 * Với `none`, báo giá cũng không chào bảo hiểm nữa (`insuranceOffered = false`), nên dòng ở đây
 * chỉ còn đến từ đơn cũ hoặc từ một môi trường vừa đổi cấu hình.
 */
export class NoopInsurancePartner implements InsurancePartner {
  /** Tên trung lập — không bao giờ điền tên một hãng chưa ký hợp đồng (ADR 0028 điều 5). */
  readonly partnerName = 'Chưa có đối tác bảo hiểm';
  readonly configured = false;

  constructor(private readonly logger: InsuranceLogger = SILENT) {}

  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    this.logger.warn('insurance: chưa cắm đối tác — không phát hành, KHÔNG đánh dấu issued', {
      idempotencyKey: request.idempotencyKey,
      productKind: request.productKind,
    });
    return Promise.resolve({
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
      message:
        'Chưa cấu hình đối tác bảo hiểm — phí đã thu đang được giữ hộ, chưa có chứng nhận nào được cấp',
      retryable: false,
    });
  }
}

/**
 * Tiền tố số GCN theo sản phẩm MIC: `VCX` — vật chất xe (`IV`), `NNTX` — người ngồi trên xe (`IP`).
 * Adapter giả lập gắn thêm `TEST-` phía trước.
 */
export const MIC_CERTIFICATE_PREFIX = {
  [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: 'MIC-VCX',
  [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: 'MIC-NNTX',
} as const satisfies Record<InsuranceProductKind, string>;

/** Mẫu URL tra cứu khi hợp đồng không mang snapshot sản phẩm (đơn tạo trước danh mục). */
export const MIC_MOCK_CERTIFICATE_URL_TEMPLATE = `https://staging-cert.mic.vn/view/${INSURANCE_CERTIFICATE_URL_PLACEHOLDER}`;

/**
 * Adapter GIẢ LẬP MIC — chỉ cho dev/staging, để luồng bàn giao → phát hành → hiện GCN chạy trọn
 * trước khi có hợp đồng thật. Bật bằng `INSURANCE_PARTNER=mic_mock`.
 *
 * ## ⚠️ KHÔNG BAO GIỜ chạy ở production
 *
 * `env.schema.ts` của API từ chối boot, và `createInsurancePartner` (worker gọi lúc khởi động)
 * ném lỗi khi `APP_ENV=production`. Thêm vào đó, GCN nó cấp luôn mang tiền tố `TEST-` và cờ
 * `is_test` — CHECK ở DB buộc hai thứ đó đi cùng nhau — nên kể cả khi cấu hình sai lọt qua, mọi
 * màn hình vẫn đọc được chữ THỬ NGHIỆM trong chính số chứng nhận.
 *
 * ## Idempotent theo thiết kế
 *
 * Số GCN suy TẤT ĐỊNH từ `idempotencyKey` (SHA-256), không ngẫu nhiên: thử lại một hợp đồng phải
 * nhận đúng số cũ — đúng hành vi mà đối tác thật phải có với khoá chống mua đôi.
 */
export class MicMockInsurancePartner implements InsurancePartner {
  readonly partnerName = 'MIC (giả lập — môi trường thử nghiệm)';
  readonly configured = true;

  constructor(private readonly logger: InsuranceLogger = SILENT) {}

  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    const invalid = invalidReason(request);
    if (invalid) {
      return Promise.resolve({
        ok: false,
        code: INSURANCE_ISSUE_ERROR.INVALID_REQUEST,
        message: invalid,
        // Dữ liệu sai thì thử lại vẫn sai — cần người sửa chuyến rồi bấm thử lại.
        retryable: false,
      });
    }

    const prefix = MIC_CERTIFICATE_PREFIX[request.productKind];
    const certificateNumber = `${INSURANCE_TEST_CERTIFICATE_PREFIX}${prefix}-${certificateSuffix(request.idempotencyKey)}`;
    const template = request.product?.certificateUrlTemplate ?? MIC_MOCK_CERTIFICATE_URL_TEMPLATE;
    const certificateUrl = insuranceCertificateUrl(template, certificateNumber);
    const partnerProductCode = request.product?.partnerProductCode ?? prefix;
    this.logger.warn('insurance: MIC GIẢ LẬP phát hành GCN — không có hiệu lực bảo hiểm thật', {
      idempotencyKey: request.idempotencyKey,
      productKind: request.productKind,
      certificateNumber,
    });
    return Promise.resolve({
      ok: true,
      certificateNumber,
      certificateUrl,
      partnerProductCode,
      isTest: true,
      // Bằng chứng ghi thẳng vào DB — đánh dấu để không ai đọc nhầm thành hợp đồng thật.
      raw: {
        mock: true,
        isTest: true,
        partner: INSURANCE_PROVIDER.MIC,
        certificateNumber,
        certificateUrl,
        partnerProductCode,
        productKind: request.productKind,
        premiumAmount: request.premiumAmount,
        coverageFrom: request.coverageFrom.toISOString(),
        coverageTo: request.coverageTo.toISOString(),
      },
    });
  }
}

/**
 * Chọn adapter theo cấu hình. Ném lỗi khi `mic_mock` gặp `APP_ENV=production` — worker gọi hàm
 * này lúc boot, nên cấu hình sai làm tiến trình CHẾT thay vì phát GCN giả cho khách thật.
 */
export function createInsurancePartner(
  mode: string | undefined,
  options: { appEnv?: string | undefined; logger?: InsuranceLogger } = {},
): InsurancePartner {
  const normalized = (mode ?? INSURANCE_PARTNER_MODE.NONE).trim().toLowerCase();
  if (normalized === INSURANCE_PARTNER_MODE.MIC_MOCK) {
    // Không có APP_ENV ⇒ coi là production: an toàn đi về phía không phát GCN giả.
    const appEnv = (options.appEnv ?? 'production').trim().toLowerCase();
    if (appEnv === 'production') {
      throw new Error(
        'INSURANCE_PARTNER=mic_mock chỉ dành cho dev/staging — production phải dùng none cho tới khi có adapter đối tác thật',
      );
    }
    return new MicMockInsurancePartner(options.logger);
  }
  if (normalized !== INSURANCE_PARTNER_MODE.NONE) {
    throw new Error(`INSURANCE_PARTNER không hợp lệ: "${mode}" (chỉ nhận none | mic_mock)`);
  }
  return new NoopInsurancePartner(options.logger);
}

// ── Vòng phát hành ──────────────────────────────────────────────────────────

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Mốc trước đó một lượt `issuing` được coi là BỎ DỞ — worker chiếm rồi chết (deploy, OOM) trước
 * khi ghi kết quả. Một nguồn cho worker (nhặt lại) và nút thử lại của admin.
 */
export function insuranceIssuingStaleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - INSURANCE_ISSUING_LEASE_MINUTES * 60_000);
}

/** Điều kiện "`issuing` đã quá hạn thuê" — dùng trong WHERE của phép chiếm. */
function staleIssuingWhere(now: Date): Prisma.BookingInsurancePolicyWhereInput {
  return {
    status: INSURANCE_POLICY_STATUS.ISSUING,
    OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: insuranceIssuingStaleBefore(now) } }],
  };
}

/**
 * CHIẾM một lô hợp đồng tới hạn — `updateMany` có điều kiện, không đọc-rồi-ghi.
 *
 * Hai nguồn: hợp đồng `reserved`/`failed` tới mốc thử, và hợp đồng kẹt ở `issuing` quá
 * `INSURANCE_ISSUING_LEASE_MINUTES` — worker trước đã chiếm rồi chết giữa chừng. Không nhặt lại
 * thì hợp đồng đó kẹt VĨNH VIỄN: không ai thử lại, admin cũng không bấm thử lại được, và phí của
 * khách nằm im ở vế giữ hộ. Nhặt lại an toàn vì `idempotencyKey` không đổi qua các lần thử —
 * đối tác trả đúng GCN cũ nếu lượt trước thật ra đã thành công.
 */
export async function claimDueInsurancePolicies(
  prisma: Db,
  limit: number,
  now: Date = new Date(),
): Promise<string[]> {
  const due = await prisma.bookingInsurancePolicy.findMany({
    where: {
      OR: [
        {
          status: { in: [INSURANCE_POLICY_STATUS.RESERVED, INSURANCE_POLICY_STATUS.FAILED] },
          nextAttemptAt: { not: null, lte: now },
        },
        staleIssuingWhere(now),
      ],
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true, status: true, lastAttemptAt: true },
  });

  const claimed: string[] = [];
  for (const row of due) {
    const where: Prisma.BookingInsurancePolicyWhereInput =
      row.status === INSURANCE_POLICY_STATUS.ISSUING
        ? // Chiếm lại một lượt bỏ dở: khớp ĐÚNG `lastAttemptAt` đã đọc — hai worker cùng thấy nó
          // quá hạn thì chỉ một bên ghi được mốc mới.
          { id: row.id, ...staleIssuingWhere(now), lastAttemptAt: row.lastAttemptAt }
        : // `status` trong WHERE là phần CHIẾM: ai đổi nó trước thì bên còn lại trượt.
          { id: row.id, status: row.status, nextAttemptAt: { not: null, lte: now } };
    const { count } = await prisma.bookingInsurancePolicy.updateMany({
      where,
      data: { status: INSURANCE_POLICY_STATUS.ISSUING, lastAttemptAt: now },
    });
    if (count === 1) claimed.push(row.id);
  }
  return claimed;
}

/** Kết quả đã chuẩn hoá để ghi — thời hạn bảo hiểm luôn là thời gian của CHUYẾN. */
export type InsuranceIssueOutcome =
  | {
      ok: true;
      certificateNumber: string;
      certificateUrl?: string;
      partnerProductCode?: string;
      isTest: boolean;
      coverageFrom: Date;
      coverageTo: Date;
      raw: unknown;
    }
  | { ok: false; code: InsuranceIssueError; message: string; retryable: boolean; raw?: unknown };

/**
 * Ghi kết quả một lần gọi đối tác. Chỉ ghi lên dòng đang `issuing` — một admin thu hồi giữa
 * chừng (hiếm, nhưng có) thì kết quả muộn không được hồi sinh hợp đồng đã thu hồi.
 */
export async function applyInsuranceIssueResult(
  prisma: Db,
  policyId: string,
  result: InsuranceIssueOutcome,
  now: Date = new Date(),
): Promise<boolean> {
  if (result.ok) {
    const { count } = await prisma.bookingInsurancePolicy.updateMany({
      where: { id: policyId, status: INSURANCE_POLICY_STATUS.ISSUING },
      data: {
        status: INSURANCE_POLICY_STATUS.ISSUED,
        certificateNumber: result.certificateNumber,
        certificateUrl: result.certificateUrl ?? null,
        ...(result.partnerProductCode ? { partnerProductCode: result.partnerProductCode } : {}),
        isTest: result.isTest,
        coverageFrom: result.coverageFrom,
        coverageTo: result.coverageTo,
        issuedAt: now,
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        issueAttempts: { increment: 1 },
        responsePayloadJson: toJson(result.raw),
      },
    });
    return count === 1;
  }

  const current = await prisma.bookingInsurancePolicy.findUnique({
    where: { id: policyId },
    select: { issueAttempts: true },
  });
  if (!current) return false;
  const attempts = current.issueAttempts + 1;
  /*
   * Lỗi KHÔNG thử lại được (đối tác từ chối, chưa cắm đối tác) ⇒ `nextAttemptAt = null`: worker
   * thôi nhặt nó, và nó nằm im trong hàng đợi admin cho tới khi có người xử lý.
   */
  const nextAttemptAt = result.retryable
    ? new Date(now.getTime() + insuranceRetryDelayMinutes(attempts) * 60_000)
    : null;

  const { count } = await prisma.bookingInsurancePolicy.updateMany({
    where: { id: policyId, status: INSURANCE_POLICY_STATUS.ISSUING },
    data: {
      status: INSURANCE_POLICY_STATUS.FAILED,
      issueAttempts: attempts,
      lastErrorCode: result.code,
      lastErrorMessage: result.message.slice(0, 2000),
      nextAttemptAt,
      responsePayloadJson: toJson(result.raw ?? { code: result.code, at: now.toISOString() }),
    },
  });
  return count === 1;
}

/**
 * Gọi đối tác cho MỘT hợp đồng đã chiếm. Không chạy trong transaction nào — đó là chủ đích.
 */
export async function issueInsurancePolicy(
  prisma: PrismaClient,
  partner: InsurancePartner,
  policyId: string,
  now: Date = new Date(),
): Promise<'issued' | 'failed' | 'skipped'> {
  const policy = await prisma.bookingInsurancePolicy.findUnique({
    where: { id: policyId },
    select: {
      id: true,
      status: true,
      productKind: true,
      premiumAmount: true,
      idempotencyKey: true,
      consentAt: true,
      consentSource: true,
      productSnapshotJson: true,
      booking: {
        select: {
          pickupAt: true,
          returnAt: true,
          customerName: true,
          customerPhone: true,
          vehicle: { select: { name: true, plateNumber: true, vehicleType: true } },
        },
      },
    },
  });
  if (!policy || policy.status !== INSURANCE_POLICY_STATUS.ISSUING) return 'skipped';

  const productKind = policy.productKind as InsuranceProductKind;
  /*
   * Hợp đồng tạo trước danh mục (21/10/2026) không có snapshot — đọc sản phẩm HIỆN HÀNH của
   * cùng loại chỉ để lấy mã sản phẩm và mẫu URL. Quyền lợi đã hứa thì không tra lại: đơn đó
   * chưa từng hiện quyền lợi nào cho khách.
   */
  const product =
    readInsuranceProductSnapshot(policy.productSnapshotJson) ??
    (await liveProductSnapshot(prisma, productKind));

  const request: IssuePolicyRequest = {
    idempotencyKey: policy.idempotencyKey,
    productKind,
    premiumAmount: policy.premiumAmount.toFixed(0),
    coverageFrom: policy.booking.pickupAt,
    coverageTo: policy.booking.returnAt,
    vehicle: {
      name: policy.booking.vehicle.name,
      plateNumber: policy.booking.vehicle.plateNumber,
      vehicleType: policy.booking.vehicle.vehicleType,
    },
    customer: { name: policy.booking.customerName, phone: policy.booking.customerPhone },
    consent:
      policy.consentAt && policy.consentSource
        ? { at: policy.consentAt, source: policy.consentSource as InsuranceConsentSource }
        : null,
    product,
  };

  await prisma.bookingInsurancePolicy.update({
    where: { id: policyId },
    data: { requestPayloadJson: toJson(request) },
  });

  let result: IssuePolicyResult;
  try {
    result = await partner.issue(request);
  } catch (err) {
    /*
     * Adapter ném thay vì trả lỗi — coi là tạm thời và thử lại. Không bắt ở đây thì hợp đồng
     * kẹt vĩnh viễn ở `issuing`, worker không bao giờ nhặt lại, phí của khách nằm im.
     */
    result = {
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
      message: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }

  if (result.ok && result.isTest !== result.certificateNumber.startsWith(INSURANCE_TEST_CERTIFICATE_PREFIX)) {
    // Adapter tự mâu thuẫn — CHECK ở DB sẽ từ chối; ghi thành lỗi để người trực thấy.
    result = {
      ok: false,
      code: INSURANCE_ISSUE_ERROR.INVALID_REQUEST,
      message: `Đối tác trả số GCN "${result.certificateNumber}" không khớp cờ thử nghiệm`,
      retryable: false,
      raw: result.raw,
    };
  }

  await applyInsuranceIssueResult(
    prisma,
    policyId,
    result.ok
      ? {
          ok: true,
          certificateNumber: result.certificateNumber,
          ...(result.certificateUrl === undefined ? {} : { certificateUrl: result.certificateUrl }),
          ...(result.partnerProductCode === undefined
            ? {}
            : { partnerProductCode: result.partnerProductCode }),
          isTest: result.isTest,
          coverageFrom: policy.booking.pickupAt,
          coverageTo: policy.booking.returnAt,
          raw: result.raw,
        }
      : result,
    now,
  );
  return result.ok ? 'issued' : 'failed';
}

export interface InsuranceSweepResult {
  claimed: number;
  issued: number;
  failed: number;
}

/** Một vòng của worker: chiếm lô tới hạn rồi phát hành từng hợp đồng, tuần tự. */
export async function sweepDueInsurancePolicies(
  prisma: PrismaClient,
  partner: InsurancePartner,
  options: { batch?: number; now?: Date } = {},
): Promise<InsuranceSweepResult> {
  const now = options.now ?? new Date();
  const ids = await claimDueInsurancePolicies(prisma, options.batch ?? 50, now);
  let issued = 0;
  let failed = 0;
  for (const id of ids) {
    const outcome = await issueInsurancePolicy(prisma, partner, id, now);
    if (outcome === 'issued') issued += 1;
    else if (outcome === 'failed') failed += 1;
  }
  return { claimed: ids.length, issued, failed };
}

// ── Đóng băng sản phẩm lúc duyệt (ADR 0024 · 0064) ──────────────────────────

/** Dòng phí của snapshot ↔ loại sản phẩm bảo hiểm. */
const PRODUCT_KIND_BY_FEE_LINE = {
  [FEE_LINE.VEHICLE_PROTECTION]: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  [FEE_LINE.TRIP_INSURANCE]: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
} as const;

/**
 * Sản phẩm ĐANG BẬT của mỗi loại, dạng snapshot. Loại không có sản phẩm bật thì vắng mặt.
 */
export async function activeInsuranceProductSnapshots(
  prisma: Db,
): Promise<Map<InsuranceProductKind, InsuranceProductSnapshot>> {
  const rows = await prisma.insuranceProduct.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
  const byKind = new Map<InsuranceProductKind, InsuranceProductSnapshot>();
  for (const row of rows) {
    const kind = row.kind as InsuranceProductKind;
    if (!byKind.has(kind)) byKind.set(kind, toInsuranceProductSnapshot(row));
  }
  return byKind;
}

/**
 * Gắn `insuranceProducts` vào snapshot giá LÚC DUYỆT — cùng transaction chốt giá và tạo hold.
 *
 * Chỉ cho loại có phí `> 0` trong `fees.lines` (khách đã chọn VÀ cổng đang mở). Snapshot đã mang
 * `insuranceProducts` thì giữ nguyên — không bao giờ viết lại một lời hứa đã đóng băng.
 */
export async function freezeInsuranceProducts(
  prisma: Db,
  snapshot: BookingPriceSnapshot,
): Promise<BookingPriceSnapshot> {
  if (snapshot.insuranceProducts) return snapshot;
  const kinds = (snapshot.fees?.lines ?? [])
    .filter((line) => line.key in PRODUCT_KIND_BY_FEE_LINE && Number(line.amount) > 0)
    .map((line) => PRODUCT_KIND_BY_FEE_LINE[line.key as keyof typeof PRODUCT_KIND_BY_FEE_LINE]);
  if (kinds.length === 0) return snapshot;
  const active = await activeInsuranceProductSnapshots(prisma);
  const frozen: Partial<Record<InsuranceProductKind, InsuranceProductSnapshot>> = {};
  for (const kind of kinds) {
    const product = active.get(kind);
    if (product) frozen[kind] = product;
  }
  return Object.keys(frozen).length > 0 ? { ...snapshot, insuranceProducts: frozen } : snapshot;
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

async function liveProductSnapshot(
  prisma: Db,
  kind: InsuranceProductKind,
): Promise<InsuranceProductSnapshot | null> {
  const row = await prisma.insuranceProduct.findFirst({
    where: { kind },
    orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }],
  });
  return row ? toInsuranceProductSnapshot(row) : null;
}

/** Lý do một yêu cầu phát hành không hợp lệ — `null` = hợp lệ. Cùng điều đối tác thật sẽ đòi. */
function invalidReason(request: IssuePolicyRequest): string | null {
  const premium = Number(request.premiumAmount);
  if (!Number.isFinite(premium) || premium <= 0) {
    return `Phí bảo hiểm không hợp lệ: ${request.premiumAmount}`;
  }
  if (!(request.coverageTo.getTime() > request.coverageFrom.getTime())) {
    return 'Thời hạn bảo hiểm không hợp lệ — ngày kết thúc phải sau ngày bắt đầu';
  }
  return null;
}

/** 8 ký tự HEX in hoa, tất định theo khoá chống mua đôi. */
function certificateSuffix(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 8).toUpperCase();
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
}
