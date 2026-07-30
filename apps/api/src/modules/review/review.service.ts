import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  REVIEW_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ListingsService } from '../public-listings/listings.service';
import {
  CreateReviewDto,
  MyTripDto,
  REVIEW_DEFAULT_LIMIT,
  REVIEW_MAX_LIMIT,
  ReviewDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
} from './dto/review.dto';

const PUBLIC_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  customer: { select: { displayName: true } },
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly listings: ListingsService,
  ) {}

  /**
   * Khách đánh giá một đơn đã hoàn thành CỦA MÌNH. Quyền sở hữu chứng minh qua yêu cầu gốc
   * (`booking_request.customer_user_id === khách`). Một đơn một review — chốt bằng unique
   * `booking_id` ở DB (app-check chỉ để báo lỗi thân thiện, constraint mới là chặn thật).
   * Tạo review + cập nhật rating gian hàng + báo shop trong CÙNG transaction.
   */
  async createForBooking(customerUserId: string, dto: CreateReviewDto): Promise<{ id: string }> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: dto.bookingId, deletedAt: null, bookingRequest: { customerUserId } },
      select: {
        id: true,
        status: true,
        tenantId: true,
        vehicleId: true,
        vehicle: { select: { name: true } },
        review: { select: { id: true } },
        bookingRequest: { select: { id: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy chuyến thuê của bạn',
      });
    }
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chỉ có thể đánh giá sau khi chuyến thuê hoàn thành',
      });
    }
    if (booking.review) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Bạn đã đánh giá chuyến thuê này',
      });
    }

    const id = newId();
    await this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          id,
          tenantId: booking.tenantId,
          vehicleId: booking.vehicleId,
          bookingId: booking.id,
          bookingRequestId: booking.bookingRequest?.id ?? null,
          customerId: customerUserId,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
          status: REVIEW_STATUS.PUBLISHED,
        },
      });

      await this.recomputeTenantRating(tx, booking.tenantId);
      // Rating denormalize trên public_listings (nuôi sort "Gợi ý") — ghi qua ListingsService
      // (ADR 0008). Flow ẩn/duyệt review tương lai PHẢI gọi cả 2 hàm recompute này.
      await this.listings.refreshRating(booking.vehicleId, tx);

      await this.notifications.emitToTenantMembers(
        booking.tenantId,
        {
          type: NOTIFICATION_TYPE.REVIEW_RECEIVED,
          title: `Đánh giá mới ${dto.rating}★`,
          body: booking.vehicle.name,
          targetType: NOTIFICATION_TARGET_TYPE.REVIEW,
          targetId: id,
        },
        tx,
      );
    });

    return { id };
  }

  /** Đánh giá công khai của một xe — chỉ `published`, kèm điểm trung bình gian hàng của xe đó. */
  async listForVehicle(
    vehicleId: string,
    query: ReviewListQueryDto,
  ): Promise<{ summary: ReviewSummaryDto; data: ReviewDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(REVIEW_MAX_LIMIT, Math.max(1, query.limit ?? REVIEW_DEFAULT_LIMIT));

    const where: Prisma.ReviewWhereInput = {
      vehicleId,
      status: REVIEW_STATUS.PUBLISHED,
      deletedAt: null,
    };

    const [total, rows, agg] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_SELECT,
      }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      summary: {
        ratingAvg: round1(Number(agg._avg.rating ?? 0)),
        ratingCount: agg._count,
      },
      data: rows.map(toPublicDto),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /**
   * Các chuyến của khách (đơn thuê đến từ yêu cầu của họ) + trạng thái đánh giá. Là dữ liệu cho
   * màn "Đơn thuê của tôi": khách thấy chuyến nào đã xong và đánh giá được.
   */
  async myTrips(
    customerUserId: string,
    query: ReviewListQueryDto,
  ): Promise<{ data: MyTripDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(REVIEW_MAX_LIMIT, Math.max(1, query.limit ?? REVIEW_DEFAULT_LIMIT));

    const where: Prisma.BookingRequestWhereInput = {
      customerUserId,
      bookingId: { not: null },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          booking: {
            select: {
              id: true,
              code: true,
              status: true,
              pickupAt: true,
              returnAt: true,
              vehicleId: true,
              vehicle: { select: { name: true } },
              tenant: { select: { name: true } },
              review: {
                select: { id: true, rating: true, comment: true, createdAt: true },
              },
            },
          },
        },
      }),
    ]);

    const data = rows
      .map((r) => r.booking)
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map((b) => ({
        bookingId: b.id,
        code: b.code,
        vehicleId: b.vehicleId,
        vehicleName: b.vehicle.name,
        shopName: b.tenant.name,
        status: b.status,
        pickupAt: b.pickupAt.toISOString(),
        returnAt: b.returnAt.toISOString(),
        canReview: b.status === BOOKING_STATUS.COMPLETED && b.review === null,
        review: b.review
          ? {
              id: b.review.id,
              rating: b.review.rating,
              comment: b.review.comment,
              createdAt: b.review.createdAt.toISOString(),
            }
          : null,
      }));

    return { data, meta: { page, limit, total, hasNext: page * limit < total } };
  }

  /**
   * Tính lại rating_avg/rating_count của gian hàng từ toàn bộ review `published`. Một writer duy
   * nhất cho số liệu dẫn xuất (ReviewService) — không nơi nào khác chạm hai cột này.
   */
  private async recomputeTenantRating(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { tenantId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
      _avg: { rating: true },
      _count: true,
    });
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        ratingAvg: new Prisma.Decimal(round2(Number(agg._avg.rating ?? 0))),
        ratingCount: agg._count,
      },
    });
  }
}

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_SELECT }>;

function toPublicDto(r: ReviewRow): ReviewDto {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    customerName: maskName(r.customer.displayName),
    createdAt: r.createdAt as unknown as string,
  };
}

/** Ẩn bớt tên khách khi hiển thị công khai: "Nguyễn Văn An" → "Nguyễn Văn A.". */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Khách';
  if (parts.length === 1) return parts[0] ?? 'Khách';
  const last = parts[parts.length - 1] ?? '';
  const head = parts.slice(0, -1).join(' ');
  return `${head} ${last.charAt(0)}.`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
