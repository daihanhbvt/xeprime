import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { guessAddressLine } from '@xeprime/domain';
import { Public } from '../../common/decorators';
import { GeoService } from '../geo/geo.service';
import {
  PlaceDetailQueryDto,
  PlaceDetailResultDto,
  PlaceSearchQueryDto,
  PlaceSearchResultDto,
  ReverseGeocodeQueryDto,
} from './dto/place.dto';
import { ProvincesService } from './provinces.service';

/**
 * Tìm địa điểm / tra địa chỉ ngược cho ô nhập ĐỊA CHỈ — proxy qua backend.
 *
 * **Vì sao đi vòng qua server thay vì gọi thẳng nhà cung cấp từ trình duyệt.** Khoá bản đồ có
 * hạn mức theo request. Một khoá nhúng trong bundle web là một khoá ai cũng sao chép được, và
 * hạn mức cạn là của mình. Cùng kỷ luật với ADR 0018/0037: `GEOAPIFY_API_KEY` khoá theo IP,
 * không bao giờ đi qua `NEXT_PUBLIC_*`. Đi vòng qua đây còn cho ba thứ miễn phí: rate limit thật,
 * cache dùng chung giữa mọi người dùng, và MỘT điểm để đổi nhà cung cấp (Goong, OSRM tự host).
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
export class PlacesController {
  constructor(
    private readonly geo: GeoService,
    private readonly provinces: ProvincesService,
  ) {}

  /**
   * Gợi ý khi người dùng gõ. Client phải debounce — `@Throttle` ở đây là trần cứng, không phải
   * cơ chế tiết kiệm chính.
   */
  @Get('search')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Gợi ý địa điểm theo chữ đang gõ (giới hạn trong Việt Nam)' })
  @ApiOkResponse({ type: PlaceSearchResultDto })
  async search(@Query() query: PlaceSearchQueryDto): Promise<PlaceSearchResultDto> {
    if (!this.geo.enabled) return { items: [], available: false };
    const bias = query.lat != null && query.lng != null ? { lat: query.lat, lng: query.lng } : null;
    return { items: await this.geo.searchPlaces(query.q, bias), available: true };
  }

  /** Một gợi ý đã chọn → toạ độ + gợi ý tỉnh + gợi ý phần "số nhà, đường". */
  @Get('detail')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Chi tiết một địa điểm đã chọn (toạ độ, địa chỉ, tỉnh gợi ý)' })
  @ApiOkResponse({ type: PlaceDetailResultDto })
  async detail(@Query() query: PlaceDetailQueryDto): Promise<PlaceDetailResultDto> {
    if (!this.geo.enabled) return { place: null, available: false };

    const detail = await this.geo.placeDetails(query.placeId);
    if (!detail) return { place: null, available: true };

    return {
      available: true,
      place: {
        placeId: detail.placeId,
        latitude: String(detail.point.lat),
        longitude: String(detail.point.lng),
        formattedAddress: detail.formattedAddress,
        /*
         * Quy tên tỉnh của nhà cung cấp về mã chuẩn QUA BẢNG BÍ DANH, đúng đường mà dữ liệu tự
         * do cũ đi. Bảng đó đã chứa tên tỉnh TRƯỚC sáp nhập, nên "Tỉnh Bình Dương" trong dữ liệu
         * Google vẫn ra mã của TP.HCM hiện nay. Không quy được thì trả `null` — bộ chọn để trống
         * và người dùng chọn, không bao giờ đoán bừa một tỉnh mặc định.
         */
        suggestedProvinceCode: await this.provinces.resolveCode(detail.administrativeArea),
        suggestedAddressLine: guessAddressLine(detail.formattedAddress) || null,
      },
    };
  }

  /**
   * Toạ độ (người dùng vừa kéo ghim) → địa chỉ chữ, để họ đọc lại "chỗ này là đâu" trước khi lưu.
   *
   * Toạ độ trả về LUÔN là toạ độ đã gửi lên, không phải toạ độ Google gợi ý: cái ghim là thứ
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
        // Reverse geocode trả chuỗi đầy đủ chứ không tách thành phần, nên không có tên tỉnh
        // riêng để quy. Bộ chọn tỉnh giữ nguyên lựa chọn hiện tại của người dùng.
        suggestedProvinceCode: null,
        suggestedAddressLine: guessAddressLine(resolved.formattedAddress) || null,
      },
    };
  }
}
