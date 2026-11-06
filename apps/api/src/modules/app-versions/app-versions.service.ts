import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compareAppVersions, parseAppVersion, type NativeAppKey, type NativePlatform } from '@xeprime/domain';
import type { AppVersionDto } from './app-versions.dto';

/** Đọc cấu hình phiên bản app native từ env (`APP_<APP>_<PLATFORM>_*`) — không DB, không admin. */
@Injectable()
export class AppVersionsService {
  private readonly logger = new Logger(AppVersionsService.name);

  constructor(private readonly config: ConfigService) {}

  get(app: NativeAppKey, platform: NativePlatform): AppVersionDto {
    const prefix = `APP_${app.toUpperCase()}_${platform.toUpperCase()}`;
    const latestVersion = this.config.get<string>(`${prefix}_LATEST_VERSION`) ?? null;
    let minVersion = this.config.get<string>(`${prefix}_MIN_VERSION`) ?? null;

    // Bản tối thiểu cao hơn bản mới nhất là cấu hình sai: bắt người dùng lên một bản không tồn tại.
    const min = parseAppVersion(minVersion);
    const latest = parseAppVersion(latestVersion);
    if (min && latest && compareAppVersions(min, latest) > 0) {
      this.logger.warn(`${prefix}_MIN_VERSION (${minVersion}) > LATEST (${latestVersion}) - bỏ qua MIN`);
      minVersion = null;
    }

    return { latestVersion, minVersion, storeUrl: this.storeUrl(prefix, platform) };
  }

  private storeUrl(prefix: string, platform: NativePlatform): string | null {
    if (platform === 'ios') {
      const id = this.config.get<string>(`${prefix}_APP_STORE_ID`);
      return id ? `https://apps.apple.com/app/id${id}` : null;
    }
    const pkg = this.config.get<string>(`${prefix}_PACKAGE`);
    return pkg ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}` : null;
  }
}
