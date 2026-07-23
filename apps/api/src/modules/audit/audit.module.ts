import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Global: mọi module đều có thể phải ghi audit, import thủ công khắp nơi là dễ quên. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
