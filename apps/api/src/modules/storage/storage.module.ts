import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';
import { StorageController } from './storage.controller';

/**
 * Object storage (Cloudflare R2). ChatModule import để presign đính kèm; controller ở đây phục
 * vụ upload ảnh xe/shop cho portal quản lý (tenant-scoped, không gate firebase).
 */
@Module({
  controllers: [StorageController],
  providers: [R2Service],
  exports: [R2Service],
})
export class StorageModule {}
