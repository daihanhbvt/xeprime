import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';

/** Object storage (Cloudflare R2). ChatModule import để presign đính kèm. */
@Module({
  providers: [R2Service],
  exports: [R2Service],
})
export class StorageModule {}
