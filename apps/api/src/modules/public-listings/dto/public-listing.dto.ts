import { ApiProperty, ApiPropertyOptional, OmitType, PickType } from '@nestjs/swagger';
import { SEARCH_QUERY_MAX_LENGTH } from '@xeprime/domain';
import { LongTermPackageOptionDto } from '../../pricing/dto/pricing.dto';
import {
  BODY_TYPE_VALUES,
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE_VALUES,
  DEFAULT_LISTING_SORT,
  FUEL_TYPE_VALUES,
  LISTING_MIN_RATING_VALUES,
  LISTING_SORT_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  PROVINCE_CODES,
  SEAT_BUCKET_VALUES,
  SELLER_ENTITY_TYPE,
  SERVICE_TYPE_VALUES,
  STOREFRONT_KIND_VALUES,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_TYPE_VALUES,
  type ListingSort,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query param dạng CSV (`sedan,suv`) → mảng để validate `each` — URL searchParams thân thiện
 * hơn repeated param, FE join(',') một chỗ.
 */
const splitCsv = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

/** Query param boolean-ish (`1`/`true`) → boolean; giá trị lạ giữ nguyên để @IsBoolean chặn. */
const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

/**
 * Query trang marketplace — luôn phân trang, filter và scope ở tầng DB (skill backend-endpoint).
 * `limit` có trần cứng để client không kéo cả bảng. Các chiều facet nhận CSV multi-select;
 * wire type khai là String (CSV) để contract FE sinh ra đúng thứ đi trên URL.
 */
export class PublicListingQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'car | motorbike' })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  /** Lọc "xe PHỤC VỤ ĐƯỢC dịch vụ X" — `has` trên mảng `service_types` (tab/chip dịch vụ). */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Hãng xe — CSV, multi-select (vd: Toyota,Kia)',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  brand?: string[];

  @ApiPropertyOptional({ type: String, description: 'Kiểu dáng thân xe — CSV (BODY_TYPE)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(BODY_TYPE_VALUES, { each: true })
  bodyType?: string[];

  @ApiPropertyOptional({
    type: [String],
    enum: MOTORBIKE_CATEGORY_VALUES,
    description: 'Phân khúc xe máy — chiều lọc đối xứng với bodyType của ô tô',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(MOTORBIKE_CATEGORY_VALUES, { each: true })
  motorbikeCategory?: string[];

  @ApiPropertyOptional({ type: String, description: 'Bucket số chỗ — CSV (4,5,7,8plus)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(SEAT_BUCKET_VALUES, { each: true })
  seats?: string[];

  @ApiPropertyOptional({ type: String, description: 'Nhiên liệu — CSV (FUEL_TYPE)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(FUEL_TYPE_VALUES, { each: true })
  fuelType?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Tiện ích xe — CSV (VEHICLE_FEATURE_LABEL); xe phải có ĐỦ các key đã chọn',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(VEHICLE_FEATURE_KEYS, { each: true })
  features?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Hộp số — CSV (TRANSMISSION_TYPE_EXT_VALUES)',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(TRANSMISSION_TYPE_EXT_VALUES, { each: true })
  transmission?: string[];

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe có giá thuê giờ' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hourly?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe giao tận nơi' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  delivery?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe miễn thế chấp' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  noCollateral?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe đang giảm giá' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  discount?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Chỉ xe của gian hàng/chủ xe hỗ trợ xuất hoá đơn VAT cho tiền thuê (thiết lập chung của ' +
      'tenant — XePrime không xuất hoá đơn thay chủ xe)',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  vatInvoice?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Chỉ xe "Đặt ngay" (tự động nhận chuyến). Có serviceType thì xe phải bật Đặt ngay cho đúng ' +
      'dịch vụ đó; không có thì bật cho ít nhất một dịch vụ',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  instantBook?: boolean;

  @ApiPropertyOptional({
    type: Number,
    enum: LISTING_MIN_RATING_VALUES,
    description: 'Điểm đánh giá tối thiểu — chỉ xe có ratingAvg >= mức; xe chưa có điểm bị loại',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(LISTING_MIN_RATING_VALUES)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Số chỗ tối thiểu (giữ tương thích cũ — mới dùng `seats`)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  minSeats?: number;

  // Có trần: không ai gõ câu tìm kiếm 100 ký tự, còn chuỗi dài tự do thì vừa phình khoá cache
  // (facets dùng query làm khoá) vừa là chi phí LIKE vô ích. Luật khớp: `keywordTokenWhere`.
  @ApiPropertyOptional({
    description:
      'Từ khoá — khớp tên xe/hãng/model và TÊN CÔNG KHAI của chủ xe/gian hàng. Không phân biệt ' +
      'dấu và hoa thường; mỗi từ phải là đầu một từ ("vf8" khớp "VinFast VF 8"), không cần đúng ' +
      'thứ tự hay cùng một trường.',
    maxLength: SEARCH_QUERY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  q?: string;

  /**
   * THAM SỐ CHUẨN để lọc theo địa điểm: mã tỉnh 2 ký tự, khớp CHÍNH XÁC.
   *
   * Mã thay tên vì tên tỉnh vừa đổi được (sáp nhập 01/07/2025) vừa có nhiều cách viết
   * ("TP.HCM"/"Hồ Chí Minh"), còn URL đã phát ra ngoài thì sống rất lâu.
   */
  @ApiPropertyOptional({
    description: 'Mã tỉnh 2 ký tự — tham số chuẩn (GET /public/destinations)',
  })
  @IsOptional()
  @IsString()
  provinceCode?: string;

  /**
   * TƯƠNG THÍCH NGƯỢC: tên tỉnh dạng tự do từ link/bookmark cũ.
   *
   * Controller quy nó về `provinceCode` qua bảng bí danh rồi mới lọc; không quy được thì KHÔNG
   * tìm cả nước (đó là trả về xe ở sai tỉnh) mà trả rỗng kèm cờ `unresolvedProvince` để FE nói
   * rõ với người dùng. Không sinh URL mới theo dạng này nữa.
   */
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Tên tỉnh (link cũ) — được quy về provinceCode qua bí danh',
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Giá thuê/ngày tối thiểu (VND)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional({ description: 'Giá thuê/ngày tối đa (VND)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({ description: 'Nhận xe (ISO-8601) — lọc xe rảnh trong khoảng' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601) — dùng cùng pickupAt' })
  @IsOptional()
  @IsISO8601()
  returnAt?: string;

  @ApiPropertyOptional({ enum: LISTING_SORT_VALUES, default: DEFAULT_LISTING_SORT })
  @IsOptional()
  @IsIn(LISTING_SORT_VALUES)
  sort?: ListingSort;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}

/**
 * Query khối "Xe phù hợp với bạn" ở trang chủ — một danh sách GỢI Ý, không phải một lần tìm kiếm.
 *
 * Vì sao không dùng lại `PublicListingQueryDto`: hai bề mặt hỏi hai câu khác nhau.
 *
 *   · Trang kết quả hỏi "cho tôi đúng những xe thoả điều kiện này" — tỉnh là bộ lọc CỨNG, và
 *     không có xe nào thoả thì câu trả lời đúng là danh sách rỗng.
 *   · Trang chủ hỏi "xe nào hợp với tôi nhất" — tỉnh là ƯU TIÊN. Một trang chủ trống vì tỉnh
 *     của khách chưa có xe là tệ hơn một trang chủ nói "ưu tiên Hà Nội" rồi bù bằng xe nơi khác,
 *     vì khách còn chưa nói họ sẽ chỉ thuê ở Hà Nội — họ mới chỉ mở trang chủ.
 *
 * Đó là lý do tham số ở đây tên `nearProvinceCode` chứ không phải `provinceCode`: đổi tên là
 * cách duy nhất để không ai vô tình đọc nó như một bộ lọc. Các chiều facet (hãng, tiện ích,
 * khoảng giá…) cố ý KHÔNG có mặt — chúng thuộc về trang kết quả.
 */
export class RecommendedListingQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'car | motorbike' })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({
    description:
      'Mã tỉnh 2 ký tự khách đang quan tâm — ƯU TIÊN xếp hạng, KHÔNG lọc bỏ xe tỉnh khác',
  })
  @IsOptional()
  @IsString()
  @IsIn(PROVINCE_CODES)
  nearProvinceCode?: string;

  @ApiPropertyOptional({ description: 'Nhận xe (ISO-8601) — loại xe đã bận trong khoảng' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601) — dùng cùng pickupAt' })
  @IsOptional()
  @IsISO8601()
  returnAt?: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;
}

/**
 * BA CHỈ SỐ CÔNG KHAI của một gian hàng/chủ xe — ADR 0045 điều 2.
 *
 * Xuất hiện ở HAI chỗ với cùng một hình dạng: trang gian hàng, và khối chủ xe trên trang chi
 * tiết xe. Một DTO cho cả hai là có chủ đích — hai hình dạng khác nhau sẽ thành hai component
 * khác nhau, rồi thành hai câu giải thích khác nhau cho cùng một con số.
 *
 * ⚠️ Ba trường phần trăm đều `null` được, và `null` mang đúng MỘT nghĩa: **chưa đủ dữ liệu để
 * nói** (dưới `HOST_METRIC_MIN_SAMPLES` mẫu trong cửa sổ 90 ngày). Giao diện phải phân biệt nó
 * với 0 — một gian hàng mới mở không phải một gian hàng không bao giờ trả lời. `sampleCount`
 * luôn có mặt để câu "chưa đủ dữ liệu" là một câu kiểm chứng được.
 */
export class HostMetricsDto {
  @ApiProperty({
    description:
      'Số YÊU CẦU mà gian hàng thật sự phải quyết, trong 90 ngày gần nhất. Không gồm ' +
      'slot_taken, khách rút trước khi gian hàng quyết, và dữ liệu LEGACY ADR 0039 không có ' +
      'quyết định nào.',
  })
  sampleCount!: number;

  @ApiProperty({
    required: true,
    type: Number,
    nullable: true,
    description: 'Tỉ lệ phản hồi trong hạn (0–100). Null = chưa đủ mẫu, KHÔNG phải 0.',
  })
  responseRatePercent!: number | null;

  @ApiProperty({
    required: true,
    type: Number,
    nullable: true,
    description:
      'Tỉ lệ NHẬN VÀ GIỮ chuyến (0–100). Từ chối trong hạn KHÔNG nằm trong tử số; gian hàng ' +
      'huỷ sau khi đã nhận thì mẫu đó rời tử số. Null = chưa đủ mẫu.',
  })
  acceptKeepRatePercent!: number | null;

  @ApiProperty({
    required: true,
    type: Number,
    nullable: true,
    description:
      'Trung vị số PHÚT tới quyết định của NGƯỜI. Lượt tự nhận không vào phép tính này — xem ' +
      'instantBook. Null = chưa đủ mẫu do người quyết.',
  })
  responseMinutesMedian!: number | null;

  @ApiProperty({
    description:
      'Gian hàng có xe bật "Đặt ngay" trong cửa sổ — giao diện hiện nhãn thay cho số phút, ' +
      'thay vì quảng cáo một tốc độ trả lời thủ công không có thật.',
  })
  instantBook!: boolean;
}

/** Query facets — cùng bộ filter với search; sort/paging vô nghĩa với đếm nên bỏ. */
export class ListingFacetsQueryDto extends OmitType(PublicListingQueryDto, [
  'sort',
  'page',
  'limit',
] as const) {}

export class PublicListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  // `type` tường minh cho field nullable, nếu không openapi-typescript sinh `Record<string,never>`.
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Kiểu dáng (BODY_TYPE)' })
  bodyType!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: MOTORBIKE_CATEGORY_VALUES,
    description: 'Phân khúc — chỉ xe máy',
  })
  motorbikeCategory!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;

  @ApiProperty({ description: 'Tổng số ảnh của xe — thẻ hiện "+N" ảnh', minimum: 0 })
  imageCount!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: TRANSMISSION_TYPE_EXT_VALUES,
    description:
      'Hộp số (TRANSMISSION_TYPE_EXT — cùng bộ mã với hồ sơ xe) — null khi chủ xe chưa khai',
  })
  transmission!: string | null;

  @ApiProperty({
    enum: SERVICE_TYPE_VALUES,
    isArray: true,
    description:
      'Dịch vụ đang bật tự động nhận chuyến — thẻ hiện "Không cần xác nhận" khi dịch vụ khách ' +
      'đang xem nằm trong mảng này',
  })
  instantBookServiceTypes!: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền dạng string — ADR 0007' })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  weekendPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê giờ (string — ADR 0007). Null = xe không cho thuê theo giờ.',
  })
  hourlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá tháng tham chiếu thuê dài hạn (string — ADR 0007).',
  })
  monthlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày đã gồm tài xế (string — ADR 0007). Null = gian hàng báo khi duyệt.',
  })
  withDriverDailyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế lộ trình liên tỉnh — string tiền (ADR 0007)',
  })
  withDriverInterCityPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế lộ trình liên tỉnh 1 chiều — string tiền (ADR 0007)',
  })
  withDriverOneWayPrice!: string | null;

  @ApiProperty({ description: 'Chủ xe hỗ trợ giao xe tận nơi' }) deliveryEnabled!: boolean;
  @ApiProperty({ description: 'Miễn thế chấp (không cần cọc tài sản)' }) noCollateral!: boolean;

  /*
   * Cam kết của CHỦ XE — thiết lập chung của gian hàng, áp cho mọi xe — không phải dịch vụ của
   * XePrime (ADR 0059): hai bên tự thoả thuận và
   * xác nhận trực tiếp; XePrime không xuất hoá đơn thay chủ xe, và hoá đơn đó chỉ phủ tiền thuê trả
   * cho chủ xe — không phủ khoản khách trả cho XePrime (phí dịch vụ). Giao diện chỉ gắn dấu
   * khi `true` — `false` nghĩa là "chủ xe chưa công bố", không phải "chủ xe từ chối".
   */
  @ApiProperty({
    description:
      'Chủ xe hỗ trợ xuất hoá đơn VAT cho tiền thuê xe theo thoả thuận trực tiếp với khách — XePrime ' +
      'không xuất hoá đơn thay chủ xe',
  })
  vatInvoiceSupported!: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% khuyến mãi trực tiếp cho tiền thuê tự lái (0–100)',
  })
  discountPercent!: number | null;

  @ApiProperty({ description: 'Tên gian hàng' }) shopName!: string;
  @ApiProperty({ description: 'Slug gian hàng cho route /shops/[slug]' }) shopSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Logo gian hàng' })
  shopLogoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/thành gian hàng' })
  shopProvince!: string | null;

  /*
   * Thẻ xe phải phân biệt được HAI TUYẾN (ADR 0028) — cùng một luật với `PublicShopDto.verified`
   * và với dấu cạnh tên người đang đăng nhập, cố ý: nếu thẻ xe đeo dấu cho mọi gian hàng còn
   * trang gian hàng chỉ đeo cho tuyến gói thì dấu đó không còn phân biệt được gì.
   *
   * Là BOOLEAN chứ không phải `storefrontKind`: thẻ xe không vẽ mặt tiền, nó chỉ cần biết có
   * gắn dấu và tô nổi bật hay không. Trả cả hai là hai cách nói cùng một điều, và hai cách nói
   * thì có ngày lệch nhau.
   */
  @ApiProperty({
    description: 'Gian hàng tuyến gói — đeo dấu xác thực XePrime (hasVerifiedStorefront)',
  })
  shopVerified!: boolean;

  /*
   * ⚠️ THẺ KẾT QUẢ CỐ Ý KHÔNG MANG BA CHỈ SỐ của chủ xe (ADR 0045 điều 2).
   *
   * Một trang kết quả hiện 12–48 thẻ, và mỗi chỉ số là một phép gộp 90 ngày trên
   * `booking_requests`. Gắn chúng vào thẻ nghĩa là hoặc 48 lượt gộp mỗi lần mở trang (đúng cái
   * N+1 mà ADR cấm), hoặc một phép gộp khổng lồ cho dữ liệu mà phần lớn người xem lướt qua.
   * Chúng sống ở TRANG CHI TIẾT (`PublicListingDetailDto.shopMetrics`) và TRANG GIAN HÀNG —
   * hai nơi khách thật sự đang cân nhắc một người bán cụ thể.
   */

  @ApiProperty({ description: 'Số chuyến đã hoàn thành của xe' })
  completedTripCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã tỉnh nơi xe đang đỗ (theo chi nhánh) — dùng để lọc/điều hướng',
  })
  provinceCode!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên xã/phường của chi nhánh đang giữ xe — chỉ để HIỂN THỊ',
  })
  wardName!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Điểm đánh giá trung bình CỦA XE (review published). Null khi chưa có đánh giá.',
  })
  ratingAvg!: string | null;

  @ApiProperty({ description: 'Số lượt đánh giá của xe' }) ratingCount!: number;
}

