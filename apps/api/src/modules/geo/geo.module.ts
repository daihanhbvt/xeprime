import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GEO_PROVIDER, GeoNotConfiguredProvider, type GeoProvider } from './geo-provider';
import { GeoService } from './geo.service';
import { VietmapGeoProvider } from './vietmap-geo.provider';

/**
 * Tra cứu vị trí (24/08/2026) — gợi ý địa chỉ + khoảng cách đường bộ cho luồng giao xe tận nơi.
 *
 * Chọn nhà cung cấp NGAY LÚC KHỞI ĐỘNG, một lần, theo việc có `VIETMAP_API_KEY` hay không.
 * Thiếu key thì cắm `GeoNotConfiguredProvider` — app vẫn boot bình thường và luồng giao xe rơi
 * về cách cũ (hai bên tự thoả thuận phí), giống hệt cách bộ `R2_*` và OCR đang xử sự.
 *
 * Nhà cung cấp là Vietmap (ADR 0061). Đổi nhà cung cấp là đổi đúng factory này.
 */
@Module({
  providers: [
    VietmapGeoProvider,
    {
      provide: GEO_PROVIDER,
      inject: [ConfigService, VietmapGeoProvider],
      useFactory: (config: ConfigService, vietmap: VietmapGeoProvider): GeoProvider =>
        config.get<string>('VIETMAP_API_KEY') ? vietmap : new GeoNotConfiguredProvider(),
    },
    GeoService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
