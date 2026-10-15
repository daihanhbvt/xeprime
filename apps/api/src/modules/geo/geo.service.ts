import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GEO_CACHE_TTL_DAYS,
  haversineKm,
  isValidGeoPoint,
  normalizeAddressKey,
  provinceNameFromAddress,
  roundCoord,
  type GeoPoint,
} from '@xeprime/domain';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GEO_PROVIDER,
  GeoQuotaExceededError,
  storablePlaceId,
  type GeocodeResult,
  type GeoProvider,
  type PlaceDetail,
  type PlaceSuggestion,
} from './geo-provider';

/**
 * Bao lâu thì coi một bản ghi cache là cũ — {@link GEO_CACHE_TTL_DAYS} (ADR 0061). Ở đây chỉ THÔI
 * ĐỌC bản ghi quá hạn; xoá hẳn là việc của job `geo-cache-cleanup` bên worker.
 */
const CACHE_TTL_MS = GEO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Toạ độ làm tròn về lưới ~110m trước khi băm — mọi lần hỏi lại cùng một chuyến đều trúng. */
const ROUTE_KEY_DECIMALS = 3;

/**
 * Cache GỢI Ý trong bộ nhớ tiến trình (ADR 0061 điều 3).
 *
 * Mỗi lượt gợi ý là một lượt gọi tính tiền. Cùng một chuỗi gõ lặp lại thật sự nhiều hơn tưởng:
 * TanStack Query hỏi lại khi người dùng quay lại ô, hai người cùng tìm "Nguyễn Văn Linh" ở một
 * tỉnh, người dùng xoá một ký tự rồi gõ lại. Mười phút đủ để bắt những lần lặp đó mà không giữ
 * một gợi ý cũ quá lâu; 500 mục là vài trăm KB — không đáng một bảng DB, và mất khi khởi động
 * lại cũng không sao.
 */
const SUGGEST_CACHE_TTL_MS = 10 * 60 * 1000;
const SUGGEST_CACHE_MAX = 500;
/** Điểm ưu tiên làm tròn ~1km: tâm tỉnh người dùng chọn — lệch vài trăm mét không đổi gợi ý. */
const SUGGEST_BIAS_DECIMALS = 2;

/**
 * Ảnh bản đồ tĩnh giữ trong bộ nhớ (ADR 0061 điều 1). Mỗi ảnh ~50–80KB; 200 ảnh ≈ 16MB — đủ cho
 * mọi chi nhánh đang có xe trên chợ ở giai đoạn pilot. Khởi động lại thì vẽ lại khi có người xem:
 * một giao dịch cho mỗi chi nhánh, và trình duyệt còn tự giữ ảnh (Cache-Control ở controller).
 */
const STATIC_MAP_CACHE_MAX = 200;
/** ~1m: hai lần hỏi cùng một chi nhánh luôn trúng một khoá; chi nhánh dời đi thì là ảnh mới. */
const STATIC_MAP_KEY_DECIMALS = 5;

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

export interface ResolvedAddress extends GeocodeResult {
  /** Địa chỉ này đến từ cache hay vừa hỏi nhà cung cấp — chỉ để log/đo, không lộ ra API. */
  cached: boolean;
}

/**
 * Kết quả tra địa chỉ — ba ngả PHÂN BIỆT ĐƯỢC, cùng lý do với {@link RoadDistanceResult}.
 *
 * "Không tìm thấy" là lỗi khách sửa được (gõ lại địa chỉ). "Không hỏi được" (key bị từ chối,
 * billing hết hạn, chạm trần quota) thì không — báo khách "địa chỉ không tìm thấy" lúc đó là đổ
 * lỗi cho họ về một sự cố của mình.
 */
export type GeocodeOutcome =
  | { outcome: 'ok'; address: ResolvedAddress }
  | { outcome: 'not_found' }
  | { outcome: 'unavailable' };

/** Chi tiết một địa điểm đã chọn — cùng ba ngả với {@link GeocodeOutcome}. */
export type PlaceDetailsOutcome =
  | { outcome: 'ok'; detail: PlaceDetail }
  | { outcome: 'not_found' }
  | { outcome: 'unavailable' };

