import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { DeliveryDistanceService } from './delivery-distance.service';
import {
  DeliveryDistanceDto,
  DeliveryDistanceQueryDto,
  PublicQuoteDto,
  PublicQuoteQueryDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';
import { VehicleSettingsService } from '../vehicle-settings/vehicle-settings.service';
import { SERVICE_TYPE } from '@xeprime/types';

/**
 * Báo giá công khai cho khách trước khi gửi yêu cầu thuê — CÙNG PricingService với luồng duyệt
 * của shop (một nguồn tính giá, không nhân đôi công thức ở FE). Chỉ trả cho xe đã duyệt của
 * shop đang hoạt động; chưa gồm phí giao nhận (phụ thuộc khoảng cách — trả kèm bảng bậc để
 * khách tự ước lượng).
 */
@ApiTags('public-listings')
@Controller('public/listings')
export class PublicQuoteController {
  constructor(
    private readonly pricing: PricingService,
    private readonly distance: DeliveryDistanceService,
    private readonly settings: VehicleSettingsService,
  ) {}

  @Public()
  @Get(':id/quote')
  @ApiOperation({
    summary: 'Báo giá thuê — theo khoảng ngày, hoặc theo GÓI tháng lịch với thuê dài hạn',
  })
  @ApiOkResponse({ type: PublicQuoteDto })
  async quote(@Param('id') id: string, @Query() query: PublicQuoteQueryDto): Promise<PublicQuoteDto> {
    const quote = await this.pricing.publicQuote(id, query);
    /*
     * "Đặt nhanh" chỉ được hứa khi SERVER xác định áp dụng được cho đúng khoảng này (08/09/2026).
     * Dài hạn không bao giờ tự nhận — gian hàng chốt lịch tay (ADR 0011). Preview đọc lịch bận và
     * tài xế rảnh nên có thể cũ ngay khi trả về; chốt chặn thật vẫn ở lúc gửi yêu cầu.
     */
    const serviceType = query.serviceType ?? SERVICE_TYPE.SELF_DRIVE;
    const autoAccept =
      serviceType === SERVICE_TYPE.LONG_TERM || !query.pickupAt || !query.returnAt
        ? null
        : await this.settings.previewAutoAccept(id, {
            serviceType,
            pickupAt: new Date(query.pickupAt),
            returnAt: new Date(query.returnAt),
            quoteIsEstimate: quote.breakdown.estimateNote != null,
            holdRequired: Boolean(quote.breakdown.fees?.holdAmount),
            // Preview chưa có câu trả lời của khách — coi như sẽ đồng ý; lúc gửi mới kiểm thật.
            termsAccepted: true,
          });
    return { ...quote, autoAccept };
  }

  /**
   * Khoảng cách giao xe + phí dự kiến từ bản đồ.
   *
   * `@Throttle` siết chặt hơn hẳn mức chung 120 req/phút của app, và ở đây nó KHÔNG chống
   * brute-force mà chống đốt hạn mức: mỗi lượt trượt cache là một request có tính tiền tới nhà
   * cung cấp bản đồ. Cache + lọc trước bằng đường chim bay lo phần lưu lượng thật; con số này
   * là trần cứng cho phần lưu lượng không thật.
   *
   * Luôn trả 200 — mọi ngả không tra được là một giá trị `status`, không phải một lỗi.
   */
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Get(':id/delivery-distance')
  @ApiOperation({ summary: 'Khoảng cách giao xe tận nơi + phí dự kiến theo bậc của gian hàng' })
  @ApiOkResponse({ type: DeliveryDistanceDto })
  deliveryDistance(
    @Param('id') id: string,
    @Query() query: DeliveryDistanceQueryDto,
  ): Promise<DeliveryDistanceDto> {
    return this.distance.forListing(id, query.address);
  }
}
