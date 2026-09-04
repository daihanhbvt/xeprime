import { Module } from '@nestjs/common';
import { InviteAnswersController } from './invite-answers.controller';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Quản lý nhân sự gian hàng (Phase 1 RBAC). PrismaService/AuditService/EmailService là @Global
 * nên không cần import. Mọi ghi vào `tenant_memberships` đi qua module này để guard nghiệp vụ
 * tập trung.
 *
 * Ba controller vì ba mặt phẳng bảo vệ khác nhau, không phải vì ba nhóm route:
 *  - `MembersController` — tenant-scoped, quyền `members.*`;
 *  - `InvitesController` — cũng tenant-scoped, nhưng có hạn mức gửi thư riêng;
 *  - `InviteAnswersController` — KHÔNG tenant-scoped được, vì người trả lời chưa là thành viên.
 */
@Module({
  controllers: [MembersController, InvitesController, InviteAnswersController],
  providers: [MembersService, InvitesService],
})
export class MembersModule {}
