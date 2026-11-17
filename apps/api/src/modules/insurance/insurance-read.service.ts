import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, readInsuranceProductSnapshot } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_HOLD_OUTCOME,
  INSURANCE_POLICY_STATUS,
  INSURANCE_QUEUE_STATUS_ANY,
  INSURANCE_REMITTANCE_STATUS,
  insuranceCoverageStatusOf,
  type InsurancePolicyStatus,
  type InsuranceProductKind,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INSURANCE_DEFAULT_LIMIT,
  INSURANCE_MAX_LIMIT,
  type InsuranceCertificateDto,
  type InsuranceCoverageDto,
  type InsuranceVoidPlanDto,
  type PlatformInsuranceListQueryDto,
  type PlatformInsurancePolicyDetailDto,
  type PlatformInsurancePolicyDto,
} from './dto/insurance.dto';
import { insuranceVoidPlan } from './insurance-void-plan';

const SELECT = {
  id: true,
  bookingId: true,
  tenantId: true,
  productKind: true,
  status: true,
  premiumAmount: true,
  partnerName: true,
  partnerProductCode: true,
  productSnapshotJson: true,
  certificateNumber: true,
  certificateUrl: true,
  isTest: true,
  coverageFrom: true,
  coverageTo: true,
  issueAttempts: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  nextAttemptAt: true,
  issuedAt: true,
  consentAt: true,
  createdAt: true,
  tenant: { select: { name: true } },
  booking: {
    select: { code: true, customerName: true, vehicle: { select: { name: true } } },
  },
} satisfies Prisma.BookingInsurancePolicySelect;

type PolicyRow = Prisma.BookingInsurancePolicyGetPayload<{ select: typeof SELECT }>;

/**
 * GCN được KHÁCH và GIAN HÀNG nhìn thấy: đã cấp, hoặc đang bồi thường (vẫn là hợp đồng có hiệu
 * lực). `voided`/`cancelled` không phải một tờ giấy ai được cầm nữa.
 */
const VISIBLE_CERTIFICATE_STATUSES: InsurancePolicyStatus[] = [
  INSURANCE_POLICY_STATUS.ISSUED,
  INSURANCE_POLICY_STATUS.CLAIM,
];

const isoOrNull = (d: Date | null) => d?.toISOString() ?? null;

function jsonObjectOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * ĐỌC hợp đồng bảo hiểm — tách khỏi `InsuranceService` để writer giữ đúng một trách nhiệm.
 *
 * Cùng khuôn `WalletReadService`: service ghi là nơi mọi bất biến sống, và trộn các câu `findMany`
 * phân trang vào đó làm nó dài gấp đôi mà không thêm một bảo đảm nào.
 */
