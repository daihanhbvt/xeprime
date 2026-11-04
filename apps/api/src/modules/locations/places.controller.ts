import { Controller, Get, Header, NotFoundException, Query, StreamableFile } from '@nestjs/common';
import { ACCOUNT_REALM_VALUES, API_ERROR_CODE } from '@xeprime/types';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { guessAddressLine, provinceCenter } from '@xeprime/domain';
import { Public, Realms } from '../../common/decorators';
import { PRIVATE_STATIC_MAP_CACHE_CONTROL } from '../../common/http-cache';
import { storablePlaceId } from '../geo/geo-provider';
import { GeoService } from '../geo/geo.service';
import {
  PlaceDetailQueryDto,
  PlaceDetailResultDto,
  PlaceSearchQueryDto,
  PlaceSearchResultDto,
  ReverseGeocodeQueryDto,
} from './dto/place.dto';
import { ProvincesService } from './provinces.service';
import { WardsService } from './wards.service';

/**
 * Tìm địa điểm / tra địa chỉ ngược cho ô nhập ĐỊA CHỈ — proxy qua backend.
 *
 * **Vì sao đi vòng qua server thay vì gọi thẳng nhà cung cấp từ trình duyệt.** Khoá bản đồ có
 * hạn mức theo request. Một khoá nhúng trong bundle web là một khoá ai cũng sao chép được, và
 * tiền là của mình. Cùng kỷ luật với ADR 0018/0061: `VIETMAP_API_KEY` giới hạn theo IP, không
 * bao giờ đi qua `NEXT_PUBLIC_*`. Đi vòng qua đây còn cho ba thứ miễn phí: rate limit thật, cache
 * dùng chung giữa mọi người dùng, và MỘT điểm để đổi nhà cung cấp.
 *
 * **Không endpoint nào ở đây trả lỗi vì bản đồ.** Chưa cấu hình khoá, hết hạn mức, nhà cung cấp
 * chậm — tất cả thành `available: false` với danh sách rỗng, và giao diện rơi về nhập tay. Người
 * đang gọi là khách điền form đặt xe: bản đồ hỏng không được phép thành "không đặt được xe".
 *
 * `@Public` vì luồng đặt xe của khách vãng lai cũng nhập địa chỉ giao xe. Cái chặn là
 * `@Throttle`, và nó chặt hơn hẳn mức chung 120 req/phút vì đây là tiền chứ không phải CPU.
 */
@ApiTags('places')
@Controller('places')
@Realms(...ACCOUNT_REALM_VALUES)
export class PlacesController {
  constructor(
    private readonly geo: GeoService,
    private readonly provinces: ProvincesService,
    private readonly wards: WardsService,
  ) {}

  /**
   * Gợi ý khi người dùng gõ. Client phải debounce — `@Throttle` ở đây là trần cứng, không phải
   * cơ chế tiết kiệm chính.
   *
   * `available: false` cả khi nhà cung cấp CÓ cấu hình nhưng không trả lời được (key bị từ chối,
   * hết hạn mức): đó là tín hiệu để ô địa chỉ mở cho nhập tay. Trả `available: true` kèm danh sách
   * rỗng lúc đó là bắt khách chọn từ một danh sách không bao giờ có gì.
   */
  @Get('search')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Gợi ý địa điểm theo chữ đang gõ (giới hạn trong Việt Nam)' })
  @ApiOkResponse({ type: PlaceSearchResultDto })
  async search(@Query() query: PlaceSearchQueryDto): Promise<PlaceSearchResultDto> {
    const scope = await this.searchScope(query.provinceCode, query.wardCode);
    const bias =
      query.lat != null && query.lng != null
        ? { lat: query.lat, lng: query.lng }
        : provinceCenter(scope?.provinceCode);
    /*
     * Thử truy vấn CÓ ràng buộc trước; rỗng thì hỏi lại đúng chữ người dùng gõ. Autocomplete khớp
     * theo TỪ, và tên xã mới (sau 01/07/2025) có thể chưa có trong dữ liệu bản đồ — một từ thừa là
     * đủ làm rỗng cả danh sách. Lượt hỏi lại chỉ tốn khi lượt đầu không ra gì.
     */
    const scoped = scopedQuery(query.q, scope);
    let items = await this.geo.searchPlaces(scoped, bias);
    if (items && items.length === 0 && scoped !== query.q) {
      items = await this.geo.searchPlaces(query.q, bias);
    }
    if (!items) return { items: [], available: false, outOfProvinceCount: 0 };
    if (!scope) return { items, available: true, outOfProvinceCount: 0 };

    /*
     * Loại gợi ý NHẬN RA ĐƯỢC là thuộc tỉnh khác (ADR 0077). Tỉnh của một gợi ý đọc từ đoạn CUỐI
     * dòng phụ qua bảng bí danh — bảng đó có cả tên trước sáp nhập, nên "Bình Dương" vẫn ra mã
     * TP.HCM. Không quy được thì GIỮ: một gợi ý không rõ tỉnh không phải bằng chứng nó sai tỉnh.
     */
    const codes = await Promise.all(
      items.map((it) => this.provinces.resolveCode(lastSegment(it.secondaryText))),
    );
    const kept = items.filter((_, i) => !codes[i] || codes[i] === scope.provinceCode);
    return { items: kept, available: true, outOfProvinceCount: items.length - kept.length };
  }

