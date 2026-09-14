import { Module } from '@nestjs/common';
import { AvatarUploadController } from './avatar-upload.controller';
import { R2Service } from './r2.service';
import { StorageController } from './storage.controller';

/**
 * Object storage (Cloudflare R2). ChatModule import để presign đính kèm; controller ở đây phục
 * vụ upload ảnh xe/shop cho portal quản lý (tenant-scoped, không gate firebase).
 *
 * `AvatarUploadController` đứng riêng vì nó KHÔNG tenant-scoped: ảnh đại diện thuộc về một con
 * người, và khách thuê xe không có gian hàng nào để lấy quyền — xem docblock của nó.
 */
@Module({
  controllers: [StorageController, AvatarUploadController],
  providers: [R2Service],
  exports: [R2Service],
})
export class StorageModule {}