/**
 * Kết quả đo đường bộ — bốn ngả PHÂN BIỆT ĐƯỢC, không phải một `number | null`.
 *
 * Một `null` duy nhất từng gộp ba chuyện khác hẳn nhau ở việc khách phải làm tiếp: đi quá xa,
 * không có đường bộ, và nhà cung cấp hỏng. Người gọi không có cách nào tách chúng ra, nên cả
 * ba cùng hiện một câu — câu đó nói "ngoài phạm vi" kể cả khi hệ thống không biết gì.
 */
export type RoadDistanceResult =
  | { outcome: 'ok'; distanceKm: number }
  /**
   * Đường chim bay đã vượt bán kính ⇒ đường bộ chắc chắn cũng vượt (đường bộ luôn ≥ chim bay).
   * Kèm luôn con số chim bay: nó KHÔNG phải quãng đường lái xe, nhưng là bằng chứng duy nhất
   * có trong tay và đủ để nói "cách hơn N km".
   */
  | { outcome: 'outside_radius'; straightLineKm: number }
  /** Nhà cung cấp trả lời nhưng không có tuyến đường bộ nối hai điểm. */
  | { outcome: 'no_route' }
  /** Chưa cấu hình, toạ độ hỏng, lỗi mạng, hết hạn mức — hệ thống không hỏi được. */
  | { outcome: 'unavailable' };