/**
 * Chỗ khách tới nhận xe khi chọn "Nhận tại điểm hẹn" — là CHI NHÁNH đang giữ xe, không phải
 * địa chỉ chung của gian hàng: shop nhiều chi nhánh thì mỗi xe đỗ một nơi khác nhau.
 *
 * Địa chỉ rơi về hồ sơ gian hàng khi chi nhánh chưa điền (`tenant_branches.address` là optional).
 * Không có địa chỉ nào ⇒ cả object là `null`, FE hiện câu gợi ý chung — KHÔNG dựng địa chỉ giả.
 */
export class PickupPointDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên chi nhánh giữ xe. Null khi địa chỉ rơi về hồ sơ gian hàng.',
  })
  branchName!: string | null;

  @ApiProperty({ description: 'Địa chỉ nhận xe' }) address!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/thành của điểm nhận' })
  provinceName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'SĐT chi nhánh' })
  phone!: string | null;

  /**
   * Toạ độ điểm nhận, để trang xe ghim lên bản đồ. Null khi chi nhánh chưa có toạ độ hoặc khi
   * địa chỉ rơi về hồ sơ gian hàng — không ghim bừa một điểm khác với dòng địa chỉ hiển thị.
   */
  @ApiPropertyOptional({ type: Number, nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  longitude!: number | null;
}

/** Chi tiết một xe trên marketplace — cho trang `/listings/[id]`. */
/**
 * Điều kiện BẢO ĐẢM công bố cho khách (gap C-04). Mã đi trên dây; nhãn do FE dịch (ADR 0012).
 */
export class ListingCollateralDto {
  @ApiProperty({ enum: COLLATERAL_MODE_VALUES }) mode!: string;
  @ApiProperty({ enum: COLLATERAL_ASSET_TYPE_VALUES, isArray: true }) assetTypes!: string[];
  @ApiProperty({ description: 'VND string — chỉ khác 0 khi mode = cash' }) depositAmount!: string;
}

/**
 * Điều kiện thuê CÔNG BỐ cho khách theo từng dịch vụ (08/09/2026) — giấy tờ phải xuất trình,
 * cách đối chiếu (luôn thủ công), điều khoản, cọc giữ chuyến có tài xế và "đặt nhanh".
 * Mã đi trên dây, FE dịch nhãn (ADR 0012). KHÔNG có dữ liệu nội bộ nào ở đây.
 */
export class ListingRentalTermsDto {
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty({ type: [String], description: 'CUSTOMER_DOCUMENT_TYPE — bộ HIỆU LỰC' })
  requiredDocuments!: string[];
  @ApiProperty({
    description: 'IDENTITY_VERIFY_METHOD — đối chiếu TAY, kể cả qua app VNeID của khách',
  })
  identityVerifyMethod!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) termsText!: string | null;
  @ApiProperty() requireTermsAcceptance!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    deprecated: true,
    description:
      'NGỪNG DÙNG (29/10/2026) — DRIVER_DEPOSIT_MODE, chỉ with_driver; tiền giữ chỗ do nền tảng thu, đừng hiển thị',
  })
  depositMode!: string | null;
  @ApiProperty({
    description: 'Xe bật tự động nhận cho dịch vụ này (điều kiện cụ thể do báo giá trả)',
  })
  instantBookEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) minRentalMinutes!: number | null;
}

