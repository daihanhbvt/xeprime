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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { FeePolicyDto, UpsertFeePolicyDto } from './dto/fee-policy.dto';
import { FeePoliciesService } from './fee-policies.service';

/**
 * Quản trị chính sách phí — ADR 0028 điều 2–3, ADR 0029 (R3). `@PlatformOnly` +
 * `platform.fee_policies.manage` (finance_admin và platform_admin).
 *
 * Mọi con số ở đây là DỮ LIỆU; quy tắc (phí nằm phía khách, tuyến gói 0%, đóng băng vào đơn)
 * nằm trong code và không có endpoint nào bật/tắt được chúng.
 */
@ApiTags('platform-fee-policies')
@Controller('platform/fee-policies')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_FEE_POLICY_MANAGE)
export class PlatformFeePoliciesController {
  constructor(private readonly policies: FeePoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'Mọi phiên bản chính sách phí — mới nhất trước' })
  @ApiOkResponse({ type: [FeePolicyDto] })
  list(): Promise<FeePolicyDto[]> {
    return this.policies.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Một phiên bản' })
  @ApiOkResponse({ type: FeePolicyDto })
  getOne(@Param('id') id: string): Promise<FeePolicyDto> {
    return this.policies.getOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo bản NHÁP mới (số phiên bản kế tiếp)' })
  @ApiOkResponse({ type: FeePolicyDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertFeePolicyDto,
  ): Promise<FeePolicyDto> {
    return this.policies.createDraft(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa bản nháp — bản đã hiệu lực là bất biến' })
  @ApiOkResponse({ type: FeePolicyDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertFeePolicyDto,
  ): Promise<FeePolicyDto> {
    return this.policies.updateDraft(id, user.id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kích hoạt bản nháp — lưu trữ bản đang hiệu lực trong cùng transaction, không hồi tố',
  })
  @ApiOkResponse({ type: FeePolicyDto })
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<FeePolicyDto> {
    return this.policies.activate(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ bản nháp' })
  @ApiNoContentResponse()
  discard(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.policies.discardDraft(id, user.id);
  }
}
