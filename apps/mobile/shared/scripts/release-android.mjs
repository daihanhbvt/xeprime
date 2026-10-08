/*
 * Build bản phát hành Android (.aab) của CHÍNH app gọi lệnh, sẵn sàng upload lên Google Play.
 *
 *     node ../shared/scripts/release-android.mjs            # tăng versionCode +1 rồi build
 *     node ../shared/scripts/release-android.mjs --no-bump  # giữ nguyên versionCode
 *
 * Gói lại các bẫy đã vấp khi build tay (10/2026):
 *  - versionCode nằm ở HAI chỗ: `app.json` và `android/app/build.gradle` (thư mục `android/`
 *    sinh sẵn từ prebuild, sửa mỗi app.json thì Gradle vẫn đọc số cũ). Play từ chối mọi file
 *    trùng versionCode đã upload, nên mặc định tăng cả hai.
 *  - Metro phải lấy GỐC APP làm server root (`EXPO_NO_METRO_WORKSPACE_ROOT=1`): app nằm sâu
 *    `apps/mobile/<app>`, để mặc định thì đường dẫn entry tính lệch một cấp và bước
 *    `createBundleReleaseJsAndAssets` chết bằng "Unable to resolve module …expo-router/entry.js".
 *  - `NODE_ENV=production` tường minh — `.env` của máy dev có thể đặt development.
 *  - Thiếu upload key thì dừng NGAY, trước 5–15 phút build (chốt chặn trong build.gradle chỉ
 *    nổ ở cuối pha cấu hình).
 *
 * File ra: `<app>/dist/<slug>-<version>-<versionCode>.aab` (dist/ đã gitignore).
 *
 * Nếu bản release crash ngay khi mở với `NoClassDefFoundError` của expo-modules-core: file
 * trung gian của module native dùng chung bị hỏng do một lần build bị ngắt — xoá
 * `node_modules/.pnpm/*\/node_modules/**\/android/build` rồi build lại.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const appDir = process.cwd();
const androidDir = join(appDir, 'android');
const appJsonPath = join(appDir, 'app.json');
const gradlePath = join(androidDir, 'app', 'build.gradle');
const bump = !process.argv.includes('--no-bump');

function fail(message) {
  console.error(`\n[release-android] ${message}`);
  process.exit(1);
}

if (!existsSync(androidDir)) {
  fail(`Chưa có ${androidDir}. Chạy "pnpm prebuild" trước.`);
}

// Upload key: Gradle property, đọc từ ~/.gradle/gradle.properties hoặc biến môi trường CI.
const userGradleProps = join(homedir(), '.gradle', 'gradle.properties');
const propsText = existsSync(userGradleProps) ? readFileSync(userGradleProps, 'utf8') : '';
function uploadProp(name) {
  const fromEnv = process.env[`ORG_GRADLE_PROJECT_${name}`];
  if (fromEnv) return fromEnv;
  return propsText.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
}
const missingKeyProps = [
  'XEPRIME_UPLOAD_STORE_FILE',
  'XEPRIME_UPLOAD_STORE_PASSWORD',
  'XEPRIME_UPLOAD_KEY_ALIAS',
  'XEPRIME_UPLOAD_KEY_PASSWORD',
].filter((name) => !uploadProp(name));
if (missingKeyProps.length > 0) {
  fail(
    `Thiếu upload key: ${missingKeyProps.join(', ')} (trong ${userGradleProps} hoặc ` +
      'ORG_GRADLE_PROJECT_*). Xem docblock của shared/plugins/with-android-release-signing.js.',
  );
}
const keystoreFile = uploadProp('XEPRIME_UPLOAD_STORE_FILE');
if (!existsSync(keystoreFile)) fail(`Không thấy file keystore: ${keystoreFile}`);

const appJsonRaw = readFileSync(appJsonPath, 'utf8');
const appJson = JSON.parse(appJsonRaw);
const expo = appJson.expo;
const current = expo.android?.versionCode;
if (!Number.isInteger(current)) fail('app.json thiếu expo.android.versionCode.');

const gradleRaw = readFileSync(gradlePath, 'utf8');
const gradleMatch = gradleRaw.match(/^(\s*)versionCode (\d+)$/m);
if (!gradleMatch) fail(`Không tìm thấy dòng versionCode trong ${gradlePath}.`);

const next = bump ? Math.max(current, Number(gradleMatch[2])) + 1 : current;

// Sửa chuỗi tại chỗ thay vì JSON.stringify lại cả file — giữ nguyên format và chú thích thứ tự.
writeFileSync(
  appJsonPath,
  appJsonRaw.replace(/("versionCode"\s*:\s*)\d+/, `$1${next}`),
);
writeFileSync(gradlePath, gradleRaw.replace(/^(\s*)versionCode \d+$/m, `$1versionCode ${next}`));

console.log(
  `[release-android] ${expo.name} ${expo.version} — versionCode ${
    bump ? `${current} → ${next}` : `${next} (giữ nguyên)`
  }`,
);

const isWin = process.platform === 'win32';

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    fail(
      `Lệnh thất bại: ${command} ${args.join(' ')}` +
        (bump
          ? `\n[release-android] versionCode ĐÃ được nâng lên ${next}. Sửa lỗi xong chạy lại với --no-bump để khỏi nhảy số.`
          : ''),
    );
  }
}

console.log('[release-android] Build các package dùng chung…');
run('pnpm', ['run', 'build:deps'], appDir);

console.log('[release-android] Gradle bundleRelease…');
run(
  join(androidDir, isWin ? 'gradlew.bat' : 'gradlew'),
  ['bundleRelease', '--console=plain'],
  androidDir,
  { EXPO_NO_METRO_WORKSPACE_ROOT: '1', NODE_ENV: 'production' },
);

const built = join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(built)) fail(`Build xong nhưng không thấy ${built}.`);

const distDir = join(appDir, 'dist');
mkdirSync(distDir, { recursive: true });
const out = join(distDir, `${expo.slug}-${expo.version}-${next}.aab`);
copyFileSync(built, out);

console.log(`\n[release-android] XONG: ${out}`);
console.log(
  `[release-android] Upload lên Play: Test and release → (Closed/Internal) testing → Create new release. Release name gợi ý: ${expo.version} (${next})`,
);