export class ListingHandoverWindowDto {
  @ApiProperty({ example: '06:00' }) start!: string;
  @ApiProperty({ example: '22:00' }) end!: string;
}

/** Khung giờ giao/nhận của xe — rỗng = mọi giờ. Server vẫn kiểm lại lúc gửi yêu cầu. */
export class ListingHandoverDto {
  @ApiProperty({ type: [ListingHandoverWindowDto] }) pickupWindows!: ListingHandoverWindowDto[];
  @ApiProperty({ type: [ListingHandoverWindowDto] }) returnWindows!: ListingHandoverWindowDto[];
}

/** Một khoản phụ phí MẶC ĐỊNH đang bật của chuyến có tài xế — công bố trước, ghi nhận sau. */
export class ListingDriverSurchargeRuleDto {
  @ApiProperty({ description: 'DRIVER_SURCHARGE_KIND' }) kind!: string;
  @ApiProperty({ description: 'DRIVER_SURCHARGE_UNIT' }) unit!: string;
  @ApiProperty({ description: 'VND string — ADR 0007' }) amount!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) thresholdValue!: number | null;
}

/** Hạn mức km/ngày đã công bố + tiền mỗi km vượt (ADR 0007: tiền là chuỗi). */
export class ListingMileagePolicyDto {
  @ApiProperty({ description: 'Số km/ngày đã nằm trong giá thuê' }) includedKmPerDay!: number;
  @ApiProperty({ description: 'VND mỗi km vượt — ghi nhận lúc quyết toán, không cộng vào báo giá' })
  excessFeePerKm!: string;
}

