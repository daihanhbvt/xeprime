import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  MARKET_PRICE_BASIS,
  MARKET_PRICE_MIN_SAMPLE,
  baselinePriceBand,
  carSeatBucketOf,
  roundPriceBand,
  type MarketPriceBand,
  type MarketPriceBasis,
} from '@xeprime/domain';
import { SEAT_BUCKET_RANGE, VEHICLE_TYPE, type SeatBucket } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { stableCacheKey, TtlCache } from '../../common/ttl-cache';
import { publicListingScope } from './listing-filter';
import type { MarketPriceQueryDto, MarketPriceSuggestionDto } from './dto/market-price.dto';

/**
 * Khoảng giá tham khảo theo phân vị của những xe ĐANG cho thuê cùng phân khúc.
 *
 * Vì sao phân vị chứ không phải trung bình: giá thuê là phân phối lệch phải — một chiếc Land
 * Cruiser trong nhóm SUV kéo trung bình lên trên mức mà không xe nào trong nhóm đang treo. Trung
 * vị và tứ phân vị nói đúng "phần lớn xe như xe của bạn đang ở quanh đây", còn trung bình thì nói
 * về một chiếc xe không tồn tại.
 *
 * **Thang nới dần**: cùng phân khúc + cùng tỉnh → cùng phân khúc toàn quốc → cùng loại phương
 * tiện toàn quốc → bảng khởi điểm ở `@xeprime/domain`. Mỗi bậc chỉ được nhận khi đủ
 * `MARKET_PRICE_MIN_SAMPLE` xe; dưới ngưỡng đó thì con số chỉ đang nhắc lại giá của một hai chiếc
 * xe lẻ. `basis` đi kèm kết quả để giao diện nói đúng mình đang dựa vào đâu — một khoảng giá
 * không nói rõ nguồn thì người đọc mặc định nó là số liệu thị trường.
 *
 * Phạm vi đọc là `publicListingScope()` — ĐÚNG bộ điều kiện mà trang chợ đang dùng. Viết lại một
 * bộ điều kiện thứ hai ở đây nghĩa là giá tham khảo có thể tính trên những xe mà không khách nào
 * nhìn thấy (gian hàng bị khoá, tỉnh đang ẩn).
 */
@Injectable()
export class MarketPriceService {
  /**
   * Cache công khai: đầu vào chỉ có phân khúc + tỉnh, kết quả không phụ thuộc người dùng. TTL 5
   * phút vì mặt bằng giá của một phân khúc không đổi theo phút, còn mỗi lượt miss là bốn query.
   */
  private readonly cache = new TtlCache<MarketPriceSuggestionDto>({
    ttlMs: 5 * 60 * 1000,
    maxEntries: 500,
  });

  constructor(private readonly prisma: PrismaService) {}

  async suggest(query: MarketPriceQueryDto): Promise<MarketPriceSuggestionDto> {
    return this.cache.wrap(stableCacheKey({ ...query }), () => this.compute(query));
  }

  private async compute(query: MarketPriceQueryDto): Promise<MarketPriceSuggestionDto> {
    const segment = this.segmentWhere(query);

    /*
     * Thứ tự này là thang nới dần, và nó dừng ở bậc ĐẦU TIÊN đủ mẫu. Bậc hẹp nhất bị bỏ qua khi
     * không có chiều nào để hẹp (xe chưa khai kiểu dáng/phân khúc, hoặc chưa chọn chi nhánh) —
     * lúc đó nó trùng hệt bậc sau, và chạy lại cùng một query là phí một lượt đi DB.
     */
    const hasSegment = Object.keys(segment).length > 0;
    const ladder: Array<{ basis: MarketPriceBasis; where: Prisma.PublicListingWhereInput }> = [];
    if (hasSegment && query.provinceCode) {
      ladder.push({
        basis: MARKET_PRICE_BASIS.PROVINCE_SEGMENT,
        where: { ...segment, provinceCode: query.provinceCode },
      });
    }
    if (hasSegment) ladder.push({ basis: MARKET_PRICE_BASIS.SEGMENT, where: segment });
    ladder.push({ basis: MARKET_PRICE_BASIS.VEHICLE_TYPE, where: {} });

    for (const step of ladder) {
      const found = await this.bandFor(query.vehicleType, step.where);
      if (found) return toDto(found.band, step.basis, found.sampleSize);
    }

    const baseline = baselinePriceBand({
      vehicleType: query.vehicleType,
      bodyType: query.bodyType ?? null,
      seatCount: query.seatCount ?? null,
      motorbikeCategory: query.motorbikeCategory ?? null,
    });
    return toDto(baseline, MARKET_PRICE_BASIS.BASELINE, 0);
  }