  /** Tên tỉnh/xã đã chọn để ràng buộc truy vấn; mã sai hoặc xã khác tỉnh ⇒ bỏ phần đó. */
  private async searchScope(
    provinceCode: string | undefined,
    wardCode: string | undefined,
  ): Promise<SearchScope | null> {
    if (!provinceCode) return null;
    const province = await this.provinces.assertExists(provinceCode).catch(() => null);
    if (!province) return null;
    const [ward] = wardCode ? await this.wards.findByCodes([wardCode]) : [];
    return {
      provinceCode: province.code,
      provinceName: province.name,
      wardName: ward && ward.provinceCode === province.code ? ward.name : null,
    };
  }

  /** Một gợi ý đã chọn → toạ độ + gợi ý tỉnh + gợi ý phần "số nhà, đường". */
  @Get('detail')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Chi tiết một địa điểm đã chọn (toạ độ, địa chỉ, tỉnh gợi ý)' })
  @ApiOkResponse({ type: PlaceDetailResultDto })
  async detail(@Query() query: PlaceDetailQueryDto): Promise<PlaceDetailResultDto> {
    /*
     * Nhà cung cấp không trả lời (hết giao dịch, chạm trần) ⇒ `available: false`, KHÔNG phải "mã
     * không ra gì": gợi ý vẫn có thể đến từ cache 10 phút trong khi mọi lượt Place đều hỏng, và
     * bảo khách "chọn lại" lúc đó là một vòng lặp. Giao diện chốt dòng đã chọn như địa chỉ gõ tay.
     */
    const res = await this.geo.placeDetailsOutcome(query.placeId);
    const wardHint = (text: string | null) =>
      query.provinceCode
        ? this.wards.matchInProvince(query.provinceCode, text)
        : Promise.resolve(null);
    if (res.outcome === 'unavailable') return { place: null, available: false };
    if (res.outcome === 'not_found') return { place: null, available: true };
    const { detail } = res;

    return {
      available: true,
      place: {
        // Mã quá dài để lưu (`ref_id` của Vietmap) thì trả `null`: form ghi thẳng mã này xuống
        // cột `VarChar(255)`, còn toạ độ — thứ hệ thống thật sự dùng — vẫn đủ.
        placeId: storablePlaceId(detail.placeId),
        latitude: String(detail.point.lat),
        longitude: String(detail.point.lng),
        formattedAddress: detail.formattedAddress,
        /*
         * Quy tên tỉnh của nhà cung cấp về mã chuẩn QUA BẢNG BÍ DANH, đúng đường mà dữ liệu tự
         * do cũ đi. Bảng đó đã chứa tên tỉnh TRƯỚC sáp nhập, nên "Tỉnh Bình Dương" trong dữ liệu
         * bản đồ vẫn ra mã của TP.HCM hiện nay. Không quy được thì trả `null` — bộ chọn để trống
         * và người dùng chọn, không bao giờ đoán bừa một tỉnh mặc định.
         */
        suggestedProvinceCode: await this.provinces.resolveCode(detail.administrativeArea),
        suggestedAddressLine: guessAddressLine(detail.formattedAddress) || null,
        suggestedWardCode: await wardHint(detail.formattedAddress),
      },
    };
  }

