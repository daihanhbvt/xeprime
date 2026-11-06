import type { NativeAppKey, NativePlatform } from '@xeprime/domain';
import { getApiClient } from '@xeprime/api-client';

/** `GET /app-versions/:app` — mọi trường có thể `null` (env chưa khai). */
export type AppVersionConfig = {
  latestVersion: string | null;
  minVersion: string | null;
  storeUrl: string | null;
};

export const appVersionsApi = {
  /** Công khai, không cần phiên. */
  get(app: NativeAppKey, platform: NativePlatform): Promise<AppVersionConfig> {
    return getApiClient().get<AppVersionConfig>(
      `/app-versions/${app}?platform=${encodeURIComponent(platform)}`,
    );
  },
};