export class PublicListingDetailDto extends PublicListingDto {
  /**
   * Ba chỉ số của CHỦ XE, ngay trong trang chi tiết xe (ADR 0045 điều 2).
   *
   * Ở đây chứ không chỉ ở trang gian hàng vì đây là nơi khách thật sự quyết định gửi yêu cầu —
   * bắt họ mở thêm một trang nữa để biết người này có hay trả lời không là bắt họ làm việc mà
   * phần lớn sẽ không làm.
   *
   * MỘT truy vấn gộp cho MỘT tenant (trang chi tiết chỉ có một chủ xe), nên không có N+1 nào ở
   * đây — khác hẳn thẻ kết quả, xem docblock `PublicListingDto`.
   */
  @ApiProperty({ type: HostMetricsDto })
  shopMetrics!: HostMetricsDto;

  /**
   * Gian hàng này có nhận tin nhắn từ khách CHƯA đặt xe không.
   *
   * Nằm ở DTO chi tiết chứ không ở thẻ xe vì chỉ trang này có nút "Nhắn shop" — thẻ trong lưới
   * không có, và một cờ không ai đọc trên mọi thẻ của mọi trang kết quả là chi phí không đổi
   * lấy gì.
   *
   * Là cờ CHÍNH SÁCH, không phải `shopVerified` gọi bằng tên khác: hôm nay cả hai cùng đúng với
   * tuyến gói, nhưng "đeo dấu xác thực" và "mở hộp thư công khai" là hai quyết định rời nhau
   * được (xem `storefrontAllowsPublicChat`). Ẩn nút theo cờ này chỉ là lịch sự với người dùng —
   * chặn thật nằm ở `ChatService` (`CHAT_REQUIRES_BOOKING`).
   */
  @ApiProperty({
    description: 'Gian hàng mở hộp thư công khai (storefrontAllowsPublicChat)',
  })
  shopChatOpen!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giới thiệu gian hàng' })
  shopBio!: string | null;

