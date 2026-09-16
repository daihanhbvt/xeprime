/**
 * GIÁ THUÊ THAM KHẢO cho chủ xe đang đặt giá lần đầu.
 *
 * Câu hỏi mà mọi chủ xe mới hỏi ở ô "Giá thuê mỗi ngày" là "bao nhiêu thì đúng?". Bỏ trống ô đó
 * cho họ tự đoán là cách chắc chắn để có xe treo giá gấp đôi thị trường (không ai thuê) hoặc rẻ
 * một nửa (họ lỗ, và mặt bằng giá của cả chợ bị kéo xuống).
 *
 * Nguồn số ƯU TIÊN là chính chợ: phân vị giá của những xe ĐANG cho thuê cùng phân khúc, cùng
 * tỉnh — backend tính, không phải bảng dưới đây. Bảng dưới đây là **mức khởi điểm**, chỉ dùng khi
 * chưa đủ xe tương tự để một con số thật có nghĩa (xem `MARKET_PRICE_MIN_SAMPLE`), và giao diện
 * phải nói rõ đó là mức khởi điểm chứ không phải số liệu thị trường.
 *
 * Vì sao nằm ở `@xeprime/domain`: nó là chính sách sản phẩm dùng chung (app native có cùng màn
 * đăng xe), và nó phải chạy được ở chỗ không có React lẫn Prisma.
 *
 * ⚠️ Bảng khởi điểm là dữ liệu THỊ TRƯỜNG, nó cũ đi. `BASELINE_REVIEWED_ON` là mốc rà gần nhất;
 * khi chợ đã đủ dày thì đường đi đúng là để dữ liệu thật thay nó, không phải sửa số ở đây mãi.
 */
import { BODY_TYPE, MOTORBIKE_CATEGORY, SEAT_BUCKET, VEHICLE_TYPE } from '@xeprime/types';

/** Mốc rà bảng khởi điểm gần nhất (mặt bằng thuê xe tự lái phổ thông tại Việt Nam). */
export const BASELINE_REVIEWED_ON = '2026-09-14';

/**
 * Số xe tương tự tối thiểu để một phân vị được coi là "giá thị trường".
 *
 * Dưới ngưỡng này thì trung vị chỉ đang nhắc lại giá của một hai chiếc xe lẻ — nói nó ra như một
 * mặt bằng là bịa ra sự đồng thuận không tồn tại, và chủ xe thứ ba sẽ copy đúng con số đó.
 */
export const MARKET_PRICE_MIN_SAMPLE = 5;

/** Bước làm tròn khi hiển thị. Giá thuê ngoài đời đi theo chục nghìn, không phải 743.219đ. */
export const MARKET_PRICE_ROUND_STEP = 10_000;

/**
 * Tập dữ liệu đứng sau một gợi ý — giao diện PHẢI nói ra, vì bốn mức này khác nhau về độ tin cậy.
 */
export const MARKET_PRICE_BASIS = {
  /** Cùng phân khúc, cùng tỉnh — mức sát nhất với thứ khách đang so sánh. */
  PROVINCE_SEGMENT: 'province_segment',
  /** Cùng phân khúc, toàn quốc. */
  SEGMENT: 'segment',
  /** Cùng loại phương tiện, toàn quốc — đã rất rộng, chỉ để có một mốc còn hơn không. */
  VEHICLE_TYPE: 'vehicle_type',
  /** Không đủ dữ liệu thật: bảng khởi điểm dưới đây. */
  BASELINE: 'baseline',
} as const;

export type MarketPriceBasis = (typeof MARKET_PRICE_BASIS)[keyof typeof MARKET_PRICE_BASIS];

/** Khoảng giá gợi ý — đơn vị VND/ngày, số nguyên đã làm tròn. */
export interface MarketPriceBand {
  /** Mức thấp: rẻ hơn 3/4 xe cùng phân khúc. */
  low: number;
  /** Mức giữa — con số đề xuất khi chủ xe bấm "dùng giá này". */
  median: number;
  /** Mức cao. */
  high: number;
}

/** Phân khúc dùng để so giá — một chiều duy nhất cho mỗi loại phương tiện. */
export interface MarketPriceSegment {
  vehicleType: string;
  /** Ô tô: kiểu dáng thân xe (`BODY_TYPE`). */
  bodyType?: string | null;
  /** Ô tô: dùng khi chưa khai kiểu dáng — số chỗ nói gần đủ về phân khúc. */
  seatCount?: number | null;
  /** Xe máy: phân khúc (`MOTORBIKE_CATEGORY`). */
  motorbikeCategory?: string | null;
}

