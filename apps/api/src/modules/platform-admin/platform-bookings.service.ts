import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_DATE_FIELD,
  BOOKING_STATUS,
  PERMISSION,
  PLATFORM_TRIP_QUEUE,
  SUPPORT_CASE_STATUS_OPEN,
  TRIP_PICKUP_WINDOW_HOURS,
  tripVerdictsFor,
  type BookingPriceSnapshot,
  type PaginationMeta,
} from '@xeprime/types';
import type { PlatformContext } from '../../common/types/request-context';
import { CERTIFICATE_DOWNLOADABLE_STATUSES } from '../insurance/insurance-certificate.service';
import { marketplaceFeesOf } from './platform-booking-money';
import { maskPhone } from '../../common/mask';
import { bookingSourceWhere } from '../../common/booking-source';
import {
  bookingMoney,
  emptyMoneySides,
  loadBookingMoneySides,
  type BookingMoneySides,
} from '../../common/booking-money';
import { paginationMeta, resolvePaging, type ResolvedPaging } from '../../common/pagination';
import { phoneLookupVariants } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BookingContactDto,
  PLATFORM_BOOKING_DEFAULT_LIMIT,
  PLATFORM_BOOKING_MAX_LIMIT,
  PlatformBookingBankTxDto,
  PlatformBookingDetailDto,
  PlatformBookingDto,
  PlatformBookingHoldDto,
  PlatformBookingInsuranceDto,
  PlatformBookingListQueryDto,
  PlatformBookingTaxRowDto,
} from './dto/platform-booking.dto';
import type { PlatformTripBookingListQueryDto } from './dto/platform-trip.dto';

const HOUR_MS = 3_600_000;
/** Case mở hiện trên drawer đơn - một đơn có quá 10 case mở là chuyện của màn Hỗ trợ. */
const OPEN_SUPPORT_CASES_LIMIT = 10;

/** Đơn "sắp giao xe": đã có đơn, xe chưa rời bãi. `confirmed` chỉ còn ở dữ liệu cũ (ADR 0047). */
const UPCOMING_STATUSES: string[] = [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED];

