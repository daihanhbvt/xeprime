import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  haversineKm,
  isValidGeoPoint,
  normalizeAddressKey,
  roundCoord,
  type GeoPoint,
} from '@xeprime/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { GEO_PROVIDER, type GeocodeResult, type GeoProvider } from './geo-provider';

/**
 * Bao lâu thì coi một bản ghi cache là cũ.
 *
 * KHÔNG phải con số tuỳ hứng: điều khoản của nhà cung cấp bản đồ giới hạn thời gian được lưu
 * toạ độ họ trả về, và 30 ngày là mốc quen thuộc của giới hạn đó. Nó cũng vừa đủ để một địa chỉ
 * bị đặt lại tên đường không nằm sai chỗ mãi mãi trong cache của mình.
 */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Toạ độ làm tròn về lưới ~110m trước khi băm — mọi lần hỏi lại cùng một chuyến đều trúng. */
const ROUTE_KEY_DECIMALS = 3;

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

export interface ResolvedAddress extends GeocodeResult {
  /** Địa chỉ này đến từ cache hay vừa hỏi nhà cung cấp — chỉ để log/đo, không lộ ra API. */
  cached: boolean;
}

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
 * Là writer DUY NHẤT của `geocode_cache` và `geo_route_cache`.
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
    const address = rawAddress.trim();
    if (!address || !this.provider.enabled) return null;

    const key = normalizeAddressKey(address);
    if (!key) return null;
    const hash = sha256(`${this.provider.name}\n${key}`);

    const cached = await this.prisma.geocodeCache.findUnique({ where: { addressHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      if (cached.latitude == null || cached.longitude == null) return null;
      return {
        point: { lat: Number(cached.latitude), lng: Number(cached.longitude) },
        formattedAddress: cached.formattedAddress,
        placeId: cached.placeId,
        cached: true,
      };
    }

    let result: GeocodeResult | null;
    try {
      result = await this.provider.geocode(address);
    } catch (err) {
      // Không ghi cache ca lỗi: lần sau có thể hỏi được, và nhớ một sự cố tạm thời trong 30
      // ngày thì tệ hơn nhiều so với việc tốn thêm một request.
      this.logger.warn(`Geocode thất bại (${this.provider.name}): ${String(err)}`);
      return null;
    }

    await this.writeGeocodeCache(hash, address, result);
    return result ? { ...result, cached: false } : null;
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
   * Khoảng cách đường bộ một chiều (km), ưu tiên cache.
   *
   * `maxRadiusKm` là **bộ lọc trước, không phải bộ lọc kết quả**: đường chim bay luôn ngắn hơn
   * hoặc bằng đường bộ, nên vượt bán kính theo đường chim bay là bằng chứng chắc chắn rằng
   * đường bộ cũng vượt — kết luận được ngay mà không tốn request nào. Truyền nó vào bất cứ khi
   * nào biết, đó là chỗ tiết kiệm hạn mức lớn nhất.
   */
  async roadDistanceKm(
    origin: GeoPoint,
    destination: GeoPoint,
    maxRadiusKm?: number | null,
  ): Promise<number | null> {
    if (!this.provider.enabled) return null;
    if (!isValidGeoPoint(origin) || !isValidGeoPoint(destination)) return null;

    if (maxRadiusKm != null && haversineKm(origin, destination) > maxRadiusKm) {
      return null;
    }

    const from = { lat: roundCoord(origin.lat, ROUTE_KEY_DECIMALS), lng: roundCoord(origin.lng, ROUTE_KEY_DECIMALS) };
    const to = {
      lat: roundCoord(destination.lat, ROUTE_KEY_DECIMALS),
      lng: roundCoord(destination.lng, ROUTE_KEY_DECIMALS),
    };
    const hash = sha256(`${this.provider.name}\n${from.lat},${from.lng}\n${to.lat},${to.lng}`);

    const cached = await this.prisma.geoRouteCache.findUnique({ where: { routeHash: hash } });
    if (cached && this.isFresh(cached.fetchedAt)) {
      return cached.distanceKm == null ? null : Number(cached.distanceKm);
    }

    let distanceKm: number | null;
    try {
      distanceKm = await this.provider.roadDistanceKm(origin, destination);
    } catch (err) {
      this.logger.warn(`Tra khoảng cách thất bại (${this.provider.name}): ${String(err)}`);
      return null;
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

    return distanceKm;
  }
}