/** Ô tô tự lái — theo KIỂU DÁNG, chiều mà khách thật sự so sánh khi chọn xe. */
const CAR_BASELINE_BY_BODY_TYPE: Readonly<Record<string, MarketPriceBand>> = {
  [BODY_TYPE.MINI]: { low: 450_000, median: 550_000, high: 700_000 },
  [BODY_TYPE.SEDAN]: { low: 600_000, median: 750_000, high: 900_000 },
  [BODY_TYPE.CUV]: { low: 700_000, median: 850_000, high: 1_050_000 },
  [BODY_TYPE.SUV]: { low: 850_000, median: 1_050_000, high: 1_400_000 },
  [BODY_TYPE.MPV]: { low: 750_000, median: 900_000, high: 1_150_000 },
  [BODY_TYPE.PICKUP]: { low: 800_000, median: 950_000, high: 1_200_000 },
  [BODY_TYPE.VAN]: { low: 900_000, median: 1_100_000, high: 1_400_000 },
  [BODY_TYPE.MINIBUS]: { low: 1_400_000, median: 1_800_000, high: 2_400_000 },
  [BODY_TYPE.CARGO]: { low: 900_000, median: 1_200_000, high: 1_600_000 },
};

/** Ô tô chưa khai kiểu dáng — rơi về số chỗ. Cùng thang nhóm với bộ lọc chợ (`SEAT_BUCKET`). */
const CAR_BASELINE_BY_SEAT_BUCKET: Readonly<Record<string, MarketPriceBand>> = {
  [SEAT_BUCKET.S4]: { low: 500_000, median: 600_000, high: 750_000 },
  [SEAT_BUCKET.S5]: { low: 650_000, median: 800_000, high: 1_000_000 },
  [SEAT_BUCKET.S7]: { low: 800_000, median: 950_000, high: 1_200_000 },
  [SEAT_BUCKET.S8_PLUS]: { low: 1_200_000, median: 1_600_000, high: 2_200_000 },
};

/** Ô tô không khai gì cả — vẫn phải trả về một khoảng đọc được, không phải `null`. */
const CAR_BASELINE_FALLBACK: MarketPriceBand = { low: 600_000, median: 800_000, high: 1_000_000 };

/** Xe máy — khoảng cách giữa xe số và mô tô phân khối lớn là hàng chục lần, không gộp được. */
const MOTORBIKE_BASELINE: Readonly<Record<string, MarketPriceBand>> = {
  [MOTORBIKE_CATEGORY.UNDERBONE]: { low: 100_000, median: 130_000, high: 160_000 },
  [MOTORBIKE_CATEGORY.SCOOTER]: { low: 120_000, median: 150_000, high: 200_000 },
  [MOTORBIKE_CATEGORY.NAKED]: { low: 250_000, median: 350_000, high: 500_000 },
  [MOTORBIKE_CATEGORY.SPORT]: { low: 250_000, median: 350_000, high: 500_000 },
  [MOTORBIKE_CATEGORY.CRUISER]: { low: 400_000, median: 600_000, high: 900_000 },
  [MOTORBIKE_CATEGORY.ADVENTURE]: { low: 500_000, median: 700_000, high: 1_000_000 },
  [MOTORBIKE_CATEGORY.TOURING]: { low: 600_000, median: 900_000, high: 1_300_000 },
  [MOTORBIKE_CATEGORY.OFFROAD]: { low: 400_000, median: 600_000, high: 900_000 },
  [MOTORBIKE_CATEGORY.OTHER]: { low: 150_000, median: 200_000, high: 300_000 },
};

const MOTORBIKE_BASELINE_FALLBACK: MarketPriceBand = {
  low: 120_000,
  median: 150_000,
  high: 200_000,
};

/**
 * Nhóm số chỗ của một chiếc ô tô — cùng thang với bộ lọc "số chỗ" ngoài chợ, để mức khởi điểm và
 * cái khách đang lọc nói về đúng một nhóm xe.
 */
export function carSeatBucketOf(seatCount: number | null | undefined): string | null {
  if (seatCount == null || !Number.isFinite(seatCount)) return null;
  if (seatCount <= 4) return SEAT_BUCKET.S4;
  if (seatCount <= 6) return SEAT_BUCKET.S5;
  if (seatCount === 7) return SEAT_BUCKET.S7;
  return SEAT_BUCKET.S8_PLUS;
}

/** Mức khởi điểm của một phân khúc — luôn trả về một khoảng, không bao giờ `null`. */
export function baselinePriceBand(segment: MarketPriceSegment): MarketPriceBand {
  if (segment.vehicleType === VEHICLE_TYPE.MOTORBIKE) {
    const key = segment.motorbikeCategory;
    return (key ? MOTORBIKE_BASELINE[key] : undefined) ?? MOTORBIKE_BASELINE_FALLBACK;
  }

  const byBody = segment.bodyType ? CAR_BASELINE_BY_BODY_TYPE[segment.bodyType] : undefined;
  if (byBody) return byBody;

  const bucket = carSeatBucketOf(segment.seatCount);
  return (bucket ? CAR_BASELINE_BY_SEAT_BUCKET[bucket] : undefined) ?? CAR_BASELINE_FALLBACK;
}

/** Làm tròn lên bội của `MARKET_PRICE_ROUND_STEP`, giữ thứ tự low ≤ median ≤ high. */
export function roundPriceBand(band: MarketPriceBand): MarketPriceBand {
  const round = (value: number) =>
    Math.max(
      MARKET_PRICE_ROUND_STEP,
      Math.round(value / MARKET_PRICE_ROUND_STEP) * MARKET_PRICE_ROUND_STEP,
    );
  const low = round(band.low);
  const median = Math.max(low, round(band.median));
  return { low, median, high: Math.max(median, round(band.high)) };
}
