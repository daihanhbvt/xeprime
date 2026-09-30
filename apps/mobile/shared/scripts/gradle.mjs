/*
 * Chạy Gradle của thư mục `android/` thuộc CHÍNH app gọi lệnh — chọn đúng wrapper theo hệ
 * điều hành (`gradlew.bat` trên Windows, `gradlew` còn lại).
 *
 * Vì sao cần script thay cho `cd android && ./gradlew …` viết thẳng trong package.json: pnpm
 * chạy script qua shell mặc định của hệ điều hành, nên chuỗi POSIX hỏng trên Windows còn chuỗi
 * `.bat` hỏng trên máy khác — mà repo này có cả hai loại máy.
 *
 *     node ../shared/scripts/gradle.mjs assembleDebug
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const androidDir = join(process.cwd(), 'android');
if (!existsSync(androidDir)) {
  console.error(
    `[gradle] Chưa có ${androidDir}. Chạy "pnpm prebuild" (hoặc "pnpm prebuild:clean") trước.`,
  );
  process.exit(1);
}

/*
 * Đường dẫn TUYỆT ĐỐI, không phải tên trần: với `shell: true` trên Windows, `gradlew.bat` được
 * tìm theo PATH chứ không theo `cwd`, nên lệnh chết bằng "is not recognized".
 */
const wrapper = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const result = spawnSync(wrapper, [...process.argv.slice(2), '--console=plain'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