  /**
   * Ba số CỦA CẢ GIAN HÀNG (toàn bộ xe), khác `ratingAvg`/`ratingCount`/`completedTripCount` kế
   * thừa từ `PublicListingDto` — những trường đó chỉ đếm RIÊNG chiếc xe đang xem. Thẻ gian hàng ở
   * trang chi tiết xe nói về NGƯỜI BÁN, không phải một chiếc xe, nên nó cần số của người bán.
   *
   * Cùng cột `tenants.rating_avg`/`rating_count` mà `PublicShopDto` đã dùng cho trang gian hàng
   * (không phải một truy vấn tổng hợp mới) — `ratingCount === 0` nghĩa là chưa có đánh giá, đọc
   * `shopRatingAvg` (mặc định 0) lúc đó là bịa một điểm số.
   */
  @ApiProperty({ description: 'Điểm đánh giá trung bình CỦA GIAN HÀNG, string — ADR 0007' })
  shopRatingAvg!: string;

  @ApiProperty({ description: 'Số lượt đánh giá của gian hàng' })
  shopRatingCount!: number;

  @ApiProperty({ description: 'Số chuyến đã hoàn thành của TOÀN gian hàng' })
  shopCompletedTripCount!: number;

  @ApiProperty({ type: [String], description: 'URL ảnh gallery theo thứ tự' })
  images!: string[];

  @ApiProperty({ type: [String], description: 'Key tiện ích (VEHICLE_FEATURE_LABEL)' })
  features!: string[];

  /**
   * Giá SÁU gói thuê dài hạn của xe, do server tính (ADR 0011): mỗi gói kèm giá cuối và giá
   * bình quân tháng, đủ để bảng chọn gói hiển thị TIỀN THẬT thay vì badge phần trăm. Rỗng khi
   * xe không đăng dài hạn hoặc chưa niêm yết giá tháng — FE hiện "liên hệ báo giá".
   */
  @ApiProperty({ type: [LongTermPackageOptionDto] })
  longTermPackages!: LongTermPackageOptionDto[];

  @ApiPropertyOptional({
    type: PickupPointDto,
    nullable: true,
    description: 'Chỗ nhận xe khi khách tự tới lấy — chi nhánh giữ xe, fallback hồ sơ gian hàng.',
  })
  pickupPoint!: PickupPointDto | null;

  /**
   * KHÁC `deliveryEnabled`, và hai giá trị này lệch nhau được — đừng gộp:
   *   - `deliveryEnabled` là TIỆN ÍCH khai trên hồ sơ xe, chỉ để gắn chip trên thẻ/trang xe;
   *   - `deliveryAvailable` là CHÍNH SÁCH HIỆU LỰC (`rental_policies`), tức đúng thứ
   *     `BookingRequestsService` dùng để chấp nhận hay từ chối `deliveryRequested`.
   * Luồng đặt xe phải hỏi trường này, nếu không khách chọn được một hình thức mà tới nút gửi
   * mới ăn `DELIVERY_NOT_SUPPORTED`.
   */
  @ApiProperty({ description: 'Giao xe tận nơi có ĐẶT ĐƯỢC không (theo chính sách hiệu lực)' })
  deliveryAvailable!: boolean;

  /**
   * Điều kiện BẢO ĐẢM khách phải đáp ứng (gap C-04) — null khi gian hàng chưa cấu hình chính
   * sách. Mã đi trên dây, FE tự map nhãn theo ngôn ngữ (ADR 0012).
   */
  @ApiPropertyOptional({ type: ListingCollateralDto, nullable: true })
  collateral!: ListingCollateralDto | null;

  /** Một mục cho mỗi dịch vụ xe đăng có thiết lập riêng (tự lái, có tài xế) — 08/09/2026. */
  @ApiProperty({ type: [ListingRentalTermsDto] })
  rentalTerms!: ListingRentalTermsDto[];

  @ApiProperty({ type: ListingHandoverDto })
  handover!: ListingHandoverDto;

  /** Chỉ khoản ĐANG BẬT; rỗng khi xe không có dịch vụ có tài xế hoặc chưa cấu hình. */
  @ApiProperty({ type: [ListingDriverSurchargeRuleDto] })
  driverSurchargeRules!: ListingDriverSurchargeRuleDto[];

  /**
   * Hạn mức quãng đường của chuyến tự lái (09/09/2026) — null = không giới hạn. Khách phải thấy
   * TRƯỚC khi đặt: phí vượt km chỉ xuất hiện lúc quyết toán, nên nó phải được công bố từ đây.
   */
  @ApiPropertyOptional({ type: ListingMileagePolicyDto, nullable: true })
  mileagePolicy!: ListingMileagePolicyDto | null;

  /** Thông số NĂNG LƯỢNG đúng theo loại xe: lít/100km với xe xăng, km mỗi lần sạc với xe điện. */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'L/100km (xăng/dầu/hybrid)' })
  fuelConsumptionCombined!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Km mỗi lần sạc đầy (xe điện)',
  })
  electricRangeKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Dung lượng pin (kWh)' })
  batteryCapacityKwh!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'kWh/100km' })
  electricConsumptionKwhPer100Km!: string | null;
  // `transmission` khai ở `PublicListingDto` (thẻ xe cũng mang nó từ design v2) — không khai lại.
}

export class PublicListingPageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() hasNext!: boolean;
}