@Injectable()
export class InsuranceReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPlatform(query: PlatformInsuranceListQueryDto): Promise<{
    data: PlatformInsurancePolicyDto[];
    meta: PaginationMeta;
  }> {
    const paging = resolvePaging(query, INSURANCE_DEFAULT_LIMIT, INSURANCE_MAX_LIMIT);
    /*
     * Bỏ trống `status` ⇒ hàng đợi VIỆC CẦN LÀM (`failed`), không phải "tất cả". Màn admin mở ra
     * phải là danh sách việc; xem toàn bộ lịch sử là `status=any`, một lựa chọn có chủ đích.
     */
    const status = query.status ?? INSURANCE_POLICY_STATUS.FAILED;
    const where: Prisma.BookingInsurancePolicyWhereInput = {
      ...(status === INSURANCE_QUEUE_STATUS_ANY ? {} : { status }),
      ...(query.productKind ? { productKind: query.productKind } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.q
        ? {
            OR: [
              { certificateNumber: { contains: query.q, mode: 'insensitive' } },
              { booking: { code: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bookingInsurancePolicy.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.bookingInsurancePolicy.count({ where }),
    ]);

    return { data: rows.map(toPlatformDto), meta: paginationMeta(paging, total) };
  }

  /**
   * Chi tiết một hợp đồng kèm bằng chứng hai chiều với đối tác, lý do / mã đối chiếu của lượt thu hồi và
   * KẾ HOẠCH thu hồi (ADR 0093) — hộp thu hồi hiện đúng nhánh và số tiền server sẽ làm.
   */
  async detailForPlatform(
    id: string,
    now: Date = new Date(),
  ): Promise<PlatformInsurancePolicyDetailDto> {
    const row = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id },
      select: {
        ...SELECT,
        consentSource: true,
        lastAttemptAt: true,
        cancelledAt: true,
        voidedAt: true,
        voidReason: true,
        voidPartnerReference: true,
        refundedAt: true,
        remittanceId: true,
        serviceFeeAmount: true,
        hold: { select: { outcome: true, customerUserId: true } },
        idempotencyKey: true,
        requestPayloadJson: true,
        responsePayloadJson: true,
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hợp đồng bảo hiểm',
      });
    }
    return {
      ...toPlatformDto(row),
      consentSource: row.consentSource,
      lastAttemptAt: isoOrNull(row.lastAttemptAt),
      cancelledAt: isoOrNull(row.cancelledAt),
      voidedAt: isoOrNull(row.voidedAt),
      voidReason: row.voidReason,
      voidPartnerReference: row.voidPartnerReference,
      refundedAt: isoOrNull(row.refundedAt),
      voidPlan: toVoidPlanDto(row, now),
      idempotencyKey: row.idempotencyKey,
      requestPayload: jsonObjectOrNull(row.requestPayloadJson),
      responsePayload: jsonObjectOrNull(row.responsePayloadJson),
      productSnapshot: jsonObjectOrNull(row.productSnapshotJson),
    };
  }

  /**
   * GCN đã cấp của MỘT đơn — cho chi tiết chuyến của khách và chi tiết đơn của gian hàng.
   *
   * `tenantId` (khi có) nằm TRONG truy vấn: gian hàng hỏi một đơn không phải của mình thì nhận
   * danh sách rỗng, không phải GCN của người khác. Phía khách, quyền sở hữu chuyến đã được
   * `CustomerTripsService` kiểm trước khi gọi tới đây.
   */
  async certificatesForBooking(
    bookingId: string,
    scope: { tenantId?: string } = {},
  ): Promise<InsuranceCertificateDto[]> {
    const rows = await this.prisma.bookingInsurancePolicy.findMany({
      where: {
        bookingId,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        status: { in: VISIBLE_CERTIFICATE_STATUSES },
        certificateNumber: { not: null },
      },
      orderBy: { productKind: 'desc' }, // vehicle_trip trước personal_accident
      select: CUSTOMER_FACING_SELECT,
    });
    return rows.map(toCertificateDto);
  }

  /**
   * Tình trạng bảo hiểm của MỌI sản phẩm khách đã trả tiền trên MỘT đơn — kể cả khi GCN chưa có
   * (chờ/đang phát hành, lỗi) hoặc không bao giờ có (đã hoàn, đã thu hồi). Cùng luật phạm vi với
   * `certificatesForBooking`: `tenantId` (khi có) nằm TRONG truy vấn.
   *
   * Đơn tối đa hai dòng (`UNIQUE (booking_id, product_kind)`) — không cần phân trang.
   */
  async coverageForBooking(
    bookingId: string,
    scope: { tenantId?: string } = {},
  ): Promise<InsuranceCoverageDto[]> {
    const rows = await this.prisma.bookingInsurancePolicy.findMany({
      where: { bookingId, ...(scope.tenantId ? { tenantId: scope.tenantId } : {}) },
      orderBy: { productKind: 'desc' },
      select: { ...CUSTOMER_FACING_SELECT, status: true, premiumAmount: true },
    });
    return rows.map((r) => {
      const product = readInsuranceProductSnapshot(r.productSnapshotJson);
      const visible =
        VISIBLE_CERTIFICATE_STATUSES.includes(r.status as InsurancePolicyStatus) &&
        r.certificateNumber != null;
      return {
        kind: r.productKind as InsuranceProductKind,
        status: insuranceCoverageStatusOf(r.status as InsurancePolicyStatus),
        productNameVi: product?.nameVi ?? null,
        productNameEn: product?.nameEn ?? null,
        premiumAmount: r.premiumAmount.toFixed(0),
        certificate: visible ? toCertificateDto(r) : null,
      };
    });
  }

  /**
   * Phần phí bảo hiểm ĐÃ QUYẾT TOÁN với hãng tới một mốc — các bảng kê `paid` có `paid_at < end`.
   *
   * Đối soát ba vế cần ba con số từ đây, vì lượt trả hãng chia tiền làm ba phía:
   *  - `premiums`: tổng phí GỐC của các hợp đồng trong những bảng kê đó — rời vế GIỮ HỘ (hợp đồng
   *    `issued`/`claim` vẫn mang trạng thái cũ sau khi trả, nên `custodiedPremiumAsOf` vẫn đếm nó).
   *  - `commission`: hoa hồng đại lý XePrime được giữ lại — doanh thu NỀN TẢNG.
   *  - `outstanding`: phần còn nợ hãng = phải trả − đã trả (âm khi trả dư) — vẫn là GIỮ HỘ.
   *  Còn `paidOut` là số thật đã rời tài khoản.
   *
   * `premiums = commission + payable` theo phép lập bảng kê, nên bank giảm đúng `paidOut` và ba vế
   * vẫn khép: `premiums` ra khỏi giữ hộ, `commission` vào nền tảng, `outstanding` ở lại giữ hộ.
   */
  async remittedAsOf(end: Date): Promise<{
    premiums: Prisma.Decimal;
    commission: Prisma.Decimal;
    outstanding: Prisma.Decimal;
    paidOut: Prisma.Decimal;
  }> {
    const paidBefore: Prisma.InsurancePremiumRemittanceWhereInput = {
      status: INSURANCE_REMITTANCE_STATUS.PAID,
      paidAt: { lt: end },
    };
    const [policies, remittances] = await Promise.all([
      this.prisma.bookingInsurancePolicy.aggregate({
        where: { ...custodiedPolicyWhere(end), remittance: paidBefore },
        _sum: { premiumAmount: true },
      }),
      this.prisma.insurancePremiumRemittance.aggregate({
        where: paidBefore,
        _sum: { commissionAmount: true, payableAmount: true, paidAmount: true },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    const paidOut = remittances._sum.paidAmount ?? zero;
    return {
      premiums: policies._sum.premiumAmount ?? zero,
      commission: remittances._sum.commissionAmount ?? zero,
      outstanding: (remittances._sum.payableAmount ?? zero).sub(paidOut),
      paidOut,
    };
  }

  /** Số đã trả hãng TRONG một khoảng — dòng "đã chi" của đối soát ngày. */
  async remittedBetween(start: Date, end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.insurancePremiumRemittance.aggregate({
      where: { status: INSURANCE_REMITTANCE_STATUS.PAID, paidAt: { gte: start, lt: end } },
      _sum: { paidAmount: true },
    });
    return agg._sum.paidAmount ?? new Prisma.Decimal(0);
  }

  /**
   * Tổng phí bảo hiểm ĐANG GIỮ HỘ tới một mốc — vế `custodied.insuranceReserved` của đối soát.
   *
   * Gồm `reserved`/`issuing`/`failed` (chưa mua gì, tiền vẫn của khách), `issued`/`claim` và
   * `voided` đã từng cấp (khoản phải trả hãng — ADR 0093 điều 3), và `cancelled` của hold đã chốt
   * `settled` mà chưa hoàn tới mốc (còn nợ khách — ADR 0093 điều 5). Tất cả đều là tiền XePrime đang
   * cầm mà không sở hữu — chỉ khác ở chỗ đang nợ AI.
   */
  async custodiedPremiumAsOf(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.bookingInsurancePolicy.aggregate({
      where: custodiedPolicyWhere(end),
      _sum: { premiumAmount: true },
    });
    return agg._sum.premiumAmount ?? new Prisma.Decimal(0);
  }
}

/**
 * Hợp đồng mà phí của nó đang nằm ở vế giữ hộ tới mốc `end` (trước khi trừ phần đã nộp hãng). MỘT
 * định nghĩa cho `custodiedPremiumAsOf`, phần trừ của `remittedAsOf` và phần bảo hiểm nằm trong hold
 * chưa chốt (`BookingHoldsService`) — ba chỗ cùng một luật thì không chỗ nào đếm lệch chỗ nào.
 *
 *  - còn chờ cấp / đã cấp / đang bồi thường: tiền của khách hoặc phải trả hãng;
 *  - `voided` ĐÃ từng cấp: vẫn kê trả hãng cho tới khi hãng xác nhận huỷ (ADR 0093 điều 3);
 *  - `cancelled` của hold đã chốt `settled`, chưa hoàn tới `end`: phí đã rời hold sang "phải trả
 *    hãng", chờ vòng hoàn đưa về ví khách (ADR 0091 điều 7 · ADR 0093 điều 2).
 * `cancelled` do huỷ chuyến trước bàn giao không thuộc đây: phí của nó đã về khách qua chính hold.
 */
export function custodiedPolicyWhere(end: Date): Prisma.BookingInsurancePolicyWhereInput {
  return {
    createdAt: { lt: end },
    OR: [
      {
        status: {
          in: [
            INSURANCE_POLICY_STATUS.RESERVED,
            INSURANCE_POLICY_STATUS.ISSUING,
            INSURANCE_POLICY_STATUS.FAILED,
            INSURANCE_POLICY_STATUS.ISSUED,
            INSURANCE_POLICY_STATUS.CLAIM,
          ],
        },
      },
      { status: INSURANCE_POLICY_STATUS.VOIDED, issuedAt: { not: null } },
      {
        status: INSURANCE_POLICY_STATUS.CANCELLED,
        hold: { outcome: BOOKING_HOLD_OUTCOME.SETTLED },
        OR: [{ refundedAt: null }, { refundedAt: { gte: end } }],
      },
    ],
  };
}

function toVoidPlanDto(
  row: Parameters<typeof insuranceVoidPlan>[0],
  now: Date,
): InsuranceVoidPlanDto | null {
  const plan = insuranceVoidPlan(row, now);
  if (!plan) return null;
  return {
    branch: plan.branch,
    partnerReferenceRequired: plan.partnerReferenceRequired,
    refundTiming: plan.refundTiming,
    refundAmount: plan.refundAmount?.toFixed(0) ?? null,
    blockedByRemittance: plan.blockedByRemittance,
  };
}

/** Cột hợp đồng đủ để dựng GCN phía khách/gian hàng — không phí, không lỗi, không payload. */
const CUSTOMER_FACING_SELECT = {
  id: true,
  productKind: true,
  partnerName: true,
  productSnapshotJson: true,
  certificateNumber: true,
  certificateUrl: true,
  coverageFrom: true,
  coverageTo: true,
  isTest: true,
  issuedAt: true,
  createdAt: true,
  partnerContractNumber: true,
  partnerPolicyId: true,
} satisfies Prisma.BookingInsurancePolicySelect;

type CustomerFacingRow = Prisma.BookingInsurancePolicyGetPayload<{
  select: typeof CUSTOMER_FACING_SELECT;
}>;

function toCertificateDto(r: CustomerFacingRow): InsuranceCertificateDto {
  const product = readInsuranceProductSnapshot(r.productSnapshotJson);
  return {
    id: r.id,
    productKind: r.productKind as InsuranceProductKind,
    productNameVi: product?.nameVi ?? null,
    productNameEn: product?.nameEn ?? null,
    partnerName: r.partnerName,
    // Chỉ gọi khi có số GCN — CHECK ở DB cũng bắt buộc nó với `issued`.
    certificateNumber: r.certificateNumber ?? '',
    certificateUrl: r.certificateUrl,
    coverageFrom: isoOrNull(r.coverageFrom),
    coverageTo: isoOrNull(r.coverageTo),
    isTest: r.isTest,
    issuedAt: (r.issuedAt ?? r.createdAt).toISOString(),
    contractNumber: r.partnerContractNumber,
    pdfAvailable: r.partnerPolicyId != null,
    claimHotline: product?.claimHotline ?? null,
  };
}

function toPlatformDto(r: PolicyRow): PlatformInsurancePolicyDto {
  const product = readInsuranceProductSnapshot(r.productSnapshotJson);
  return {
    id: r.id,
    bookingId: r.bookingId,
    bookingCode: r.booking.code,
    tenantName: r.tenant.name,
    customerName: r.booking.customerName,
    vehicleName: r.booking.vehicle.name,
    productKind: r.productKind as InsuranceProductKind,
    status: r.status as InsurancePolicyStatus,
    premiumAmount: r.premiumAmount.toFixed(0),
    partnerName: r.partnerName,
    partnerProductCode: r.partnerProductCode,
    productNameVi: product?.nameVi ?? null,
    productNameEn: product?.nameEn ?? null,
    certificateNumber: r.certificateNumber,
    certificateUrl: r.certificateUrl,
    isTest: r.isTest,
    coverageFrom: isoOrNull(r.coverageFrom),
    coverageTo: isoOrNull(r.coverageTo),
    issueAttempts: r.issueAttempts,
    lastErrorCode: r.lastErrorCode,
    lastErrorMessage: r.lastErrorMessage,
    nextAttemptAt: isoOrNull(r.nextAttemptAt),
    issuedAt: isoOrNull(r.issuedAt),
    consentAt: isoOrNull(r.consentAt),
    createdAt: r.createdAt.toISOString(),
  };
}