/**
 * Tra cứu vị trí cho luồng giao xe tận nơi.
 *
 * Ba việc, theo đúng thứ tự đắt dần: đọc cache → loại sớm bằng đường chim bay → hỏi nhà cung
 * cấp. Mỗi lượt hỏi nhà cung cấp là tiền thật (Vietmap tính theo giao dịch — ADR 0061), nên thứ tự đó
 * là toàn bộ lý do chi phí bản đồ giữ được ở mức thấp.
 *
 * **Không hàm nào ở đây ném ra ngoài.** Lỗi mạng, hết hạn mức, key sai — tất cả thành `null`
 * kèm một dòng log. Người gọi là luồng đặt xe của khách: bản đồ hỏng không được phép trở thành
 * "không đặt được xe".
 *
 * Là writer DUY NHẤT của `geocode_cache` và `geo_route_cache`. Worker chỉ XOÁ bản ghi quá
 * {@link GEO_CACHE_TTL_DAYS} ngày (`apps/worker/src/jobs/geo-cache-cleanup.ts`) — dọn theo điều
 * khoản, không ghi nội dung.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  /** Map giữ THỨ TỰ CHÈN — xoá phần tử đầu là bỏ mục cũ nhất. Xem {@link SUGGEST_CACHE_TTL_MS}. */
  private readonly suggestCache = new Map<string, { at: number; items: PlaceSuggestion[] }>();
  /** Ảnh bản đồ tĩnh đã vẽ — xem {@link staticMap}. Cùng kiểu LRU theo thứ tự chèn. */
  private readonly staticMapCache = new Map<string, Buffer>();
  /** Lượt vẽ ĐANG CHẠY theo khoá — trang xe mới lên chợ mà nhiều người mở cùng lúc chỉ tốn một lượt. */
  private readonly staticMapInflight = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEO_PROVIDER) private readonly provider: GeoProvider,
  ) {}

  /** Có nhà cung cấp bản đồ dùng được không — nơi gọi kiểm trước để trả trạng thái đúng. */
  get enabled(): boolean {
    return this.provider.enabled;
  }

  /**
   * Nhà cung cấp không trả lời được. Chạm trần lượt gọi trong ngày là trạng thái CHỦ ĐÍCH (nhà
   * cung cấp đã cảnh báo một lần) — ghi `debug`, không phải một `warn` cho mỗi lượt của một trận
   * quét endpoint.
   */
  private providerFailed(what: string, err: unknown): void {
    const line = `${what} (${this.provider.name}): ${String(err)}`;
    if (err instanceof GeoQuotaExceededError) this.logger.debug(line);
    else this.logger.warn(line);
  }

  private isFresh(fetchedAt: Date): boolean {
    return Date.now() - fetchedAt.getTime() < CACHE_TTL_MS;
  }

  /**
   * Địa chỉ chữ → toạ độ, ưu tiên cache.
   *
   * Trả `null` cho CẢ hai ca "không tìm thấy" và "không hỏi được" — người gọi phân biệt bằng
   * {@link enabled} và bằng ngữ cảnh, vì với giao diện thì cả hai đều dẫn tới "không có phí dự
   * kiến". Ca không tìm thấy được ghi vào cache (toạ độ NULL) để lần bấm lại không tốn request
   * thật: người gõ sai địa chỉ thường thử lại vài lần liền.
   */
  async geocode(rawAddress: string): Promise<ResolvedAddress | null> {
    const res = await this.geocodeOutcome(rawAddress);
    return res.outcome === 'ok' ? res.address : null;
  }

  /**
   * Như {@link geocode} nhưng nói RÕ vì sao không có toạ độ — cho nơi gọi phải trả lời khách
   * khác nhau giữa "địa chỉ không tra được" và "hệ thống không hỏi được".
   */
  async geocodeOutcome(rawAddress: string): Promise<GeocodeOutcome> {
    if (!this.provider.enabled) return { outcome: 'unavailable' };
    const address = rawAddress.trim();
    const key = address ? normalizeAddressKey(address) : '';
    if (!key) return { outcome: 'not_found' };
    const hash = sha256(`${this.provider.name}\n${key}`);

    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      if (cached.latitude == null || cached.longitude == null) return { outcome: 'not_found' };
      return {
        outcome: 'ok',
        address: {
          point: { lat: Number(cached.latitude), lng: Number(cached.longitude) },
          formattedAddress: cached.formattedAddress,
          placeId: cached.placeId,
          cached: true,
        },
      };
    }

    let result: GeocodeResult | null;
    try {
      result = await this.provider.geocode(address);
    } catch (err) {
      // Không ghi cache ca lỗi: lần sau có thể hỏi được, và nhớ một sự cố tạm thời trong 90
      // ngày thì tệ hơn nhiều so với việc tốn thêm một request.
      this.providerFailed('Geocode thất bại', err);
      return { outcome: 'unavailable' };
    }

    await this.writeGeocodeCache(hash, address, result);
    return result
      ? { outcome: 'ok', address: { ...result, cached: false } }
      : { outcome: 'not_found' };
  }

  private async writeGeocodeCache(
    hash: string,
    query: string,
    result: GeocodeResult | null,
  ): Promise<void> {
    const data = {
      provider: this.provider.name,
      query,
      latitude: result?.point.lat ?? null,
      longitude: result?.point.lng ?? null,
      formattedAddress: result?.formattedAddress ?? null,
      // `ref_id` của Vietmap có thể dài hơn cột — khoá băm vẫn là mã đầy đủ, chỉ cột tham chiếu bỏ trống.
      placeId: storablePlaceId(result?.placeId),
      // Ghi tay thay vì để `@default(now())`: nhánh `update` phải làm tươi lại mốc, nếu không
      // một bản ghi hết hạn sẽ mãi mãi hết hạn và cache thành vô dụng.
      fetchedAt: new Date(),
    };
    try {
      await this.prisma.geocodeCache.upsert({
        where: { addressHash: hash },
        create: { addressHash: hash, ...data },
        update: data,
      });
    } catch (err) {
      // Cache hỏng không được làm hỏng câu trả lời đã có trong tay.
      this.logger.warn(`Không ghi được geocode_cache: ${String(err)}`);
    }
  }

  /**
   * Gợi ý địa điểm cho ô nhập địa chỉ. Mảng RỖNG = không có gợi ý nào (câu trả lời); `null` =
   * KHÔNG HỎI ĐƯỢC (chưa cấu hình, key bị từ chối, hết hạn mức, lỗi mạng).
   *
   * Hai ca đó phải tách nhau vì client phản ứng ngược nhau: không có gợi ý thì người dùng gõ tiếp
   * hoặc tự đặt ghim, còn không hỏi được thì ô địa chỉ phải mở cho nhập tay — nếu không, một lần
   * nhà cung cấp từ chối key là mọi khách kẹt ở bước "chưa xác nhận địa chỉ" (ADR 0035 điều 6).
   *
   * Cùng chuỗi + cùng vùng trong 10 phút trả từ bộ nhớ (ADR 0061 điều 3). Chỗ tiết kiệm lớn còn
   * lại nằm ở client: debounce, độ dài tối thiểu và chỉ hỏi khi đã biết vùng.
   */
  async searchPlaces(
    query: string,
    biasPoint?: GeoPoint | null,
  ): Promise<PlaceSuggestion[] | null> {
    if (!this.provider.enabled) return null;
    const q = query.trim();
    if (!q) return [];

    const bias = biasPoint && isValidGeoPoint(biasPoint) ? biasPoint : null;
    const cacheKey = [
      normalizeAddressKey(q),
      bias ? `${roundCoord(bias.lat, SUGGEST_BIAS_DECIMALS)},${roundCoord(bias.lng, SUGGEST_BIAS_DECIMALS)}` : '',
    ].join('|');
    const hit = this.suggestCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SUGGEST_CACHE_TTL_MS) return hit.items;

    let items: PlaceSuggestion[];
    try {
      items = await this.provider.searchPlaces(q, bias);
    } catch (err) {
      this.providerFailed('Tìm địa điểm thất bại', err);
      return null;
    }

    this.suggestCache.delete(cacheKey);
    this.suggestCache.set(cacheKey, { at: Date.now(), items });
    while (this.suggestCache.size > SUGGEST_CACHE_MAX) {
      const oldest = this.suggestCache.keys().next().value;
      if (oldest === undefined) break;
      this.suggestCache.delete(oldest);
    }
    return items;
  }

  /**
   * Chi tiết một địa điểm đã chọn. `null` = không tra được HOẶC không còn tồn tại — nơi cần phân
   * biệt hai ca đó gọi {@link placeDetailsOutcome}.
   */
  async placeDetails(placeId: string): Promise<PlaceDetail | null> {
    const res = await this.placeDetailsOutcome(placeId);
    return res.outcome === 'ok' ? res.detail : null;
  }

  /**
   * Chi tiết một địa điểm đã chọn, nói RÕ vì sao không có — cùng lý do với {@link GeocodeOutcome}:
   * mã không ra gì thì khách chọn lại được, còn nhà cung cấp không trả lời (hết giao dịch, chạm
   * trần) thì bắt khách "chọn lại" là một vòng lặp không lối ra — ô địa chỉ phải mở cho nhập tay.
   *
   * Ghi vào `geocode_cache` dưới khoá `place:<id>` — mã địa điểm là khoá ỔN ĐỊNH (khác chuỗi
   * địa chỉ gõ tay), nên đây là chỗ cache thật sự có ích: mở lại form sửa chi nhánh không phải
   * hỏi lại nhà cung cấp về cùng một địa điểm, và hai khách chọn cùng một gợi ý chỉ tốn một lượt
   * Place (gợi ý của Vietmap không kèm toạ độ — ADR 0061 điều 3). Ca "không ra gì" cũng được nhớ:
   * một mã hỏng gửi lại nhiều lần không được thành nhiều lượt tính tiền.
   */
  async placeDetailsOutcome(placeId: string): Promise<PlaceDetailsOutcome> {
    if (!this.provider.enabled) return { outcome: 'unavailable' };
    const id = placeId.trim();
    if (!id) return { outcome: 'not_found' };

    const hash = sha256(`${this.provider.name}\nplace:${id}`);
    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      if (cached.latitude == null || cached.longitude == null) return { outcome: 'not_found' };
      return {
        outcome: 'ok',
        detail: {
          placeId: id,
          point: { lat: Number(cached.latitude), lng: Number(cached.longitude) },
          formattedAddress: cached.formattedAddress,
          /*
           * Tỉnh đọc lại từ chính địa chỉ đầy đủ (tỉnh đứng cuối, trước tên quốc gia) — không thêm
           * cột vào bảng cache, và luồng khách thuê vẫn có tỉnh để gợi ý (ADR 0042).
           */
          administrativeArea: provinceNameFromAddress(cached.formattedAddress),
          locality: null,
        },
      };
    }

    let detail: PlaceDetail | null;
    try {
      detail = await this.provider.placeDetails(id);
    } catch (err) {
      // Không ghi cache ca lỗi — xem `geocodeOutcome`.
      this.providerFailed('Tra chi tiết địa điểm thất bại', err);
      return { outcome: 'unavailable' };
    }

    await this.writeGeocodeCache(
      hash,
      `place:${id}`,
      detail ? { point: detail.point, formattedAddress: detail.formattedAddress, placeId: id } : null,
    );
    return detail ? { outcome: 'ok', detail } : { outcome: 'not_found' };
  }

  /** Toạ độ → địa chỉ chữ, để người dùng đọc lại cái ghim vừa kéo. Lỗi → `null`. */
  async reverseGeocode(point: GeoPoint): Promise<ResolvedAddress | null> {
    if (!this.provider.enabled || !isValidGeoPoint(point)) return null;

    const key = `${roundCoord(point.lat, ROUTE_KEY_DECIMALS)},${roundCoord(point.lng, ROUTE_KEY_DECIMALS)}`;
    const hash = sha256(`${this.provider.name}\nreverse:${key}`);

    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      if (cached.formattedAddress == null) return null;
      return {
        point,
        formattedAddress: cached.formattedAddress,
        // Mã do người hỏi ĐẦU TIÊN trong ô lưới để lại — không nói gì về cái ghim của người này.
        placeId: null,
        administrativeArea: provinceNameFromAddress(cached.formattedAddress),
        cached: true,
      };
    }

    let result: GeocodeResult | null;
    try {
      result = await this.provider.reverseGeocode(point);
    } catch (err) {
      this.providerFailed('Reverse geocode thất bại', err);
      return null;
    }

    await this.writeGeocodeCache(hash, `reverse:${key}`, result);
    if (!result) return null;
    return {
      ...result,
      administrativeArea:
        result.administrativeArea ?? provinceNameFromAddress(result.formattedAddress),
      cached: false,
    };
  }

  /**
   * Khoảng cách đường bộ một chiều (km), ưu tiên cache.
   *
   * `maxRadiusKm` là **bộ lọc trước, không phải bộ lọc kết quả**: đường chim bay luôn ngắn hơn
   * hoặc bằng đường bộ, nên vượt bán kính theo đường chim bay là bằng chứng chắc chắn rằng
   * đường bộ cũng vượt — kết luận được ngay mà không tốn request nào. Truyền nó vào bất cứ khi
   * nào biết, đó là chỗ tiết kiệm hạn mức lớn nhất.
   *
   * Trả về {@link RoadDistanceResult} chứ không phải `number | null`: ba ngả hỏng có ba câu
   * khác nhau với khách, và người gọi không suy ngược được chúng từ một `null`.
   */
  async roadDistance(
    origin: GeoPoint,
    destination: GeoPoint,
    maxRadiusKm?: number | null,
  ): Promise<RoadDistanceResult> {
    if (!this.provider.enabled) return { outcome: 'unavailable' };
    if (!isValidGeoPoint(origin) || !isValidGeoPoint(destination)) {
      return { outcome: 'unavailable' };
    }

    if (maxRadiusKm != null) {
      const straightLineKm = haversineKm(origin, destination);
      if (straightLineKm > maxRadiusKm) return { outcome: 'outside_radius', straightLineKm };
    }

    const from = { lat: roundCoord(origin.lat, ROUTE_KEY_DECIMALS), lng: roundCoord(origin.lng, ROUTE_KEY_DECIMALS) };
    const to = {
      lat: roundCoord(destination.lat, ROUTE_KEY_DECIMALS),
      lng: roundCoord(destination.lng, ROUTE_KEY_DECIMALS),
    };
    const hash = sha256(`${this.provider.name}\n${from.lat},${from.lng}\n${to.lat},${to.lng}`);

    const cached = await this.prisma.geoRouteCache.findUnique({ where: { routeHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      // Bản ghi chỉ được viết SAU một câu trả lời thật, nên `distanceKm` null ở đây nghĩa là
      // nhà cung cấp đã nói "không có tuyến" — không phải "chưa hỏi được".
      return cached.distanceKm == null
        ? { outcome: 'no_route' }
        : { outcome: 'ok', distanceKm: Number(cached.distanceKm) };
    }

    let distanceKm: number | null;
    try {
      distanceKm = await this.provider.roadDistanceKm(origin, destination);
    } catch (err) {
      this.providerFailed('Tra khoảng cách thất bại', err);
      return { outcome: 'unavailable' };
    }

    const data = {
      provider: this.provider.name,
      originLat: from.lat,
      originLng: from.lng,
      destLat: to.lat,
      destLng: to.lng,
      distanceKm,
      fetchedAt: new Date(),
    };
    try {
      await this.prisma.geoRouteCache.upsert({
        where: { routeHash: hash },
        create: { routeHash: hash, ...data },
        update: data,
      });
    } catch (err) {
      this.logger.warn(`Không ghi được geo_route_cache: ${String(err)}`);
    }

    return distanceKm == null ? { outcome: 'no_route' } : { outcome: 'ok', distanceKm };
  }

  /**
   * Ảnh bản đồ TĨNH (PNG) quanh một điểm — để XEM, không tương tác. `null` = không vẽ được
   * (chưa cấu hình, nhà cung cấp lỗi, chạm trần); nơi gọi trả 404 và web ẩn khung ảnh.
   *
   * Nơi gọi chỉ được đưa vào toạ độ của một thực thể CÓ THẬT (chi nhánh của một xe trên chợ, chi
   * nhánh của chính gian hàng) — không bao giờ toạ độ do client gửi lên. Nhờ vậy tập ảnh có thể vẽ
   * bị chặn bởi số chi nhánh, và cache bên dưới biến chi phí thành một lượt cho mỗi chi nhánh.
   */
  /**
   * Ảnh bản đồ tĩnh của một địa điểm ĐÃ ĐƯỢC CHỌN — ô địa chỉ hiện nó ngay dưới dòng vừa chọn
   * (ADR 0061 điều 1). `null` = không có gì để vẽ; nơi gọi trả 404 và web ẩn khung ảnh.
   *
   * Chỉ vẽ cho mã ĐÃ có toạ độ trong cache (`placeDetailsOutcome` vừa tra cho chính
   * lượt chọn đó) và KHÔNG tra chi tiết ở đây: mã là thứ client gửi lên, và tra-rồi-vẽ cho mọi mã
   * là để ai cũng tiêu tiền bằng những mã bịa. Mã quá hạn cache hay mã cũ thời Geoapify thì không có
   * ảnh — ô địa chỉ vẫn đủ dùng.
   */
  async placeMap(placeId: string): Promise<Buffer | null> {
    const id = placeId.trim();
    if (!id || !this.provider.enabled) return null;
    const hash = sha256(`${this.provider.name}\nplace:${id}`);
    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (
      !cached ||
      !this.isFresh(cached.fetchedAt) ||
      cached.latitude == null ||
      cached.longitude == null
    ) {
      return null;
    }
    const point = { lat: Number(cached.latitude), lng: Number(cached.longitude) };
    return this.staticMap(point, cached.formattedAddress?.trim() || `${point.lat}, ${point.lng}`);
  }

  async staticMap(point: GeoPoint, label: string): Promise<Buffer | null> {
    if (!this.provider.enabled || !isValidGeoPoint(point)) return null;
    const key = [
      roundCoord(point.lat, STATIC_MAP_KEY_DECIMALS),
      roundCoord(point.lng, STATIC_MAP_KEY_DECIMALS),
      label.trim(),
    ].join('|');

    const hit = this.staticMapCache.get(key);
    if (hit) {
      // Đưa xuống cuối: Map giữ thứ tự chèn, mục ở đầu là mục lâu không ai xem nhất.
      this.staticMapCache.delete(key);
      this.staticMapCache.set(key, hit);
      return hit;
    }
    const running = this.staticMapInflight.get(key);
    if (running) return running;

    const job = this.provider
      .staticMapPng(point, label.trim())
      .then((png) => {
        this.staticMapCache.set(key, png);
        while (this.staticMapCache.size > STATIC_MAP_CACHE_MAX) {
          const oldest = this.staticMapCache.keys().next().value;
          if (oldest === undefined) break;
          this.staticMapCache.delete(oldest);
        }
        return png;
      })
      .catch((err: unknown) => {
        this.providerFailed('Vẽ bản đồ tĩnh thất bại', err);
        return null;
      })
      .finally(() => this.staticMapInflight.delete(key));
    this.staticMapInflight.set(key, job);
    return job;
  }

}
