import { Prisma } from '@xeprime/prisma';
import {
  LISTING_STATUS,
  SEAT_BUCKET_RANGE,
  SEAT_BUCKET_VALUES,
  TENANT_STATUS,
  type SeatBucket,
} from '@xeprime/types';
import type { PublicListingQueryDto } from './dto/public-listing.dto';

/**
 * Bộ lọc marketplace — CẢ HAI hiện thực của cùng một bộ điều kiện nằm trong file này:
 *
 *   - `buildListingWhere` (Prisma) — cho `search` và phần lớn phép đếm facet;
 *   - `buildListingWhereSql` (raw SQL) — cho facet tính năng, vì phải `unnest` mảng `features`.
 *
 * Bản sao là CÓ CHỦ ĐÍCH (lý do ở docblock `buildListingWhereSql`), và hai bản ở cạnh nhau để
 * người sửa vế nào cũng NHÌN THẤY vế kia. Kỷ luật giữ không lệch: sửa một bên thì sửa bên kia,
 * và phép so khớp trong `test/listings-facets.spec.ts` chạy cả hai trên cùng một bộ query — quên
 * thì test đỏ, không âm thầm.
 */

/**
 * Một chiều của bộ lọc facet. Khi đếm facet cho chiều nào thì bỏ chính filter của chiều đó
 * (semantics chuẩn — chọn SUV vẫn thấy Sedan còn bao nhiêu xe nếu đổi lựa chọn).
 */
export type FacetDimension =
  | 'bodyType'
  | 'brand'
  | 'seats'
  | 'fuelType'
  | 'features'
  | 'price'
  | 'hourly'
  | 'delivery'
  | 'noCollateral'
  | 'discount';

/** Bộ filter dùng chung giữa search và facets (facets không có sort/paging). */
export type ListingFilterQuery = Omit<PublicListingQueryDto, 'sort' | 'page' | 'limit'>;

/**
 * Điều kiện để một snapshot ĐƯỢC PHÉP xuất hiện công khai — dùng chung cho search, facets,
 * điểm đến, trang gian hàng và chi tiết xe.
 *
 * Gom một chỗ vì đây là ranh giới an toàn: thiếu một vế ở một endpoint là tỉnh đã ẩn vẫn tra
 * được bằng cách gõ tay tham số, hoặc xe của gian hàng bị khoá vẫn hiện ở trang shop.
 *
 * Bốn vế:
 *   1. listing đang `active`;
 *   2. gian hàng đang hoạt động và chưa xoá (join, KHÔNG denormalize — ADR 0008 §3);
 *   3. có tỉnh hợp lệ — xe chưa gán vị trí thì không biết xếp vào đâu;
 *   4. tỉnh đó đang được phép hiển thị công khai (`isPublicVisible`).
 *
 * `branch` KHÔNG lọc theo `status`: chi nhánh ngừng hoạt động chỉ ngăn GẮN XE MỚI, nó không có
 * nghĩa là những xe đang cho thuê ở đó biến mất khỏi chợ giữa chừng.
 */
export function publicListingScope(): Prisma.PublicListingWhereInput {
  return {
    status: LISTING_STATUS.ACTIVE,
    tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
    provinceCode: { not: null },
    province: { isPublicVisible: true },
  };
}

/**
 * Lọc dịch vụ theo NĂNG LỰC phục vụ: `service_types` là MẢNG (một xe đăng nhiều dịch vụ),
 * filter là "mảng CÓ CHỨA dịch vụ đang tìm" — GIN index phục vụ `has`. Giá trị `both` cũ đã
 * khai tử từ 17/08 (backfill thành ['self_drive','with_driver'] ở migration).
 */
function serviceTypeFilter(serviceType: string): Prisma.PublicListingWhereInput {
  return { serviceTypes: { has: serviceType } };
}

/** Lọc khoảng giá thuê/ngày. Listing chưa có giá không lọt khi có ràng buộc giá. */
function priceFilter(min?: number, max?: number): Prisma.PublicListingWhereInput {
  if (min == null && max == null) return {};
  return {
    weekdayPrice: {
      ...(min != null ? { gte: min } : {}),
      ...(max != null ? { lte: max } : {}),
    },
  };
}

