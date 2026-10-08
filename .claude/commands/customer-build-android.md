---
description: Build file .aab phát hành của app XePrime (khách) (tăng versionCode +1), sẵn sàng upload Google Play.
argument-hint: "[--no-bump]"
allowed-tools: Bash(pnpm --filter @xeprime/mobile-customer release:android:*), Bash(ls:*), Bash(adb:*)
---

# Build Android — XePrime (khách) (`@xeprime/mobile-customer`)

Tham số người dùng (có thể rỗng): $ARGUMENTS

1. Chạy (nền, mất 3–15 phút):
   `pnpm --filter @xeprime/mobile-customer release:android $ARGUMENTS`
   Script `apps/mobile/shared/scripts/release-android.mjs` tự: kiểm upload key → tăng versionCode ở CẢ `app.json` lẫn `android/app/build.gradle` (bỏ qua nếu `--no-bump`) → build package dùng chung → `gradlew bundleRelease` với `EXPO_NO_METRO_WORKSPACE_ROOT=1` + `NODE_ENV=production` → chép ra `apps/mobile/customer/dist/`.
2. Báo lại cho người dùng: đường dẫn file `.aab`, phiên bản + versionCode, API mà bản build trỏ tới (`EXPO_PUBLIC_API_URL` trong `apps/mobile/customer/.env`), và Release name gợi ý `<version> (<versionCode>)`.
3. Thất bại thì đọc lỗi Gradle/Metro và chẩn đoán — KHÔNG chạy lại mù quáng. Bẫy đã biết ghi ở docblock của script (bản release crash `NoClassDefFoundError` ⇒ xoá build trung gian của module native rồi build lại).
4. KHÔNG commit. Việc tăng versionCode để người dùng tự commit (`/commit`).
