import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  INSURANCE_POLICY_STATUS,
  type InsurancePolicyStatus,
  type InsuranceProductKind,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INSURANCE_DEFAULT_LIMIT,
  INSURANCE_MAX_LIMIT,
  type PlatformInsuranceListQueryDto,
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
  certificateNumber: true,
  certificateUrl: true,
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
     * phải là danh sách việc; xem toàn bộ lịch sử là một lựa chọn có chủ đích, không phải mặc định.
     */
    const where: Prisma.BookingInsurancePolicyWhereInput = {
      status: query.status ?? INSURANCE_POLICY_STATUS.FAILED,
      ...(query.productKind ? { productKind: query.productKind } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bookingInsurancePolicy.findMany({
        where,
        select: SELECT,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.bookingInsurancePolicy.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
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
        certificateNumber: r.certificateNumber,
        certificateUrl: r.certificateUrl,
        coverageFrom: r.coverageFrom?.toISOString() ?? null,
        coverageTo: r.coverageTo?.toISOString() ?? null,
        issueAttempts: r.issueAttempts,
        lastErrorCode: r.lastErrorCode,
        lastErrorMessage: r.lastErrorMessage,
        nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
        issuedAt: r.issuedAt?.toISOString() ?? null,
        consentAt: r.consentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
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
