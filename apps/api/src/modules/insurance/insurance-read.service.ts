import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, readInsuranceProductSnapshot } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_QUEUE_STATUS_ANY,
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
  type PlatformInsuranceListQueryDto,
  type PlatformInsurancePolicyDetailDto,
  type PlatformInsurancePolicyDto,
} from './dto/insurance.dto';

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

  /** Chi tiết một hợp đồng kèm bằng chứng hai chiều với đối tác. */
  async detailForPlatform(id: string): Promise<PlatformInsurancePolicyDetailDto> {
    const row = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id },
      select: {
        ...SELECT,
        consentSource: true,
        lastAttemptAt: true,
        cancelledAt: true,
        voidedAt: true,
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
   * Tổng phí bảo hiểm ĐANG GIỮ HỘ tới một mốc — vế `custodied.insuranceReserved` của đối soát.
   *
   * Gồm `reserved`/`issuing`/`failed` (chưa mua gì, tiền vẫn của khách) và `issued`/`claim`
   * (đã thành khoản phải trả hãng bảo hiểm). Cả năm đều là tiền XePrime đang cầm mà không sở
   * hữu — chỉ khác ở chỗ đang nợ AI. `cancelled` đã hoàn khách, `voided` quyết toán riêng.
   */
  async custodiedPremiumAsOf(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.bookingInsurancePolicy.aggregate({
      where: {
        createdAt: { lt: end },
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
      _sum: { premiumAmount: true },
    });
    return agg._sum.premiumAmount ?? new Prisma.Decimal(0);
  }
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
