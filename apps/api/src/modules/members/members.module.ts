import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Quản lý nhân sự gian hàng (Phase 1 RBAC). PrismaService/AuditService là @Global nên không
 * cần import. Mọi ghi vào `tenant_memberships` đi qua service này để guard nghiệp vụ tập trung.
 */
@Module({
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
