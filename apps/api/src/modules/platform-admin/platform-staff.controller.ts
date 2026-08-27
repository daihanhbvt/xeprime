import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  AddStaffDto,
  StaffDto,
  StaffListQueryDto,
  StaffPageDto,
  UpdateStaffRoleDto,
} from './dto/platform-staff.dto';
import { PlatformStaffService } from './platform-staff.service';

class RemoveStaffResultDto {
  @ApiProperty() userId!: string;
}

/** Nhân sự nền tảng (Phase 7). `@PlatformOnly` — không dùng chung guard với API gian hàng. */
@ApiTags('platform-staff')
@Controller('platform/staff')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_STAFF_MANAGE)
export class PlatformStaffController {
  constructor(private readonly staff: PlatformStaffService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách nhân sự nền tảng (phân trang, lọc vai trò, tìm kiếm)' })
  @ApiOkResponse({ type: StaffPageDto })
  list(@Query() query: StaffListQueryDto): Promise<StaffPageDto> {
    return this.staff.list(query) as Promise<StaffPageDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Thêm nhân sự theo email tài khoản đã có' })
  @ApiOkResponse({ type: StaffDto })
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddStaffDto): Promise<StaffDto> {
    return this.staff.add(user.id, dto);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Đổi vai trò nhân sự' })
  @ApiOkResponse({ type: StaffDto })
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffRoleDto,
  ): Promise<StaffDto> {
    return this.staff.updateRole(user.id, userId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gỡ nhân sự khỏi nền tảng (status → removed)' })
  @ApiOkResponse({ type: RemoveStaffResultDto })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<RemoveStaffResultDto> {
    return this.staff.remove(user.id, userId);
  }
}
