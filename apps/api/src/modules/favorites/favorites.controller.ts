import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM } from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  FavoriteListQueryDto,
  FavoriteStatusDto,
  FavoriteStatusQueryDto,
  FavoriteToggleResultDto,
  FavoriteVehiclePageDto,
} from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

/**
 * "Xe yêu thích" của CHÍNH tài khoản khách đang đăng nhập (BRD customer favorites).
 *
 * Chỉ realm `customer`: tài khoản đối tác/quản trị không đặt xe (ADR 0053 điều 7) nên cũng không
 * có danh sách xe để thuê; `RealmGuard` trả `REALM_NOT_ALLOWED` trước khi chạm DB, và FK tổ hợp
 * `(user_id, realm)` chặn thêm một lần ở tầng dữ liệu. Không có tham số người dùng nào — chủ
 * danh sách luôn lấy từ phiên.
 *
 * Thêm/bỏ là `PUT`/`DELETE` lên đúng tài nguyên `(tôi, xe)` — cả hai IDEMPOTENT, nên client gửi
 * TRẠNG THÁI MONG MUỐN chứ không gửi "đảo trạng thái": bấm nhanh nhiều lần hay gửi lại sau mất
 * mạng luôn hội tụ về lượt bấm cuối.
 */
@ApiTags('favorites')
@Controller('account/favorites')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({
    summary: 'Xe yêu thích của tôi — một tab Ô tô/Xe máy, phân trang, dữ liệu chợ hiện hành',
    description:
      'Xe đang bị ẩn/gỡ/đình chỉ hoặc không còn dịch vụ nào không hiện (mục yêu thích vẫn giữ, ' +
      'mở bán lại là hiện lại). Mới lưu lên trước.',
  })
  @ApiOkResponse({ type: FavoriteVehiclePageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FavoriteListQueryDto,
  ): Promise<FavoriteVehiclePageDto> {
    return this.favorites.list(user.id, query) as Promise<FavoriteVehiclePageDto>;
  }

  @Get('status')
  @ApiOperation({
    summary: 'Trong các xe này, xe nào tôi đã thích — trái tim ở kết quả tìm kiếm/chi tiết',
  })
  @ApiOkResponse({ type: FavoriteStatusDto })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FavoriteStatusQueryDto,
  ): Promise<FavoriteStatusDto> {
    return this.favorites.status(user.id, query.vehicleIds);
  }

  @Put(':vehicleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lưu một xe vào yêu thích (idempotent)',
    description:
      'Chỉ xe đang niêm yết công khai — không thì 404 `FAVORITE_VEHICLE_UNAVAILABLE`. Thích lại ' +
      'một xe đã thích trả 200 như lần đầu.',
  })
  @ApiOkResponse({ type: FavoriteToggleResultDto })
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ): Promise<FavoriteToggleResultDto> {
    return this.favorites.add(user.id, vehicleId);
  }

  @Delete(':vehicleId')
  @ApiOperation({ summary: 'Bỏ một xe khỏi yêu thích (idempotent — chưa lưu cũng trả 200)' })
  @ApiOkResponse({ type: FavoriteToggleResultDto })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ): Promise<FavoriteToggleResultDto> {
    return this.favorites.remove(user.id, vehicleId);
  }
}
