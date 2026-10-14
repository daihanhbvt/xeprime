import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GEO_PROVIDER, GeoNotConfiguredProvider, type GeoProvider } from './geo-provider';
import { GoogleGeoProvider } from './google-geo.provider';
import { GeoService } from './geo.service';

/**
 * Tra cứu vị trí (24/08/2026) — geocode địa chỉ + khoảng cách đường bộ cho luồng giao xe tận nơi.
 *
 * Chọn nhà cung cấp NGAY LÚC KHỞI ĐỘNG, một lần, theo việc có `GOOGLE_MAPS_SERVER_KEY` hay không.
 * Thiếu key thì cắm `GeoNotConfiguredProvider` — app vẫn boot bình thường và luồng giao xe rơi
 * về cách cũ (hai bên tự thoả thuận phí), giống hệt cách bộ `R2_*` và OCR đang xử sự.
 *
 * Nhà cung cấp là Google Maps Platform (ADR 0059). Đổi nhà cung cấp là đổi đúng factory này.
 */
@Module({
  providers: [
    GoogleGeoProvider,
    {
      provide: GEO_PROVIDER,
      inject: [ConfigService, GoogleGeoProvider],
      useFactory: (config: ConfigService, google: GoogleGeoProvider): GeoProvider =>
        config.get<string>('GOOGLE_MAPS_SERVER_KEY') ? google : new GeoNotConfiguredProvider(),
    },
    GeoService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