  /**
   * Ảnh bản đồ tĩnh (PNG) của một địa điểm VỪA ĐƯỢC CHỌN — ô địa chỉ hiện nó ngay dưới dòng đã chọn
   * để người dùng nhìn lại "đúng chỗ này chưa" (ADR 0061 điều 1: xem được, không tương tác).
   *
   * Chỉ vẽ cho mã đã có toạ độ trong cache (tức đã qua `/places/detail`), không tra thêm gì: mã là
   * thứ client gửi lên. Cache-Control `private`: đây thường là địa chỉ giao xe của một khách.
   */
  @Get('map')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', PRIVATE_STATIC_MAP_CACHE_CONTROL)
  @ApiOperation({ summary: 'Ảnh bản đồ tĩnh (PNG) của một địa điểm vừa chọn' })
  @ApiProduces('image/png')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async map(@Query() query: PlaceDetailQueryDto): Promise<StreamableFile> {
    const png = await this.geo.placeMap(query.placeId);
    if (!png) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không có bản đồ cho địa điểm này',
      });
    }
    return new StreamableFile(png, { type: 'image/png', length: png.length });
  }

  /**
   * Toạ độ (người dùng vừa kéo ghim) → địa chỉ chữ, để họ đọc lại "chỗ này là đâu" trước khi lưu.
   * Người gọi là app native (vị trí thiết bị, ghim trên bản đồ của app) — web không vẽ bản đồ nên
   * không có ghim nào để kéo (ADR 0061 điều 1).
   *
   * Toạ độ trả về LUÔN là toạ độ đã gửi lên, không phải toạ độ bản đồ gợi ý: cái ghim là thứ
   * người dùng chủ động đặt, còn địa chỉ chữ chỉ là chú thích cho nó.
   */
  @Get('reverse')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tra địa chỉ chữ từ toạ độ ghim' })
  @ApiOkResponse({ type: PlaceDetailResultDto })
  async reverse(@Query() query: ReverseGeocodeQueryDto): Promise<PlaceDetailResultDto> {
    if (!this.geo.enabled) return { place: null, available: false };

    const resolved = await this.geo.reverseGeocode({ lat: query.lat, lng: query.lng });
    if (!resolved) return { place: null, available: true };

    return {
      available: true,
      place: {
        placeId: resolved.placeId,
        latitude: String(query.lat),
        longitude: String(query.lng),
        formattedAddress: resolved.formattedAddress,
        /*
         * Tỉnh của điểm này, quy qua bảng bí danh như ở `detail` — chỉ là GỢI Ý. App native dùng
         * nó để đoán tỉnh từ vị trí thiết bị. Không quy được thì `null`.
         */
        suggestedProvinceCode: await this.provinces.resolveCode(
          resolved.administrativeArea ?? null,
        ),
        suggestedAddressLine: guessAddressLine(resolved.formattedAddress) || null,
        suggestedWardCode: null,
      },
    };
  }
}

interface SearchScope {
  provinceCode: string;
  provinceName: string;
  wardName: string | null;
}

/**
 * Truy vấn kèm tên xã + tỉnh đã chọn: "41 Đinh Văn Chấp" ở Cẩm Lệ, Đà Nẵng thành
 * "41 Đinh Văn Chấp, Cẩm Lệ, Đà Nẵng" (ADR 0077). Người dùng tự gõ tên tỉnh rồi thì không nối lại.
 */
function scopedQuery(q: string, scope: SearchScope | null): string {
  if (!scope) return q;
  const lower = q.toLocaleLowerCase('vi');
  const parts = [scope.wardName, scope.provinceName].filter(
    (p): p is string => Boolean(p) && !lower.includes(p!.toLocaleLowerCase('vi')),
  );
  return parts.length > 0 ? [q, ...parts].join(', ') : q;
}

function lastSegment(text: string | null): string | null {
  const seg = text
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return seg ?? null;
}
