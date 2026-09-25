import { Global, Module } from '@nestjs/common';
import { SupportRequestMiddleware, SupportRequestStore } from './support-request.store';

/**
 * Global vì `AuditService` (global) và `TenantScopeGuard` (guard tầng app) cùng đọc store — ADR
 * 0050. Middleware được `AppModule.configure` áp cho MỌI route.
 */
@Global()
@Module({
  providers: [SupportRequestStore, SupportRequestMiddleware],
  exports: [SupportRequestStore, SupportRequestMiddleware],
})
export class SupportRequestModule {}
