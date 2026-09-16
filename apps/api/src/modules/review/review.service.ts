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
  TENANT_STATUS,
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
  REVIEW_DEFAULT_LIMIT,
  REVIEW_MAX_LIMIT,
  ReviewDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
  ShopReviewDto,
} from './dto/review.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const PUBLIC_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  customer: { select: { displayName: true } },
} satisfies Prisma.ReviewSelect;

/** Như `PUBLIC_SELECT` + chiếc xe đã thuê — chỉ trang gian hàng cần biết đánh giá thuộc xe nào. */
const SHOP_PUBLIC_SELECT = {
  ...PUBLIC_SELECT,
  vehicle: { select: { id: true, name: true } },
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
    const paging = resolvePaging(query, REVIEW_DEFAULT_LIMIT, REVIEW_MAX_LIMIT);

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
        skip: paging.skip,
        take: paging.take,
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
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Đánh giá công khai của MỘT GIAN HÀNG theo slug — gộp mọi xe của họ, mới nhất trước.
   *
   * ## Vì sao không đọc `tenants.rating_avg` cho phần `summary`
   *
   * Hai cột đó là số liệu dẫn xuất tính trên TOÀN BỘ review published của tenant, kể cả review
   * của những chiếc xe đã gỡ khỏi chợ. Ở đây `summary` phải mô tả đúng danh sách ngay bên dưới
   * nó, nên nó được tính từ chính `where` của danh sách — nếu không, "4.9 (156 đánh giá)" sẽ
   * đứng trên một danh sách 140 mục và không ai giải thích được 16 cái còn lại ở đâu.
   *
   * Gian hàng không tồn tại / đã khoá ⇒ trang rỗng chứ không 404: trang `/shops/[slug]` đã 404
   * từ `getShopBySlug` trước khi phần này kịp gọi, và một 404 thứ hai chỉ làm hỏng một khối
   * trên trang vì lý do mà cả trang đã xử lý rồi.
   */
  async listForShop(
    slug: string,
    query: ReviewListQueryDto,
  ): Promise<{ summary: ReviewSummaryDto; data: ShopReviewDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, REVIEW_DEFAULT_LIMIT, REVIEW_MAX_LIMIT);

    const where: Prisma.ReviewWhereInput = {
      status: REVIEW_STATUS.PUBLISHED,
      deletedAt: null,
      tenant: { slug, status: TENANT_STATUS.ACTIVE, deletedAt: null },
      // Đánh giá của một chiếc xe đã xoá mềm không còn chỗ nào để dẫn tới — thẻ đánh giá trên
      // trang gian hàng là một liên kết về trang xe.
      vehicle: { deletedAt: null },
    };

    const [total, rows, agg] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: SHOP_PUBLIC_SELECT,
      }),
      this.prisma.review.aggregate({ where, _avg: { rating: true }, _count: true }),
    ]);

    return {
      summary: {
        ratingAvg: round1(Number(agg._avg.rating ?? 0)),
        ratingCount: agg._count,
      },
      data: rows.map((r) => ({
        ...toPublicDto(r),
        vehicleId: r.vehicle.id,
        vehicleName: r.vehicle.name,
      })),
      meta: paginationMeta(paging, total),
    };
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