/** Một option trong một chiều facet — key giá trị + số listing khớp. */
export class FacetBucketDto {
  @ApiProperty({ description: 'Giá trị của option (body type key, tên hãng, bucket số chỗ…)' })
  key!: string;

  @ApiProperty({ description: 'Số listing khớp nếu chọn option này' })
  count!: number;
}

/** Biên giá thuê/ngày của tập listing khớp filter (bỏ qua chính filter giá) — nuôi slider. */
export class PriceBoundsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thấp nhất — string tiền (ADR 0007)',
  })
  min!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá cao nhất — string tiền (ADR 0007)',
  })
  max!: string | null;
}

/** Số listing khớp cho từng toggle tiện ích (mỗi số đã bỏ qua chính toggle đó). */
export class AmenityFacetsDto {
  @ApiProperty({ description: 'Xe có giá thuê giờ' }) hourly!: number;
  @ApiProperty({ description: 'Xe giao tận nơi' }) delivery!: number;
  @ApiProperty({ description: 'Xe miễn thế chấp' }) noCollateral!: number;
  @ApiProperty({ description: 'Xe đang giảm giá' }) discount!: number;
  @ApiProperty({ description: 'Xe chủ xe hỗ trợ xuất hoá đơn VAT' }) vatInvoice!: number;
}

/**
 * Facet counts cho panel Bộ lọc — semantics chuẩn faceted search: MỖI chiều được đếm với toàn
 * bộ filter đang chọn TRỪ chính chiều đó (chọn SUV vẫn thấy Sedan còn bao nhiêu xe).
 * `total` là số xe khớp TẤT CẢ filter — nuôi nút "Áp dụng (N xe)".
 */
export class ListingFacetsDto {
  @ApiProperty({ description: 'Số xe khớp toàn bộ filter — nút "Áp dụng (N xe)"' }) total!: number;
  @ApiProperty({ type: PriceBoundsDto }) price!: PriceBoundsDto;
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo kiểu dáng (BODY_TYPE key)' })
  bodyType!: FacetBucketDto[];

  @ApiProperty({ type: [FacetBucketDto], description: 'Phân khúc xe máy (rỗng khi lọc ô tô)' })
  motorbikeCategory!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo hãng xe (tên hãng như đã lưu)' })
  brand!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo bucket số chỗ (SEAT_BUCKET key)' })
  seats!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo nhiên liệu (FUEL_TYPE key)' })
  fuelType!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo tiện ích xe (VEHICLE_FEATURE key)' })
  features!: FacetBucketDto[];
  @ApiProperty({ type: AmenityFacetsDto }) amenities!: AmenityFacetsDto;
}

/**
 * Ngữ cảnh của khối gợi ý — có mặt để giao diện KHÔNG phải đoán.
 *
 * `nearProvinceCode` được TRẢ LẠI (chứ không chỉ nhận vào) vì server là nơi quyết định mã đó
 * có dùng được hay không; `mixedProvinces` cho phép màn hình nói "ưu tiên Hà Nội" một cách
 * trung thực thay vì hứa một điều danh sách không giữ.
 */
export class RecommendedListingsMetaDto {
  @ApiProperty({ description: 'Số xe đang hiển thị trong khối' })
  count!: number;

  @ApiProperty({ description: 'Tổng số xe khớp ngữ cảnh (dịch vụ/loại xe/thời gian), toàn quốc' })
  total!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tỉnh đã được ưu tiên khi xếp hạng; null nghĩa là xếp theo cả nước',
  })
  nearProvinceCode!: string | null;

  @ApiProperty({
    description: 'Kết quả có lẫn xe ngoài tỉnh được ưu tiên — UI cần nói rõ thay vì ngụ ý',
  })
  mixedProvinces!: boolean;
}

/**
 * Kết quả khối gợi ý: danh sách đã xếp hạng + ngữ cảnh để giao diện nói THẬT về thứ nó đang làm.
 */
export class RecommendedListingsDto {
  @ApiProperty({ type: [PublicListingDto] }) data!: PublicListingDto[];
  @ApiProperty({ type: RecommendedListingsMetaDto }) meta!: RecommendedListingsMetaDto;
}

export class PublicListingPageDto {
  @ApiProperty({ type: [PublicListingDto] }) data!: PublicListingDto[];
  @ApiProperty({ type: PublicListingPageMetaDto }) meta!: PublicListingPageMetaDto;
}

/** Một tỉnh/thành gian hàng đang có xe công khai — tab lọc "Xe đang cho thuê". */
export class PublicShopProvinceDto {
  @ApiProperty({ description: 'Mã tỉnh 2 ký tự — giá trị của tham số `provinceCode`' })
  code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() vehicleCount!: number;
}

/**
 * Một chi nhánh đang giữ xe công khai của gian hàng.
 *
 * Điểm là trung bình CÓ TRỌNG SỐ theo số đánh giá của các xe thuộc chi nhánh — cùng cách cộng với
 * điểm gian hàng; chi nhánh chưa có xe nào được đánh giá thì `ratingAvg = null`, không phải 0.
 */
export class PublicShopBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiProperty({ description: 'Số xe công khai đang ở chi nhánh' }) vehicleCount!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Điểm trung bình (string — ADR 0007); null khi chưa có đánh giá',
  })
  ratingAvg!: string | null;
  @ApiProperty() ratingCount!: number;
}

/**
 * Số xe công khai thoả từng chip lọc của trang gian hàng — đếm bằng CHÍNH `buildListingWhere` mà
 * danh sách dùng, nên chip nào hiện ra thì bấm vào không bao giờ ra trang rỗng.
 */
export class ShopVehicleFilterCountsDto {
  @ApiProperty({ description: 'serviceType=with_driver' }) withDriver!: number;
  @ApiProperty({ description: 'serviceType=long_term' }) longTerm!: number;
  @ApiProperty({ description: 'delivery=true' }) delivery!: number;
  @ApiProperty({ description: 'instantBook=true' }) instantBook!: number;
  @ApiProperty({ description: 'noCollateral=true' }) noCollateral!: number;
  @ApiProperty({ description: 'vatInvoice=true' }) vatInvoice!: number;
}

