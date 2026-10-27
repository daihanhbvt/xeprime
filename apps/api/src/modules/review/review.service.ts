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
import { maskName } from '../../common/mask';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ListingsService } from '../public-listings/listings.service';
import {
  CreateReviewDto,
  OwnReviewDto,
  UpdateReviewDto,
  FEATURED_REVIEW_DEFAULT_LIMIT,
  FEATURED_REVIEW_MAX_LIMIT,
  FeaturedReviewDto,
  FeaturedReviewQueryDto,
  REVIEW_DEFAULT_LIMIT,
  REVIEW_MAX_LIMIT,
  ReviewDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
  ShopReviewDto,
} from './dto/review.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { canEditReview } from './review-edit';

/** Đánh giá nổi bật phải từ 4 sao — khối này trích lời khen, không phải mọi lời nhận xét. */
const FEATURED_REVIEW_MIN_RATING = 4;
/** Lời nhận xét ngắn hơn ("ok", "tốt") không có gì để trích dẫn. */
const FEATURED_REVIEW_MIN_COMMENT_LENGTH = 20;
/** Bội số lấy dư trước khi lọc độ dài — trần cứng cho tập ứng viên. */
const FEATURED_REVIEW_OVERFETCH = 4;
/** Mỗi gian hàng góp tối đa từng ấy lời khen — một gian hàng nhiều đánh giá không chiếm cả băng chuyền. */
const FEATURED_REVIEW_PER_TENANT = 2;

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

  /**
   * Khách sửa đánh giá CỦA MÌNH — đúng MỘT lần. Đánh giá của người khác trả 404 (không lộ tồn
   * tại). "Một lần" chốt nguyên tử bằng `updateMany … editedAt: null`: hai lượt song song chỉ
   * một lượt đếm được 1, lượt kia nhận 409 `REVIEW_EDIT_LIMIT`. Cùng transaction tính lại rating
   * gian hàng + rating trên `public_listings` như lúc tạo.
   */
  async updateOwn(customerUserId: string, id: string, dto: UpdateReviewDto): Promise<OwnReviewDto> {
    const review = await this.prisma.review.findFirst({
      where: { id, customerId: customerUserId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        vehicleId: true,
        status: true,
        editedAt: true,
        booking: { select: { status: true } },
      },
    });
    if (!review) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đánh giá của bạn',
      });
    }
    if (review.editedAt) {
      throw new ConflictException({
        code: API_ERROR_CODE.REVIEW_EDIT_LIMIT,
        message: 'Bạn đã dùng lượt chỉnh sửa đánh giá duy nhất',
      });
    }
    if (!review.booking || !canEditReview(review.booking.status, review)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Đánh giá này không thể chỉnh sửa',
      });
    }

    const editedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.updateMany({
        where: {
          id,
          customerId: customerUserId,
          editedAt: null,
          status: REVIEW_STATUS.PUBLISHED,
          deletedAt: null,
          booking: { status: BOOKING_STATUS.COMPLETED },
        },
        data: { rating: dto.rating, comment: dto.comment?.trim() || null, editedAt },
      });
      if (count === 0) {
        // Đã kiểm tồn tại/sở hữu ở trên ⇒ thua cuộc đua với một lượt sửa khác.
        throw new ConflictException({
          code: API_ERROR_CODE.REVIEW_EDIT_LIMIT,
          message: 'Bạn đã dùng lượt chỉnh sửa đánh giá duy nhất',
        });
      }
      await this.recomputeTenantRating(tx, review.tenantId);
      await this.listings.refreshRating(review.vehicleId, tx);

      const updated = await tx.review.findUniqueOrThrow({
        where: { id },
        select: { id: true, rating: true, comment: true, createdAt: true, editedAt: true },
      });
      return {
        id: updated.id,
        rating: updated.rating,
        comment: updated.comment,
        createdAt: updated.createdAt.toISOString(),
        editedAt: updated.editedAt?.toISOString() ?? null,
        canEdit: false,
      };
    });
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
   * Đánh giá NỔI BẬT toàn sàn — "Khách hàng nói gì về Xe Prime" ở trang chủ.
   *
   * Luật chọn (không ai được "chọn tay" lời khen để đăng):
   *   · review `published`, chưa xoá; gian hàng đang hoạt động và xe chưa xoá — cùng điều kiện
   *     với trang gian hàng, nên không trích một đánh giá dẫn về trang 404;
   *   · từ `FEATURED_REVIEW_MIN_RATING` sao trở lên và có lời nhận xét đủ dài để trích
   *     (`FEATURED_REVIEW_MIN_COMMENT_LENGTH` ký tự sau khi cắt khoảng trắng);
   *   · mới nhất trước — index `(status, created_at DESC)` phục vụ đúng câu này;
   *   · mỗi gian hàng tối đa `FEATURED_REVIEW_PER_TENANT` lời — "khách hàng nói gì về XePrime"
   *     là tiếng nói của CẢ chợ, không phải trang quảng cáo của một gian hàng.
   *
   * Độ dài lời nhận xét không lọc được trong Prisma, nên lấy dư một bội số CÓ TRẦN rồi lọc ở Node
   * — tập ứng viên không bao giờ quá `limit × FEATURED_REVIEW_OVERFETCH` dòng.
   *
   * "Đã thuê N lần" đếm chuyến ĐÃ HOÀN THÀNH của người viết qua yêu cầu thuê của TÀI KHOẢN đó —
   * một phép gộp cho cả trang, không N+1.
   */
  async listFeatured(query: FeaturedReviewQueryDto): Promise<FeaturedReviewDto[]> {
    const limit = Math.min(
      FEATURED_REVIEW_MAX_LIMIT,
      Math.max(1, query.limit ?? FEATURED_REVIEW_DEFAULT_LIMIT),
    );

    const candidates = await this.prisma.review.findMany({
      where: {
        status: REVIEW_STATUS.PUBLISHED,
        deletedAt: null,
        rating: { gte: FEATURED_REVIEW_MIN_RATING },
        comment: { not: null },
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
        vehicle: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * FEATURED_REVIEW_OVERFETCH,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customerId: true,
        tenantId: true,
        customer: { select: { displayName: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });

    const perTenant = new Map<string, number>();
    const picked = candidates
      .map((r) => ({ ...r, comment: r.comment?.trim() ?? '' }))
      .filter((r) => {
        if (r.comment.length < FEATURED_REVIEW_MIN_COMMENT_LENGTH) return false;
        const taken = perTenant.get(r.tenantId) ?? 0;
        if (taken >= FEATURED_REVIEW_PER_TENANT) return false;
        perTenant.set(r.tenantId, taken + 1);
        return true;
      })
      .slice(0, limit);
    if (picked.length === 0) return [];

    const customerIds = [...new Set(picked.map((r) => r.customerId))];
    const trips = await this.prisma.bookingRequest.groupBy({
      by: ['customerUserId'],
      where: {
        customerUserId: { in: customerIds },
        booking: { status: BOOKING_STATUS.COMPLETED, deletedAt: null },
      },
      _count: { _all: true },
    });
    const tripsBy = new Map(trips.map((t) => [t.customerUserId, t._count._all]));

    return picked.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: maskName(r.customer.displayName),
      customerTripCount: tripsBy.get(r.customerId) ?? 0,
      vehicleId: r.vehicle.id,
      vehicleName: r.vehicle.name,
      createdAt: r.createdAt as unknown as string,
    }));
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
