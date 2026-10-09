import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { DriverLicencesController } from './driver-licences.controller';
import { DriverLicencesService } from './driver-licences.service';
import { PlatformDriverLicencesController } from './platform-driver-licences.controller';
import {
  DRIVER_LICENCE_READER,
  NotConfiguredDriverLicenceReader,
  type DriverLicenceReader,
} from './reader/driver-licence-reader';
import { TesseractDriverLicenceReader } from './reader/tesseract-driver-licence-reader';

/**
 * Bằng lái của tài khoản khách (ADR 0057). `BookingRequestsModule` import module này để soát
 * bằng ở cổng gửi yêu cầu — `DriverLicencesService` là writer duy nhất của bảng.
 */
@Module({
  imports: [StorageModule, AuditModule],
  controllers: [DriverLicencesController, PlatformDriverLicencesController],
  providers: [
    DriverLicencesService,
    {
      // Mặc định đọc bằng Tesseract tại chỗ; `off` — hoặc cài thiếu dữ liệu ngôn ngữ — ⇒ mọi lượt
      // nộp sang hàng đợi duyệt tay. Thiếu dữ liệu là lỗi cài đặt: kêu NGAY lúc khởi động.
      provide: DRIVER_LICENCE_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DriverLicenceReader => {
        if (config.get<string>('DRIVER_LICENCE_OCR') === 'off') {
          return new NotConfiguredDriverLicenceReader();
        }
        const missing = TesseractDriverLicenceReader.unavailableReason();
        if (missing) {
          new Logger(DriverLicencesModule.name).error(
            `Tesseract không dùng được (${missing}) — bằng lái sẽ chờ duyệt tay`,
          );
          return new NotConfiguredDriverLicenceReader();
        }
        return new TesseractDriverLicenceReader();
      },
    },
  ],
  exports: [DriverLicencesService],
})
export class DriverLicencesModule {}