/**
 * Dấu hiệu UY TÍN đã được kiểm chứng của một gian hàng — khối "Xác thực XePrime" và các ô cam kết
 * ở trang gian hàng.
 *
 * Mỗi trường là một sự thật có người chịu trách nhiệm đứng sau: nhân sự nền tảng đã duyệt (hồ sơ
 * người bán, giấy phép, phiếu duyệt gian hàng), hệ thống đã xác minh (OTP), hoặc gian hàng tự CAM
 * KẾT và có dòng audit (hoá đơn VAT, ADR 0059). Không trường nào là lời hứa của XePrime thay chủ
 * xe (ADR 0028) — "đã ký hợp đồng chất lượng", "đội xe dự phòng", "cứu hộ 24/7" chưa có dữ liệu
 * thì không có mặt ở đây.
 */
export class ShopTrustDto {
  @ApiPropertyOptional({
    enum: [SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS, SELLER_ENTITY_TYPE.COMPANY],
    nullable: true,
    description:
      'Hộ kinh doanh / doanh nghiệp — CHỈ khi hồ sơ người bán đã được nền tảng xác minh VÀ giấy ' +
      'phép kinh doanh đã được duyệt; cá nhân hoặc chưa đủ ⇒ null',
  })
  legalEntityType!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Thời điểm nền tảng xác minh hồ sơ người bán (ISO-8601 UTC)',
  })
  legalEntityVerifiedAt!: string | null;

  @ApiProperty({
    description: 'Phiếu duyệt gian hàng mới nhất đã được nền tảng DUYỆT (SHOP_VERIFICATION)',
  })
  shopVerified!: boolean;

  @ApiProperty({
    description:
      'Gian hàng đã duyệt + SĐT chủ đã xác minh OTP + không chi nhánh giữ xe công khai nào đang ' +
      'chờ soát lại vị trí',
  })
  contactVerified!: boolean;

  @ApiProperty({ description: 'Gian hàng cam kết xuất hoá đơn VAT cho tiền thuê (ADR 0059)' })
  vatInvoiceSupported!: boolean;

  @ApiProperty({
    description:
      'Số xe công khai ĐANG trong chu kỳ bảo dưỡng theo sổ bảo dưỡng (isMaintenanceOnSchedule)',
  })
  maintenanceOnScheduleCount!: number;
}

/**
 * Hồ sơ công khai của một gian hàng — cho trang `/shops/[slug]`. Chỉ dữ liệu công khai.
 *
 * ## Vì sao một DTO gánh cả HAI mặt tiền thay vì hai endpoint
 *
 * Chủ xe cá nhân và gian hàng tuyến gói được vẽ rất khác nhau (ảnh bìa, dấu xác thực, số chi
 * nhánh), nhưng chúng là cùng một THỰC THỂ ở cùng một URL, và mặt tiền thì đổi được trong đời
 * một tenant: mua gói là thành gian hàng, hết ân hạn là về lại cá nhân (ADR 0038 điều 5). Hai
 * endpoint nghĩa là mỗi lần tuyến đổi thì link cũ trả 404 — và là hai chỗ để luật hiển thị
 * công khai (`publicListingScope`) trôi khỏi nhau.
 *
 * `storefrontKind` chọn cách VẼ; mọi số liệu bên dưới đều có nghĩa với cả hai mặt tiền.
 *
 * ## Mọi con số ở đây phải ĐẾM ĐƯỢC
 *
 * Không có trường nào là lời hứa marketing. "Bảo hiểm toàn diện" / "Hỗ trợ 24/7" cố ý KHÔNG có
 * mặt: chưa có partner + policy + chứng nhận thật thì in chúng lên trang là nói dối khách
 * (ADR 0028). Mỗi trường dưới đây đều truy ngược được về một hàng trong DB.
 */
export class PublicShopDto {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Slug gian hàng' }) slug!: string;

  @ApiProperty({
    enum: STOREFRONT_KIND_VALUES,
    description: 'Mặt tiền cần vẽ — suy từ tuyến thu tiền hiệu lực (resolveStorefrontKind)',
  })
  storefrontKind!: string;

  @ApiProperty({
    description: 'Đeo dấu xác thực XePrime — CHỈ gian hàng tuyến gói (hasVerifiedStorefront)',
  })
  verified!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;

  /*
   * KHÔNG có `phone` ở đây, và đó là một quyết định chứ không phải một thiếu sót.
   *
   * Số điện thoại từng được trả ra để trang vẽ nút "Gọi 09xxxxxxxx" — tức là đăng số của chủ xe
   * lên một trang không cần đăng nhập, nơi mọi trình thu thập đều đọc được. Với chủ xe cá nhân
   * đó là số riêng của họ; với gian hàng đó là đường dây tổng bị bỏ ngoài mọi thống kê liên hệ.
   *
   * Liên hệ đi qua hộp thư trong ứng dụng: có danh tính hai đầu, có lịch sử, và có cổng
   * `CHAT_REQUIRES_BOOKING` cho tuyến hoa hồng. Số điện thoại vẫn tới tay khách — ở bước bàn
   * giao, sau khi đã có một chuyến thật.
   */

  @ApiProperty({
    description: 'Gian hàng mở hộp thư công khai (storefrontAllowsPublicChat)',
  })
  chatOpen!: boolean;

  @ApiProperty({ description: 'Ngày mở gian hàng (ISO-8601 UTC) — "Tham gia từ …"' })
  joinedAt!: string;

  @ApiProperty({ description: 'Điểm đánh giá trung bình, string — ADR 0007' })
  ratingAvg!: string;

  @ApiProperty() ratingCount!: number;

  @ApiProperty({ description: 'Số xe ĐANG hiển thị công khai (cùng luật lọc với chợ)' })
  vehicleCount!: number;

