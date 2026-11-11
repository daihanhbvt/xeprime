import { useCallback, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useTranslations } from 'use-intl';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { APP_NAME } from '@/lib/app-name';
import { logger } from '@/lib/logger';

/**
 * Popup "Đã có phiên bản mới" — mời cập nhật hoặc tạm bỏ qua ("Để sau").
 *
 * Nguồn sự thật là CỬA HÀNG, qua `expo-in-app-updates` (0.9.x — dòng cuối hỗ trợ Expo SDK 54):
 *  - Android: API chính thức Google Play In-App Updates. Chỉ trả lời khi app được cài TỪ Google
 *    Play (kể cả kênh test nội bộ); cài tay APK/bản dev thì nó báo lỗi ⇒ im lặng.
 *  - iOS: tra App Store theo `AppStoreID` + `AppStoreCountry` trong `infoPlist` của app
 *    (`app.json`). App chưa khai Apple ID (app Partner hiện tại) ⇒ tra không ra ⇒ im lặng.
 *
 * "Để sau" chỉ đóng cho LẦN MỞ app này (người dùng chốt 10/11/2026: hỏi lại mỗi lần mở app). Một
 * "lần mở" là khởi động nguội HOẶC quay lại app sau khi đã ở nền ít nhất
 * `REOPEN_AFTER_BACKGROUND_MS` — ngưỡng này để việc ghé sang app khác vài giây (chọn ảnh, OTP,
 * đăng nhập Google) không bị tính là mở lại và bật popup giữa chừng.
 *
 * Mọi lỗi (mạng, chưa có trên store, module native vắng mặt) ⇒ không hiện gì. Popup là lời mời,
 * không phải cổng chặn — app vẫn dùng bình thường dù kiểm tra hỏng.
 */

/** Ở nền ít nhất chừng này rồi quay lại thì tính là một lần mở app mới. */
const REOPEN_AFTER_BACKGROUND_MS = 60_000;
/** Chờ app dựng xong màn đầu (lời chào thương hiệu, xin quyền) rồi mới hỏi store. */
const CHECK_DELAY_MS = 2_500;

type InAppUpdates = typeof import('expo-in-app-updates');

/** Tên module native của `expo-in-app-updates` (`expo-module.config.json`). */
const NATIVE_MODULE_NAME = 'ExpoInAppUpdates';

/**
 * Nạp LƯỜI: bản build cũ chưa có module native (bản dev cài trước khi thêm thư viện) sẽ ném ngay
 * lúc import tĩnh — tức là app chết ở màn trắng vì một tính năng phụ. Cùng lý do với
 * `features/notifications/messaging.ts`.
 */
let cachedModule: InAppUpdates | null | undefined;
function inAppUpdates(): InAppUpdates | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    cachedModule = null;
    return cachedModule;
  }
  // Hỏi TRƯỚC xem bản build có module native không — `require` thẳng thư viện ở bản thiếu module
  // vẫn bị bắt bởi `catch`, nhưng Metro đã kịp in một lỗi đỏ ra màn hình dev.
  if (!requireOptionalNativeModule(NATIVE_MODULE_NAME)) {
    cachedModule = null;
    return cachedModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp LƯỜI có chủ đích: xem docblock.
    cachedModule = require('expo-in-app-updates') as InAppUpdates;
  } catch (error) {
    logger.debug('[app-update] không có module expo-in-app-updates trong bản build này', {
      error: String(error),
    });
    cachedModule = null;
  }
  return cachedModule;
}

export function AppUpdatePrompt() {
  const t = useTranslations('MobileShell.appUpdate');
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const backgroundSince = useRef<number | null>(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    const mod = inAppUpdates();
    if (!mod || checking.current) return;
    checking.current = true;
    try {
      const result = await mod.checkForUpdate();
      if (result.updateAvailable) setOpen(true);
    } catch (error) {
      // Android không cài từ Google Play, iOS chưa có trên App Store, mất mạng… — đều im lặng.
      logger.debug('[app-update] không kiểm tra được bản mới', { error: String(error) });
    } finally {
      checking.current = false;
    }
  }, []);

  // Khởi động nguội = một lần mở app.
  useEffect(() => {
    const timer = setTimeout(() => void check(), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [check]);

  // Quay lại sau một quãng ở nền đủ dài = một lần mở app mới (kể cả khi trước đó đã bấm "Để sau").
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundSince.current = Date.now();
        return;
      }
      if (state !== 'active' || backgroundSince.current === null) return;
      const away = Date.now() - backgroundSince.current;
      backgroundSince.current = null;
      if (away >= REOPEN_AFTER_BACKGROUND_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  const update = useCallback(async () => {
    const mod = inAppUpdates();
    if (!mod) {
      // Bản build chưa có module native: không có gì để mở — chỉ đóng popup.
      setOpen(false);
      return;
    }
    setStarting(true);
    try {
      // Android: luồng cập nhật toàn màn của Google Play (IMMEDIATE) — đúng nghĩa "Cập nhật ngay".
      // iOS: tham số bị bỏ qua, thư viện mở trang app trên App Store.
      await mod.startUpdate(true);
    } catch (error) {
      logger.warn('[app-update] không mở được luồng cập nhật', { error: String(error) });
    } finally {
      setStarting(false);
      setOpen(false);
    }
  }, []);

  return (
    <AlertDialog
      open={open}
      title={t('title')}
      message={t('message', { appName: APP_NAME })}
      confirmLabel={t('update')}
      cancelLabel={t('later')}
      loading={starting}
      onConfirm={() => void update()}
      onCancel={() => setOpen(false)}
    />
  );
}
