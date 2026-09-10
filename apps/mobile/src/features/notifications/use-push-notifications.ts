import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { pushDeviceApi } from '@/api/notifications/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { deepLinkPended } from '@/features/shell/shell-scope.slice';
import { fireAndForget } from '@/lib/fire-and-forget';
import { logger } from '@/lib/logger';
import { useAppDispatch } from '@/store/hooks';
import { notificationHref, pendingNotificationPath } from './deep-link';
import {
  getInitialPushMessage,
  getPushToken,
  isPushAvailable,
  onPushMessage,
  onPushOpened,
  onPushTokenRefresh,
  requestPushPermission,
  urlOf,
} from './messaging';

/**
 * Vòng đời thông báo đẩy trong app — bản TỐI THIỂU của đợt này (COM-07).
 *
 * Có: xin quyền · đăng ký token · nhận tin ở nền/nền trước · bấm thông báo mở đúng màn.
 * KHÔNG có: trung tâm thông báo, badge, màn cài đặt, đánh dấu đã đọc. Chúng thuộc đợt sau —
 * `docs/mobile-module-status.md` §COM-04.
 *
 * Ba ràng buộc:
 *  1. **Chỉ đăng ký khi ĐÃ đăng nhập.** `POST /notifications/device-token` cần phiên, và một
 *     thiết bị không gắn với ai thì không có thông báo nào để nhận.
 *  2. **Xin quyền đúng một lần mỗi phiên chạy.** Hộp thoại của cả hai hệ điều hành đã tự nhớ
 *     lựa chọn của người dùng, nhưng gọi lại mỗi lần render là một lời gọi native vô ích.
 *  3. **Không bao giờ log token.**
 */
export function usePushNotifications(): void {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useAppToast();
  const t = useTranslations('MobileShell.push');
  const { data: user, isPending: sessionLoading } = useCurrentUser();
  const userId = user?.id ?? null;

  /** Đã đăng ký cho tài khoản nào rồi — đổi tài khoản thì đăng ký lại (server gán lại máy). */
  const registeredFor = useRef<string | null>(null);
  /** Đích của thông báo mở app từ trạng thái tắt hẳn, xử lý đúng một lần. */
  const coldStartHandled = useRef(false);

  /**
   * Điều hướng theo `data.url` — hoặc CẤT LẠI nếu chưa đăng nhập.
   *
   * `notificationHref` là cửa kiểm duy nhất: payload là dữ liệu đến từ ngoài, và một đường dẫn
   * không nằm trong allowlist thì KHÔNG mở gì cả (mở màn đang đứng còn hơn mở màn trắng).
   */
  const open = useCallback(
    (url: string | null) => {
      if (!userId) {
        const pending = pendingNotificationPath(url);
        // Cất lại chứ không bỏ: người dùng bấm thông báo rồi bị hỏi đăng nhập, và sau khi đăng
        // nhập họ phải tới ĐÚNG chỗ vừa bấm (`useEnterApp` tiêu thụ `pendingDeepLink`).
        if (pending) dispatch(deepLinkPended(pending));
        return;
      }
      const href = notificationHref(url);
      if (!href) {
        logger.debug('[push] payload không có đích hợp lệ, bỏ qua điều hướng');
        return;
      }
      router.push(href);
    },
    [dispatch, router, userId],
  );

  // Đăng ký thiết bị — chạy lại khi tài khoản đổi, không chạy khi chưa đăng nhập.
  useEffect(() => {
    /*
     * QUÊN dấu vết khi phiên kết thúc. Đăng xuất thu hồi phiên, và server TẮT thiết bị của phiên
     * đó trong cùng transaction (`NativeSessionService.revokeSession`). Giữ lại `registeredFor`
     * thì lần đăng nhập kế tiếp bằng CHÍNH tài khoản đó bị coi là "đã đăng ký rồi": hàng trong DB
     * vẫn `enabled = false`, app tin là xong, và người dùng không nhận gì cho tới khi tắt hẳn app.
     * Phiên hết hạn rồi đăng nhập lại dính đúng đường này — nó là bản chất của "thông báo không
     * chạy" mà không ai tái hiện được.
     */
    if (!userId) {
      registeredFor.current = null;
      return;
    }
    if (!isPushAvailable() || registeredFor.current === userId) return;

    fireAndForget(async () => {
      if (!(await requestPushPermission())) {
        logger.debug('[push] người dùng chưa cho phép thông báo');
        return;
      }
      const token = await getPushToken();
      if (!token) return;

      await pushDeviceApi.register({ token, ...deviceInfo() });
      registeredFor.current = userId;
      // Token KHÔNG được log — chỉ ghi nhận là đã xong.
      logger.debug('[push] đã đăng ký thiết bị');
    }, 'usePushNotifications.register');
  }, [userId]);

  // FCM xoay token (khôi phục máy, cài lại app) → POST lại, nếu không máy im lặng vĩnh viễn.
  useEffect(() => {
    if (!userId || !isPushAvailable()) return;
    return onPushTokenRefresh((token) => {
      fireAndForget(
        () => pushDeviceApi.register({ token, ...deviceInfo() }),
        'usePushNotifications.refresh',
      );
    });
  }, [userId]);

  // App đang MỞ: hệ điều hành không vẽ gì, nên app tự báo bằng toast của chính nó.
  useEffect(() => {
    if (!isPushAvailable()) return;
    return onPushMessage((message) => {
      const title = message.notification?.title;
      const body = message.notification?.body;
      // Chữ của thông báo do SERVER gửi và đã địa phương hoá lúc phát; chỉ nhánh dự phòng
      // (payload không có notification block) mới cần một câu của app.
      toast.showInfo(body ?? title ?? t('fallback'));
    });
  }, [t, toast]);

  // Bấm thông báo khi app đang ở nền.
  useEffect(() => {
    if (!isPushAvailable()) return;
    return onPushOpened((message) => open(urlOf(message)));
  }, [open]);

  /*
   * Bấm thông báo khi app đã TẮT HẲN. `onNotificationOpenedApp` không bắn ở nhánh này — lúc
   * thông báo được bấm thì chưa có JS nào chạy để mà lắng nghe.
   *
   * ĐỢI phiên giải xong rồi mới đọc. Chạy sớm hơn thì `open()` thấy `userId = null` và cất
   * đường dẫn vào `pendingDeepLink` — thứ chỉ được tiêu thụ sau một lần ĐĂNG NHẬP. Người vốn
   * đang đăng nhập sẵn sẽ bấm thông báo và không đi đâu cả.
   *
   * `coldStartHandled` giữ cho nó chạy đúng một lần dù `open` đổi danh tính.
   */
  useEffect(() => {
    if (sessionLoading || coldStartHandled.current || !isPushAvailable()) return;
    coldStartHandled.current = true;
    fireAndForget(async () => {
      const message = await getInitialPushMessage();
      if (message) open(urlOf(message));
    }, 'usePushNotifications.coldStart');
  }, [open, sessionLoading]);
}

/** Metadata thiết bị — chỉ để người dùng nhận ra máy nào, không dùng cho bảo mật. */
function deviceInfo(): { platform: 'android' | 'ios'; appVersion?: string; deviceName?: string } {
  return {
    // `isPushAvailable()` đã loại web, nên tới đây chỉ còn hai giá trị.
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
    ...(Constants.deviceName ? { deviceName: Constants.deviceName } : {}),
  };
}
