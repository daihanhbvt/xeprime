/*
 * Cài bản debug vừa build lên máy/emulator đang cắm — `adb install -r` giữ dữ liệu app.
 *
 * Hai app có hai `applicationId` khác nhau nên cài song song được; script này chỉ cài app của
 * thư mục gọi lệnh, không đụng app kia.
 *
 *     node ../shared/scripts/install-android.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const apk = join(process.cwd(), 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) {
  console.error(`[install] Chưa có ${apk}. Chạy "pnpm build:android:debug" trước.`);
  process.exit(1);
}

const result = spawnSync('adb', ['install', '-r', apk], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