  @ApiProperty({ description: 'Số chuyến đã hoàn thành của toàn gian hàng' })
  completedTripCount!: number;

  /**
   * BA CHỈ SỐ công khai — thay cho `responseRatePercent` đứng một mình (ADR 0045 điều 2).
   *
   * Gộp thành một object chứ không ba trường phẳng: chúng phải được đọc CÙNG NHAU (một tỉ lệ
   * phản hồi 100% trên hai mẫu không nói được gì nếu không thấy `sampleCount`), và một object
   * là thứ buộc giao diện phải nhận cả cụm thay vì bốc ra một con số nghe kêu nhất.
   */
  @ApiProperty({ type: HostMetricsDto })
  metrics!: HostMetricsDto;

  @ApiProperty({ description: 'Số chi nhánh đang hoạt động' })
  branchCount!: number;

  @ApiProperty({
    type: [String],
    description: 'Tên các tỉnh/thành đang có xe công khai — theo số xe giảm dần',
  })
  serviceProvinceNames!: string[];

  @ApiProperty({
    type: [PublicShopProvinceDto],
    description: 'Các tỉnh/thành đang có xe công khai, kèm MÃ để lọc — theo số xe giảm dần',
  })
  serviceProvinces!: PublicShopProvinceDto[];

  @ApiProperty({
    type: [PublicShopBranchDto],
    description: 'Chi nhánh đang giữ xe công khai — theo số xe giảm dần',
  })
  branches!: PublicShopBranchDto[];

  @ApiProperty({ type: ShopVehicleFilterCountsDto })
  vehicleFilterCounts!: ShopVehicleFilterCountsDto;

  @ApiProperty({ type: ShopTrustDto })
  trust!: ShopTrustDto;

  @ApiProperty({ description: 'Có ít nhất một xe công khai hỗ trợ giao tận nơi' })
  deliveryAvailable!: boolean;
}

/**
 * Một tỉnh/thành có xe đang cho thuê — "Địa điểm nổi bật" ở trang chủ. Số liệu tính từ snapshot
 * `public_listings` (không hardcode danh sách tỉnh ở FE).
 */
export class PublicDestinationDto {
  @ApiProperty({ description: 'Mã tỉnh — giá trị đi vào URL và bộ lọc `provinceCode`' })
  provinceCode!: string;

  @ApiProperty({ description: 'Tên tỉnh chuẩn — chỉ để HIỂN THỊ, không dùng để lọc' })
  provinceName!: string;

  @ApiProperty({ description: 'Số xe đang hiển thị công khai ở tỉnh/thành này' })
  vehicleCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh đại diện lấy từ một xe' })
  imageUrl!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Giá thuê TỰ LÁI theo ngày thấp nhất (đã trừ khuyến mãi của chủ xe), string — ADR 0007. ' +
      'Null khi tỉnh không có xe tự lái nào có giá ngày.',
  })
  minDailyPrice!: string | null;
}

/** Query "địa điểm nổi bật" — chỉ cần giới hạn số lượng (63 tỉnh/thành là trần tự nhiên). */
export class PublicDestinationQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 63 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(63)
  limit?: number;
}

/** Gian hàng trong danh sách công khai — "Gian hàng nổi bật" ở trang chủ. */
export class PublicShopSummaryDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiProperty({ description: 'Số xe đang hiển thị công khai' }) vehicleCount!: number;

  @ApiProperty({ description: 'Điểm đánh giá trung bình, string — ADR 0007' })
  ratingAvg!: string;

  @ApiProperty() ratingCount!: number;

  @ApiProperty({
    description:
      'Gian hàng tuyến gói — đeo dấu xác thực XePrime (hasVerifiedStorefront). Cùng phép suy ' +
      'với `shopVerified` của thẻ xe: false là mặt tiền chủ xe cá nhân.',
  })
  verified!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lời giới thiệu ngắn của gian hàng (hồ sơ) — null khi chưa viết',
  })
  bio!: string | null;

  @ApiProperty({ description: 'Số chuyến đã hoàn thành của cả gian hàng' })
  completedTripCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ảnh của xe xếp hạng cao nhất đang hiển thị công khai — ảnh đại diện trên thẻ',
  })
  featuredVehicleImageUrl!: string | null;
}

export class PublicShopPageDto {
  @ApiProperty({ type: [PublicShopSummaryDto] }) data!: PublicShopSummaryDto[];
  @ApiProperty({ type: PublicListingPageMetaDto }) meta!: PublicListingPageMetaDto;
}

/** Query danh sách gian hàng công khai — phân trang, sắp theo điểm đánh giá. */
export class PublicShopListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;

  /** Gợi ý chủ xe ở ô từ khoá của `/search` — CÙNG luật tên công khai với `q` của danh sách xe. */
  @ApiPropertyOptional({
    description:
      'Từ khoá — chỉ giữ chủ xe/gian hàng có TÊN CÔNG KHAI khớp (cùng luật với `q` của ' +
      '`GET /public/listings`: không dấu, khớp đầu từ).',
    maxLength: SEARCH_QUERY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  q?: string;
}

/**
 * Query danh sách xe của một gian hàng — phân trang + sort + bộ lọc của trang gian hàng (tab tỉnh,
 * chip dịch vụ/tiện ích). Không nhận slug qua body.
 *
 * `PickType` từ query chợ chứ không khai lại: cùng tên tham số, cùng validator, và đi qua CÙNG
 * `buildListingWhere` — chip "Giao xe tận nơi" ở trang gian hàng không thể nghĩa khác chip cùng
 * tên ở trang tìm kiếm.
 */
export class ShopListingQueryDto extends PickType(PublicListingQueryDto, [
  'provinceCode',
  'serviceType',
  'delivery',
  'instantBook',
  'noCollateral',
  'vatInvoice',
  'sort',
  'page',
  'limit',
] as const) {}
