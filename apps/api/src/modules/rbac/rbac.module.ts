import { Global, Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

/**
 * Global vì TenantScopeGuard (đăng ký ở tầng app) cần RbacService. Không Global thì phải
 * import RbacModule vào mọi module có API tenant — dễ quên, và quên nghĩa là guard chết.
 */
@Global()
@Module({
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