const LIST_SELECT = {
  id: true,
  code: true,
  status: true,
  serviceType: true,
  source: true,
  sourceLabel: true,
  customerName: true,
  customerPhone: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  paidAmount: true,
  tenantId: true,
  vehicleId: true,
  createdAt: true,
  tenant: { select: { name: true, status: true } },
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingSelect;

const HOLD_SELECT = {
  id: true,
  code: true,
  status: true,
  outcome: true,
  amount: true,
  paidAmount: true,
  expiresAt: true,
  paidAt: true,
  freeCancelUntil: true,
  releasedAt: true,
  settledCustomerAmount: true,
  settledOwnerAmount: true,
  settledPlatformAmount: true,
  settledInsurerAmount: true,
  settledTaxAmount: true,
  refund: {
    select: {
      status: true,
      amount: true,
      reason: true,
      settlementMode: true,
      paidAt: true,
      bankReference: true,
      bankCode: true,
      bankAccountNumber: true,
      bankAccountName: true,
    },
  },
} satisfies Prisma.BookingHoldSelect;

const INSURANCE_SELECT = {
  id: true,
  productKind: true,
  status: true,
  premiumAmount: true,
  partnerName: true,
  certificateNumber: true,
  partnerPolicyId: true,
  isTest: true,
  issuedAt: true,
} satisfies Prisma.BookingInsurancePolicySelect;

const TAX_SELECT = {
  id: true,
  periodKey: true,
  status: true,
  amount: true,
  vatAmount: true,
  pitAmount: true,
  reversalOfId: true,
  bookingExtensionId: true,
} satisfies Prisma.TaxWithholdingSelect;

/**
 * Đơn thuê TOÀN HỆ THỐNG cho admin nền tảng (build plan §11.1) — chỉ ĐỌC.
 *
 * Nền tảng giám sát và hỗ trợ, KHÔNG can thiệp trạng thái đơn: chuyển trạng thái là việc của
 * shop (`BookingsService`, có kiểm tra `canTransitionBooking` + giữ lịch qua `OccupancyService`
 * — ADR 0006). Mở một đường ghi thứ hai ở đây là mở đường phá vỡ bất biến lịch.
 *
 * SĐT khách luôn trả bản đã che; số đầy đủ đi qua `revealContact` (quyền riêng + audit).
 */
@Injectable()
export class PlatformBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PlatformBookingListQueryDto,
  ): Promise<{ data: PlatformBookingDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_BOOKING_DEFAULT_LIMIT, PLATFORM_BOOKING_MAX_LIMIT);

    const q = query.q?.trim();
    const phone = query.phone?.trim();
    const range =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;
    const dateField =
      query.dateField === BOOKING_DATE_FIELD.PICKUP_AT
        ? BOOKING_DATE_FIELD.PICKUP_AT
        : BOOKING_DATE_FIELD.CREATED_AT;

    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...bookingSourceWhere(query.source, undefined),
      // Tra theo SĐT là khớp CHÍNH XÁC: nhân viên hỗ trợ có sẵn số khách đọc cho, và khớp
      // chính xác thì không lộ được danh sách khách bằng cách dò tiền tố. `customer_phone` lưu
      // cũ có thể còn dạng thô — so mọi biến thể (common/phone).
      ...(phone ? { customerPhone: { in: phoneLookupVariants(phone) } } : {}),
      ...(range ? { [dateField]: range } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { customerName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.page(where, [{ createdAt: 'desc' }, { id: 'desc' }], paging);
  }

  /**
   * Hàng đợi VẬN HÀNH của màn "Vận hành chuyến" — cùng dòng dữ liệu với danh sách tra cứu, khác
   * ở tập và thứ tự: GẤP lên đầu.
   *
   *  - `pickup_soon`: đơn chưa giao xe có giờ nhận trong `TRIP_PICKUP_WINDOW_HOURS` tới — KỂ CẢ
   *    đã quá giờ (xe chưa rời bãi là việc cần gọi, không phải thứ để lọc mất). Xếp theo giờ nhận
   *    tăng dần nên quá giờ tự lên đầu.
   *  - `active`: xe đang ở với khách, xếp theo giờ trả — quá giờ trả lên đầu.
   */
  async listQueue(
    query: PlatformTripBookingListQueryDto,
    now: Date = new Date(),
  ): Promise<{ data: PlatformBookingDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_BOOKING_DEFAULT_LIMIT, PLATFORM_BOOKING_MAX_LIMIT);
    const q = query.q?.trim();
    const pickupSoon = query.queue === PLATFORM_TRIP_QUEUE.PICKUP_SOON;

    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(pickupSoon
        ? {
            status: { in: UPCOMING_STATUSES },
            pickupAt: { lte: new Date(now.getTime() + TRIP_PICKUP_WINDOW_HOURS * HOUR_MS) },
          }
        : { status: BOOKING_STATUS.ACTIVE }),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { customerName: { contains: q, mode: 'insensitive' } },
              { vehicle: { name: { contains: q, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
              { tenant: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return this.page(
      where,
      pickupSoon ? [{ pickupAt: 'asc' }, { id: 'asc' }] : [{ returnAt: 'asc' }, { id: 'asc' }],
      paging,
    );
  }

  private async page(
    where: Prisma.BookingWhereInput,
    orderBy: Prisma.BookingOrderByWithRelationInput[],
    paging: ResolvedPaging,
  ): Promise<{ data: PlatformBookingDto[]; meta: PaginationMeta }> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    // Cong no dung CHUNG cong thuc voi gian hang (common/booking-money.ts): nhan vien nen tang
    // va chu shop nhin mot don phai thay cung mot so, khong thi moi cuoc ho tro bat dau bang
    // viec doi chieu hai con so khac nhau.
    const sides = await loadBookingMoneySides(
      this.prisma,
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((r) => toPlatformBookingItem(r, sides.get(r.id) ?? emptyMoneySides())),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Chi tiết một đơn, kèm khối TIỀN MARKETPLACE (giữ chỗ, bảng phí đóng băng, bảo hiểm, thuế, huỷ).
   *
   * Hai lớp quyền (quyết định 16/11/2026): ai xem được đơn thì thấy dòng tiền và trạng thái - CSKH
   * cần trả lời "khách đã trả bao nhiêu, chủ xe nhận bao nhiêu". Chứng từ ngân hàng (giao dịch đã
   * khớp, mã FT) và tài khoản nhận hoàn chỉ dành cho người có `platform.money.manage`: phần đó bị
   * bỏ ngay ở server, không giấu ở giao diện.
   */
  async getOne(id: string, platform: PlatformContext): Promise<PlatformBookingDetailDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...LIST_SELECT,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
        depositAmount: true,
        actualPickupAt: true,
        actualReturnAt: true,
        note: true,
        updatedAt: true,
        priceSnapshot: true,
        creator: { select: { displayName: true } },
        contract: { select: { id: true } },
        _count: { select: { receipts: true, payments: true } },
        hold: { select: HOLD_SELECT },
        insurancePolicies: {
          select: INSURANCE_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        taxWithholdings: {
          select: TAX_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        cancellation: {
          select: {
            responsibleParty: true,
            reasonCategory: true,
            reason: true,
            stage: true,
            cancelledAt: true,
          },
        },
        supportCases: {
          where: { status: { in: [...SUPPORT_CASE_STATUS_OPEN] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: OPEN_SUPPORT_CASES_LIMIT,
          select: {
            id: true,
            code: true,
            category: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });
    if (!row) throw notFound();

    const canSeeMoneyRecords = platform.permissions.includes(PERMISSION.PLATFORM_MONEY_MANAGE);
    const [sides, bankTransactions] = await Promise.all([
      loadBookingMoneySides(this.prisma, [row.id]),
      canSeeMoneyRecords && row.hold
        ? this.prisma.bankTransaction.findMany({
            where: {
              matchedType: BANK_MATCH_TARGET_TYPE.BOOKING_HOLD,
              matchedRefId: row.hold.id,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              amountIn: true,
              bankTime: true,
              createdAt: true,
              matchStatus: true,
              rawJson: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const snapshot = row.priceSnapshot as unknown as BookingPriceSnapshot | null;

    return {
      ...toPlatformBookingItem(row, sides.get(row.id) ?? emptyMoneySides()),
      baseAmount: row.baseAmount as unknown as string,
      deliveryFee: row.deliveryFee as unknown as string,
      discountAmount: row.discountAmount as unknown as string,
      depositAmount: row.depositAmount as unknown as string,
      actualPickupAt: row.actualPickupAt ? (row.actualPickupAt as Date).toISOString() : null,
      actualReturnAt: row.actualReturnAt ? (row.actualReturnAt as Date).toISOString() : null,
      note: row.note,
      createdByName: row.creator?.displayName ?? null,
      receiptCount: row._count.receipts,
      paymentCount: row._count.payments,
      hasContract: row.contract != null,
      updatedAt: (row.updatedAt as Date).toISOString(),
      marketplace: {
        fees: marketplaceFeesOf(snapshot?.fees, {
          pickupAt: row.pickupAt as Date,
          returnAt: row.returnAt as Date,
        }),
        hold: row.hold ? toHold(row.hold, canSeeMoneyRecords) : null,
        bankTransactions: canSeeMoneyRecords ? bankTransactions.map(toBankTx) : null,
        insurancePolicies: row.insurancePolicies.map(toInsurance),
        taxRows: row.taxWithholdings.map(toTaxRow),
        cancellation: row.cancellation
          ? {
              responsibleParty: row.cancellation.responsibleParty,
              reasonCategory: row.cancellation.reasonCategory,
              reason: row.cancellation.reason,
              stage: row.cancellation.stage,
              cancelledAt: row.cancellation.cancelledAt.toISOString(),
            }
          : null,
      },
      openSupportCases: row.supportCases.map((c) => ({
        id: c.id,
        code: c.code,
        category: c.category,
        status: c.status,
        priority: c.priority,
        createdAt: c.createdAt.toISOString(),
        tripVerdictAvailable: tripVerdictsFor(c.category, row.status as string).length > 0,
      })),
    };
  }

  /**
   * SĐT khách ở dạng đầy đủ. Đây là hành động có hệ quả riêng tư nên ghi `audit_logs` NGAY cả
   * khi không có gì thay đổi trong DB — "ai đã xem số của khách nào, lúc nào" là thứ phải trả
   * lời được (CLAUDE.md §6, lằn ranh 3).
   */
  async revealContact(id: string, actorUserId: string): Promise<BookingContactDto> {
    const row = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true, customerPhone: true },
    });
    if (!row) throw notFound();

    await this.audit.record({
      tenantId: row.tenantId,
      actorUserId,
      actorScope: 'platform',
      action: 'booking.contact_reveal',
      targetType: 'booking',
      targetId: id,
      // KHÔNG ghi chính số điện thoại vào audit: log là nơi nhiều người đọc được hơn, chép PII
      // vào đó là nhân bản đúng thứ vừa siết.
      after: { revealed: 'customerPhone' },
    });

    return { bookingId: row.id, customerPhone: row.customerPhone };
  }
}

type BookingRow = Prisma.BookingGetPayload<{ select: typeof LIST_SELECT }>;
type HoldRow = Prisma.BookingHoldGetPayload<{ select: typeof HOLD_SELECT }>;
type InsuranceRow = Prisma.BookingInsurancePolicyGetPayload<{ select: typeof INSURANCE_SELECT }>;
type TaxRow = Prisma.TaxWithholdingGetPayload<{ select: typeof TAX_SELECT }>;

function money(value: Prisma.Decimal): string {
  return value.toFixed(0);
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toHold(h: HoldRow, canSeeMoneyRecords: boolean): PlatformBookingHoldDto {
  const r = h.refund;
  return {
    id: h.id,
    code: h.code,
    status: h.status,
    outcome: h.outcome,
    amount: money(h.amount),
    paidAmount: money(h.paidAmount),
    expiresAt: h.expiresAt.toISOString(),
    paidAt: isoOrNull(h.paidAt),
    freeCancelUntil: isoOrNull(h.freeCancelUntil),
    releasedAt: isoOrNull(h.releasedAt),
    // Năm phần đã chốt chỉ có nghĩa khi kết cục đã chốt - trước đó chúng là 0 mặc định của cột.
    settlement: h.outcome
      ? {
          customerAmount: money(h.settledCustomerAmount),
          ownerAmount: money(h.settledOwnerAmount),
          platformAmount: money(h.settledPlatformAmount),
          insurerAmount: money(h.settledInsurerAmount),
          taxAmount: money(h.settledTaxAmount),
        }
      : null,
    refund: r
      ? {
          status: r.status,
          amount: money(r.amount),
          reason: r.reason,
          settlementMode: r.settlementMode,
          paidAt: isoOrNull(r.paidAt),
          bankReference: canSeeMoneyRecords ? r.bankReference : null,
          bankCode: canSeeMoneyRecords ? r.bankCode : null,
          bankAccountNumber: canSeeMoneyRecords ? r.bankAccountNumber : null,
          bankAccountName: canSeeMoneyRecords ? r.bankAccountName : null,
        }
      : null,
  };
}

function toBankTx(t: {
  id: string;
  amountIn: Prisma.Decimal;
  bankTime: Date | null;
  createdAt: Date;
  matchStatus: string;
  rawJson: Prisma.JsonValue;
}): PlatformBookingBankTxDto {
  const raw =
    t.rawJson && typeof t.rawJson === 'object' && !Array.isArray(t.rawJson)
      ? (t.rawJson as Record<string, unknown>)
      : {};
  return {
    id: t.id,
    amountIn: money(t.amountIn),
    bankTime: isoOrNull(t.bankTime),
    createdAt: t.createdAt.toISOString(),
    matchStatus: t.matchStatus,
    bankReferenceNumber: typeof raw.referenceCode === 'string' ? raw.referenceCode : null,
  };
}

function toInsurance(p: InsuranceRow): PlatformBookingInsuranceDto {
  return {
    id: p.id,
    productKind: p.productKind,
    status: p.status,
    premiumAmount: money(p.premiumAmount),
    partnerName: p.partnerName,
    certificateNumber: p.certificateNumber,
    isTest: p.isTest,
    issuedAt: isoOrNull(p.issuedAt),
    // Cùng điều kiện với `InsuranceCertificateService.pdf` - nút tải không bao giờ dẫn tới 404.
    certificateDownloadable:
      p.partnerPolicyId != null &&
      (CERTIFICATE_DOWNLOADABLE_STATUSES as readonly string[]).includes(p.status),
  };
}

function toTaxRow(r: TaxRow): PlatformBookingTaxRowDto {
  return {
    id: r.id,
    periodKey: r.periodKey,
    status: r.status,
    amount: money(r.amount),
    vatAmount: r.vatAmount ? money(r.vatAmount) : null,
    pitAmount: r.pitAmount ? money(r.pitAmount) : null,
    isReversal: r.reversalOfId != null,
    isExtension: r.bookingExtensionId != null,
  };
}

/** Dòng đơn chuẩn của mọi danh sách đơn phía nền tảng - công nợ cùng công thức với gian hàng. */
export function toPlatformBookingItem(b: BookingRow, sides: BookingMoneySides): PlatformBookingDto {
  const money = bookingMoney({ totalAmount: b.totalAmount, paidAmount: b.paidAmount, ...sides });
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    serviceType: b.serviceType,
    source: b.source,
    sourceLabel: b.sourceLabel,
    customerName: b.customerName,
    customerPhoneMasked: maskPhone(b.customerPhone),
    pickupAt: (b.pickupAt as Date).toISOString(),
    returnAt: (b.returnAt as Date).toISOString(),
    totalAmount: money.amountDue.toString(),
    paidAmount: money.collectedAmount.toString(),
    debtAmount: money.debtAmount.toString(),
    tenantId: b.tenantId,
    tenantName: b.tenant.name,
    tenantStatus: b.tenant.status,
    vehicleId: b.vehicleId,
    vehicleName: b.vehicle.name,
    vehiclePlateNumber: b.vehicle.plateNumber,
    createdAt: (b.createdAt as Date).toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy đơn thuê',
  });
}