  /** Chiều so sánh của mỗi loại xe — ô tô theo kiểu dáng (hoặc số chỗ), xe máy theo phân khúc. */
  private segmentWhere(query: MarketPriceQueryDto): Prisma.PublicListingWhereInput {
    if (query.vehicleType === VEHICLE_TYPE.MOTORBIKE) {
      return query.motorbikeCategory ? { motorbikeCategory: query.motorbikeCategory } : {};
    }
    if (query.bodyType) return { bodyType: query.bodyType };

    // Chưa khai kiểu dáng thì số chỗ là chiều gần đúng nhất — cùng thang nhóm với bộ lọc chợ, nên
    // "xe 7 chỗ" ở đây và "7 chỗ" trong bộ lọc nói về đúng một nhóm xe.
    const bucket = carSeatBucketOf(query.seatCount);
    if (!bucket) return {};
    const range = SEAT_BUCKET_RANGE[bucket as SeatBucket];
    return {
      seatCount: {
        ...(range.min != null ? { gte: range.min } : {}),
        ...(range.max != null ? { lte: range.max } : {}),
      },
    };
  }

  /**
   * Ba phân vị bằng ba lượt đọc theo VỊ TRÍ trên danh sách đã sắp — không kéo cả tập giá về app.
   *
   * `percentile_cont` của Postgres làm việc này trong một câu, nhưng câu đó phải viết lại toàn bộ
   * `publicListingScope()` (có join sang `tenants` và `provinces`) bằng SQL thô — tức là nhân đôi
   * đúng cái ranh giới an toàn mà `listing-filter.ts` đã cảnh báo là không được để lệch. Bốn query
   * dùng lại nguyên bộ điều kiện Prisma là cái giá rẻ hơn, và kết quả còn được cache 5 phút.
   *
   * `null` = chưa đủ mẫu ở bậc này, nơi gọi đi tiếp xuống bậc rộng hơn.
   */
  private async bandFor(
    vehicleType: string,
    segment: Prisma.PublicListingWhereInput,
  ): Promise<{ band: MarketPriceBand; sampleSize: number } | null> {
    const where: Prisma.PublicListingWhereInput = {
      ...publicListingScope(),
      ...segment,
      vehicleType,
      weekdayPrice: { gt: 0 },
    };

    const sampleSize = await this.prisma.publicListing.count({ where });
    if (sampleSize < MARKET_PRICE_MIN_SAMPLE) return null;

    // Chỉ số của phân vị trên dãy đã sắp tăng dần; `n - 1` để phân vị 1.0 rơi vào phần tử cuối.
    const at = (ratio: number) => Math.floor(ratio * (sampleSize - 1));
    const [low, median, high] = await Promise.all([
      this.priceAt(where, at(0.25)),
      this.priceAt(where, at(0.5)),
      this.priceAt(where, at(0.75)),
    ]);
    if (low == null || median == null || high == null) return null;

    return { band: { low, median, high }, sampleSize };
  }

  private async priceAt(
    where: Prisma.PublicListingWhereInput,
    index: number,
  ): Promise<number | null> {
    const row = await this.prisma.publicListing.findFirst({
      where,
      // `id` là tie-break: không có nó thì hai xe cùng giá có thứ tự tuỳ ý giữa các lượt đọc, và
      // ba phân vị có thể rơi vào ba lần sắp khác nhau.
      orderBy: [{ weekdayPrice: 'asc' }, { id: 'asc' }],
      skip: index,
      select: { weekdayPrice: true },
    });
    return row?.weekdayPrice == null ? null : Number(row.weekdayPrice);
  }
}

/** Tiền ra JSON luôn là chuỗi (ADR 0007) — kể cả khi nguồn của nó là một phép tính trong app. */
function toDto(
  band: MarketPriceBand,
  basis: MarketPriceBasis,
  sampleSize: number,
): MarketPriceSuggestionDto {
  const rounded = roundPriceBand(band);
  return {
    low: String(rounded.low),
    median: String(rounded.median),
    high: String(rounded.high),
    basis,
    sampleSize,
  };
}
