import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { CustomerTripsService } from './customer-trips.service';
import {
  CustomerTripDetailDto,
  CustomerTripListQueryDto,
  CustomerTripPageDto,
} from './dto/customer-trip.dto';

/**
 * Chuyến của KHÁCH (Wave 11) — chỉ cần đăng nhập, không tenant-scoped.
 *
 * Không có tham số nào nhận danh tính khách: `customerUserId` luôn lấy từ session (ADR 0002).
 * Vì thế không có cách nào gọi endpoint này để xem chuyến của người khác — kể cả khi biết id.
 *
 * Toàn bộ là ĐỌC. Mọi thao tác ghi (huỷ chuyến, phát sinh, hoàn cọc) thuộc luồng của chủ xe ở
 * Wave 9/10; Wave 11 cố ý không mở một đường ghi song song cho khách.
 */
@ApiTags('customer-trips')
@Controller('trips')
export class CustomerTripsController {
  constructor(private readonly trips: CustomerTripsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chuyến của tôi (lọc theo tab, phân trang ở DB)' })
  @ApiOkResponse({ type: CustomerTripPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerTripListQueryDto,
  ): Promise<CustomerTripPageDto> {
    return this.trips.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết một chuyến của tôi',
    description:
      'Nhận id YÊU CẦU thuê hoặc id ĐƠN thuê — thông báo trỏ vào cả hai loại. Không phải chuyến ' +
      'của mình thì trả 404 (không tiết lộ id có tồn tại hay không).',
  })
  @ApiOkResponse({ type: CustomerTripDetailDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerTripDetailDto> {
    return this.trips.detail(user.id, id);
  }
}
