import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GeoModule } from '../geo/geo.module';
import { AddressService } from './address.service';
import { PlacesController } from './places.controller';
import { PlatformLocationsController } from './platform-locations.controller';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';
import { WardsController } from './wards.controller';
import { WardsService } from './wards.service';

/**
 * Danh mục hành chính HAI CẤP (tỉnh/thành → xã/phường/đặc khu) và địa chỉ vật lý có cấu trúc.
 *
 * Ba service export ra ngoài vì mọi nơi khai báo địa chỉ đều phải hỏi CÙNG một chỗ:
 *   - `ProvincesService` — "mã tỉnh này dùng được không";
 *   - `WardsService` — "mã xã này dùng được không, và có thuộc tỉnh đó không";
 *   - `AddressService` — cả hai câu trên CỘNG ghép chuỗi hiển thị và chốt toạ độ.
 *
 * Module khác gọi `AddressService.resolve()`; không ai tự query `provinces`/`wards` để tự ghép
 * một địa chỉ, vì đó là cách để cùng một chi nhánh có hai cách viết địa chỉ.
 */
@Module({
  imports: [AuditModule, GeoModule],
  controllers: [ProvincesController, WardsController, PlacesController, PlatformLocationsController],
  providers: [ProvincesService, WardsService, AddressService],
  exports: [ProvincesService, WardsService, AddressService],
})
export class LocationsModule {}
