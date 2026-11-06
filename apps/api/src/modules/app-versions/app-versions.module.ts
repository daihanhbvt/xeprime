import { Module } from '@nestjs/common';
import { AppVersionsController } from './app-versions.controller';
import { AppVersionsService } from './app-versions.service';

/** Phiên bản app native đọc từ env — thông báo cập nhật cho app khách / Partner. */
@Module({
  controllers: [AppVersionsController],
  providers: [AppVersionsService],
})
export class AppVersionsModule {}
