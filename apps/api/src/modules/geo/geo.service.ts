import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GEO_CACHE_TTL_DAYS,
  haversineKm,
  isValidGeoPoint,
  normalizeAddressKey,
  roundCoord,
  type GeoPoint,
} from '@xeprime/domain';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GEO_PROVIDER,
  type GeocodeResult,
  type GeoProvider,
  type PlaceDetail,
  type PlaceSuggestion,
} from './geo-provider';

/**
 * Bao lâu thì coi một bản ghi cache là cũ — {@link GEO_CACHE_TTL_DAYS}, mốc điều khoản Google cho
 * phép lưu toạ độ (ADR 0059). Ở đây chỉ THÔI ĐỌC bản ghi quá hạn; xoá hẳn là việc của job
 * `geo-cache-cleanup` bên worker. Mốc này cũng vừa đủ để một địa chỉ bị đặt lại tên đường không
 * nằm sai chỗ mãi mãi trong cache của mình.
 */
const CACHE_TTL_MS = GEO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Toạ độ làm tròn về lưới ~110m trước khi băm — mọi lần hỏi lại cùng một chuyến đều trúng. */
const ROUTE_KEY_DECIMALS = 3;

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
 * cấp. Thứ tự đó là toàn bộ lý do hạn mức miễn phí đủ dùng.
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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEO_PROVIDER) private readonly provider: GeoProvider,
  ) {}

  /** Có nhà cung cấp bản đồ dùng được không — nơi gọi kiểm trước để trả trạng thái đúng. */
  get enabled(): boolean {
    return this.provider.enabled;
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
      // Không ghi cache ca lỗi: lần sau có thể hỏi được, và nhớ một sự cố tạm thời trong 30
      // ngày thì tệ hơn nhiều so với việc tốn thêm một request.
      this.logger.warn(`Geocode thất bại (${this.provider.name}): ${String(err)}`);
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
      placeId: result?.placeId ?? null,
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
   * Google từ chối key là mọi khách kẹt ở bước "chưa xác nhận địa chỉ" (ADR 0035 điều 6).
   *
   * KHÔNG cache: gợi ý phụ thuộc từng ký tự người dùng vừa gõ, nên tỉ lệ trúng cache gần bằng
   * không trong khi mỗi dòng cache là một bản ghi rác. Chỗ tiết kiệm thật nằm ở client —
   * debounce và độ dài tối thiểu trước khi hỏi.
   */
  async searchPlaces(
    query: string,
    biasPoint?: GeoPoint | null,
  ): Promise<PlaceSuggestion[] | null> {
    if (!this.provider.enabled) return null;
    const q = query.trim();
    if (!q) return [];
    try {
      return await this.provider.searchPlaces(q, biasPoint ?? null);
    } catch (err) {
      this.logger.warn(`Tìm địa điểm thất bại (${this.provider.name}): ${String(err)}`);
      return null;
    }
  }

  /**
   * Chi tiết một địa điểm đã chọn. `null` = không tra được HOẶC không còn tồn tại.
   *
   * Ghi vào `geocode_cache` dưới khoá `place:<id>` — mã địa điểm là khoá ỔN ĐỊNH (khác chuỗi
   * địa chỉ gõ tay), nên đây là chỗ cache thật sự có ích: mở lại form sửa chi nhánh không phải
   * hỏi lại Google về cùng một địa điểm.
   */
  async placeDetails(placeId: string): Promise<PlaceDetail | null> {
    const id = placeId.trim();
    if (!id || !this.provider.enabled) return null;

    const hash = sha256(`${this.provider.name}\nplace:${id}`);
    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt) && cached.latitude != null && cached.longitude != null) {
      return {
        placeId: id,
        point: { lat: Number(cached.latitude), lng: Number(cached.longitude) },
        formattedAddress: cached.formattedAddress,
        // Thành phần hành chính KHÔNG cache: chúng chỉ dùng để gợi ý bộ chọn nhảy tới đúng tỉnh
        // ở ngay lần chọn đó, và thêm hai cột vào bảng cache cho một gợi ý là không đáng.
        administrativeArea: null,
        locality: null,
      };
    }

    let detail: PlaceDetail | null;
    try {
      detail = await this.provider.placeDetails(id);
    } catch (err) {
      this.logger.warn(`Tra chi tiết địa điểm thất bại (${this.provider.name}): ${String(err)}`);
      return null;
    }

    await this.writeGeocodeCache(
      hash,
      `place:${id}`,
      detail ? { point: detail.point, formattedAddress: detail.formattedAddress, placeId: id } : null,
    );
    return detail;
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
        placeId: cached.placeId,
        cached: true,
      };
    }

    let result: GeocodeResult | null;
    try {
      result = await this.provider.reverseGeocode(point);
    } catch (err) {
      this.logger.warn(`Reverse geocode thất bại (${this.provider.name}): ${String(err)}`);
      return null;
    }

    await this.writeGeocodeCache(hash, `reverse:${key}`, result);
    return result ? { ...result, cached: false } : null;
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
      this.logger.warn(`Tra khoảng cách thất bại (${this.provider.name}): ${String(err)}`);
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
}
