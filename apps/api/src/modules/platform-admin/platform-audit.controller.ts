import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import { AuditLogDetailDto, AuditLogListQueryDto, AuditLogPageDto } from './dto/audit-log.dto';
import { PlatformAuditService } from './platform-audit.service';

/** Nhật ký hệ thống (Phase 7) — chỉ ĐỌC. `@PlatformOnly` — không dùng chung guard với gian hàng. */
@ApiTags('platform-audit')
@Controller('platform/audit-logs')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_AUDIT_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách nhật ký (phân trang, lọc scope/action/đối tượng/thời gian)' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@Query() query: AuditLogListQueryDto): Promise<AuditLogPageDto> {
    return this.audit.list(query) as Promise<AuditLogPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một dòng nhật ký (kèm snapshot before/after)' })
  @ApiOkResponse({ type: AuditLogDetailDto })
  getOne(@Param('id') id: string): Promise<AuditLogDetailDto> {
    return this.audit.getOne(id);
  }
}