/** Bucket số chỗ của một seatCount cụ thể (mỗi giá trị rơi vào đúng một bucket). */
export function seatBucketOf(seatCount: number | null): SeatBucket | null {
  if (seatCount == null) return null;
  for (const bucket of SEAT_BUCKET_VALUES) {
    const { min, max } = SEAT_BUCKET_RANGE[bucket];
    if ((min == null || seatCount >= min) && (max == null || seatCount <= max)) return bucket;
  }
  return null;
}

/**
 * Lọc xe RẢNH trong [pickupAt, returnAt): loại listing có xe bận (occupancy chồng lấn — đọc
 * `vehicle_occupancies` qua quan hệ, ADR 0006 chỉ ĐỌC; preview khả dụng, KHÔNG phải guard đặt xe).
 * Hai mốc phải hợp lệ và return > pickup, nếu không thì bỏ qua lọc.
 */
function availabilityFilter(pickupAt?: string, returnAt?: string): Prisma.PublicListingWhereInput {
  if (!pickupAt || !returnAt) return {};
  const start = new Date(pickupAt);
  const end = new Date(returnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return {};
  // Chồng lấn khi occ.startAt < end VÀ occ.endAt > start.
  return { vehicle: { occupancies: { none: { startAt: { lt: end }, endAt: { gt: start } } } } };
}

/**
 * Where-clause marketplace duy nhất cho cả search lẫn facets. Mọi fragment đẩy vào `AND` để
 * không giẫm key (cả `q` lẫn bucket số chỗ đều dùng `OR` — spread phẳng sẽ ghi đè nhau).
 * `exclude` bỏ đúng một chiều khi đếm facet cho chiều đó.
 *
 * ⚠️ Bản SINH ĐÔI bằng SQL nằm ngay dưới: `buildListingWhereSql`. **Sửa ở đây thì sửa cả bên
 * đó** — phép so khớp trong `test/listings-facets.spec.ts` sẽ đỏ nếu quên.
 */
export function buildListingWhere(
  query: ListingFilterQuery,
  exclude?: FacetDimension,
): Prisma.PublicListingWhereInput {
  const and: Prisma.PublicListingWhereInput[] = [];

  // Lọc theo MÃ tỉnh, khớp chính xác.
  //
  // Trước đây chỗ này là `provinceName contains … insensitive`, và nó sai theo hai hướng cùng
  // lúc: "Hà Nam" khớp luôn mọi tên chứa nó, còn "TP.HCM" thì không khớp "Hồ Chí Minh" dù là
  // một nơi. Tên tỉnh còn đổi được; mã thì không. Tham số `province` (tên) vẫn nhận được nhưng
  // controller đã quy nó về mã qua bảng bí danh TRƯỚC khi tới đây.
  if (query.provinceCode) {
    and.push({ provinceCode: query.provinceCode });
  }
  if (query.vehicleType) and.push({ vehicleType: query.vehicleType });
  if (query.serviceType) and.push(serviceTypeFilter(query.serviceType));
  if (query.minSeats) and.push({ seatCount: { gte: query.minSeats } });
  const availability = availabilityFilter(query.pickupAt, query.returnAt);
  if (Object.keys(availability).length > 0) and.push(availability);
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
        { model: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }

  if (exclude !== 'bodyType' && query.bodyType?.length) {
    and.push({ bodyType: { in: query.bodyType } });
  }
  // Hãng khớp đúng tên đã lưu (facet trả về giá trị thật từ DB); insensitive đỡ lệch hoa thường.
  if (exclude !== 'brand' && query.brand?.length) {
    and.push({ brand: { in: query.brand, mode: 'insensitive' } });
  }
  if (exclude !== 'seats' && query.seats?.length) {
    const ranges = query.seats
      .map((b) => SEAT_BUCKET_RANGE[b as SeatBucket])
      .filter((r): r is { min?: number; max?: number } => r != null)
      .map(({ min, max }) => ({
        seatCount: {
          ...(min != null ? { gte: min } : {}),
          ...(max != null ? { lte: max } : {}),
        },
      }));
    if (ranges.length > 0) and.push({ OR: ranges });
  }
  if (exclude !== 'fuelType' && query.fuelType?.length) {
    and.push({ fuelType: { in: query.fuelType } });
  }
  // Tính năng là AND (xe phải có ĐỦ các tiện ích đã chọn) — GIN index phục vụ hasEvery.
  if (exclude !== 'features' && query.features?.length) {
    and.push({ features: { hasEvery: query.features } });
  }
  if (exclude !== 'price') {
    const price = priceFilter(query.priceMin, query.priceMax);
    if (Object.keys(price).length > 0) and.push(price);
  }
  if (exclude !== 'hourly' && query.hourly) and.push({ hourlyPrice: { not: null } });
  if (exclude !== 'delivery' && query.delivery) and.push({ deliveryEnabled: true });
  if (exclude !== 'noCollateral' && query.noCollateral) and.push({ noCollateral: true });
  if (exclude !== 'discount' && query.discount) and.push({ discountPercent: { gt: 0 } });

  return { ...publicListingScope(), AND: and };
}

/**
 * Bản SQL của `buildListingWhere` — BẢN SAO THỨ HAI CÓ CHỦ ĐÍCH của cùng một bộ lọc.
 *
 * Vì sao phải có: facet theo tính năng đếm theo PHẦN TỬ của mảng `features`, mà Prisma không
 * bung được mảng — phải `unnest`, tức phải raw SQL, tức phải có điều kiện lọc bằng SQL. Cách
 * duy nhất tránh bản sao này là làm hai lượt (lấy id bằng Prisma rồi `IN (...)`), và đó chính là
 * thứ vừa được gỡ bỏ: trang chợ mặc định không lọc gì, nên "tập id đã thu hẹp" thực tế là TOÀN
 * BỘ bảng — 50k ULID kéo về Node rồi nối lại thành câu SQL vài MB cho MỖI request.
 *
 * Kỷ luật giữ hai bản không lệch nhau:
 *   1. Thứ tự và cách nhóm điều kiện ở đây bám sát `buildListingWhere` từng vế một;
 *   2. `test/listings-facets.spec.ts` có phép so khớp chạy CẢ HAI trên cùng một bộ query và
 *      khẳng định số đếm bằng nhau — sửa một bên mà quên bên kia thì test đỏ, không âm thầm.
 *
 * Đây cũng là ranh giới an toàn (`publicListingScope`), nên vế scope nằm ở đầu và không có
 * nhánh nào bỏ qua được nó.
 */
export function buildListingWhereSql(
  query: ListingFilterQuery,
  exclude?: FacetDimension,
): Prisma.Sql {
  const and: Prisma.Sql[] = [
    // ——— scope công khai: đối chiếu 1:1 với publicListingScope() ———
    Prisma.sql`pl."status" = ${LISTING_STATUS.ACTIVE}`,
    Prisma.sql`pl."province_code" IS NOT NULL`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM "tenants" t
      WHERE t."id" = pl."tenant_id"
        AND t."status" = ${TENANT_STATUS.ACTIVE}
        AND t."deleted_at" IS NULL
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM "provinces" p
      WHERE p."code" = pl."province_code" AND p."is_public_visible" = true
    )`,
  ];

  // ——— các vế filter: đối chiếu 1:1 với buildListingWhere() ———
  if (query.provinceCode) and.push(Prisma.sql`pl."province_code" = ${query.provinceCode}`);
  if (query.vehicleType) and.push(Prisma.sql`pl."vehicle_type" = ${query.vehicleType}`);
  if (query.serviceType) {
    and.push(Prisma.sql`pl."service_types" @> ARRAY[${query.serviceType}]::varchar[]`);
  }
  if (query.minSeats) and.push(Prisma.sql`pl."seat_count" >= ${query.minSeats}`);

  const availability = availabilitySql(query.pickupAt, query.returnAt);
  if (availability) and.push(availability);

  if (query.q) {
    // Cùng ngữ nghĩa `contains` + `mode: 'insensitive'` của Prisma: ILIKE hai đầu %, KHÔNG thoát
    // ký tự đại diện (Prisma cũng không) — để hai bản cho cùng kết quả trên mọi chuỗi.
    const needle = `%${query.q}%`;
    and.push(Prisma.sql`(
      pl."title" ILIKE ${needle} OR pl."brand" ILIKE ${needle} OR pl."model" ILIKE ${needle}
    )`);
  }

  if (exclude !== 'bodyType' && query.bodyType?.length) {
    and.push(Prisma.sql`pl."body_type" IN (${Prisma.join(query.bodyType)})`);
  }
  if (exclude !== 'brand' && query.brand?.length) {
    // `in` + insensitive: so khớp theo bản thường hoá, không phải ILIKE — tên hãng không chứa ký
    // tự đại diện nên hai cách cho cùng kết quả, còn cách này thì không phụ thuộc vào chuyện đó.
    const lowered = query.brand.map((b) => b.toLowerCase());
    and.push(Prisma.sql`lower(pl."brand") IN (${Prisma.join(lowered)})`);
  }
  if (exclude !== 'seats' && query.seats?.length) {
    const ranges = query.seats
      .map((b) => SEAT_BUCKET_RANGE[b as SeatBucket])
      .filter((r): r is { min?: number; max?: number } => r != null)
      .map(({ min, max }) => {
        const bounds: Prisma.Sql[] = [];
        if (min != null) bounds.push(Prisma.sql`pl."seat_count" >= ${min}`);
        if (max != null) bounds.push(Prisma.sql`pl."seat_count" <= ${max}`);
        return bounds.length > 0 ? Prisma.sql`(${Prisma.join(bounds, ' AND ')})` : null;
      })
      .filter((r): r is Prisma.Sql => r != null);
    if (ranges.length > 0) and.push(Prisma.sql`(${Prisma.join(ranges, ' OR ')})`);
  }
  if (exclude !== 'fuelType' && query.fuelType?.length) {
    and.push(Prisma.sql`pl."fuel_type" IN (${Prisma.join(query.fuelType)})`);
  }
  // Tính năng là AND (xe phải có ĐỦ) — `@>` là toán tử mà GIN index phục vụ, khớp `hasEvery`.
  if (exclude !== 'features' && query.features?.length) {
    and.push(Prisma.sql`pl."features" @> ARRAY[${Prisma.join(query.features)}]::text[]`);
  }
  if (exclude !== 'price') {
    if (query.priceMin != null) and.push(Prisma.sql`pl."weekday_price" >= ${query.priceMin}`);
    if (query.priceMax != null) and.push(Prisma.sql`pl."weekday_price" <= ${query.priceMax}`);
  }
  if (exclude !== 'hourly' && query.hourly) and.push(Prisma.sql`pl."hourly_price" IS NOT NULL`);
  if (exclude !== 'delivery' && query.delivery) and.push(Prisma.sql`pl."delivery_enabled" = true`);
  if (exclude !== 'noCollateral' && query.noCollateral) {
    and.push(Prisma.sql`pl."no_collateral" = true`);
  }
  if (exclude !== 'discount' && query.discount) {
    and.push(Prisma.sql`pl."discount_percent" > 0`);
  }

  return Prisma.join(and, ' AND ');
}

/**
 * Bản SQL của `availabilityFilter`: loại xe đang bận trong [pickupAt, returnAt).
 * Mốc không hợp lệ hoặc return <= pickup thì KHÔNG lọc — giống hệt bản Prisma.
 */
function availabilitySql(pickupAt?: string, returnAt?: string): Prisma.Sql | null {
  if (!pickupAt || !returnAt) return null;
  const start = new Date(pickupAt);
  const end = new Date(returnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "vehicle_occupancies" o
    WHERE o."vehicle_id" = pl."vehicle_id"
      AND o."start_at" < ${end} AND o."end_at" > ${start}
  )`;
}
