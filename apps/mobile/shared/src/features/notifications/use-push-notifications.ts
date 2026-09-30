import { useQueryClient } from '@tanstack/react-query';
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
import { PUSH_TRIGGER, chatDebug, type PushTrigger } from '@/lib/chat-debug';
import { refreshForNotification } from '@/features/badges/notification-refresh';
import { queryKeys } from '@/queries/query-keys';
import { useAppDispatch } from '@/store/hooks';
import { notificationHref, pendingNotificationPath } from './deep-link';
import { requestPermissionExclusively } from '@/lib/permission-queue';
import { usePushPermissionGateOpen } from './push-permission-gate';
import {
  getInitialPushMessage,
  getPushToken,
  hasPushPermission,
  isPushAvailable,
  onPushMessage,
  onPushOpened,
  onPushTokenRefresh,
  notificationTypeOf,
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
 *  2. **Xin quyền KHÔNG diễn ra ở đây, mà sau khi người dùng vào được một màn chính**
 *     (`push-permission-gate.ts`). Đăng ký thiết bị thì chạy ngay khi có phiên — nhưng chỉ khi
 *     quyền ĐÃ có sẵn, nên nó im lặng tuyệt đối. Trước đây hai việc này là một, và hậu quả là hộp
 *     thoại quyền nhảy lên ngay trên màn nhập mã OTP: xem docblock của cửa.
 *  3. **Không bao giờ log token.**
 */
export function usePushNotifications(): void {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const toast = useAppToast();
  const t = useTranslations('MobileShell.push');
  const { data: user, isPending: sessionLoading } = useCurrentUser();
  const userId = user?.id ?? null;
  /** Người dùng đã vào một màn chính chưa — cửa DUY NHẤT cho phép hiện hộp thoại xin quyền. */
  const gateOpen = usePushPermissionGateOpen();

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
    (url: string | null, trigger: PushTrigger) => {
      if (!userId) {
        const pending = pendingNotificationPath(url);
        // Cất lại chứ không bỏ: người dùng bấm thông báo rồi bị hỏi đăng nhập, và sau khi đăng
        // nhập họ phải tới ĐÚNG chỗ vừa bấm (`useEnterApp` tiêu thụ `pendingDeepLink`).
        if (pending) {
          dispatch(deepLinkPended(pending));
          chatDebug.pushRoutePending(trigger, url);
        } else {
          chatDebug.pushRouteRejected(trigger, url);
        }
        return;
      }
      const href = notificationHref(url);
      if (!href) {
        chatDebug.pushRouteRejected(trigger, url);
        return;
      }
      chatDebug.pushRouted(trigger, url);
      router.push(href);
    },
    [dispatch, router, userId],
  );

  // Đăng ký thiết bị — chạy lại khi tài khoản đổi, không chạy khi chưa đăng nhập.
  useEffect(() => {
    /*
     * "Chưa biết" KHÁC "đã đăng xuất". Lúc khởi động `useCurrentUser` còn `isPending` nên
     * `userId` là null — rơi xuống nhánh dưới thì mỗi lần mở app đều sinh một sự kiện
     * `push.forgotten` giả, và dấu vết đăng xuất THẬT lẫn vào đó không còn đọc được.
     */
    if (sessionLoading) return;

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
      chatDebug.pushForgotten();
      return;
    }

    const available = isPushAvailable();
    chatDebug.pushAvailable(available);
    if (!available || registeredFor.current === userId) return;

    fireAndForget(async () => {
      /*
       * ĐÃ có quyền thì đi thẳng: không hộp thoại, không đợi cửa. Đây là đường của mọi lần mở app
       * sau lần đầu, và nó phải chạy ngay — token FCM xoay được, và một thiết bị chưa đăng ký lại
       * là một thiết bị im lặng.
       */
      let granted = await hasPushPermission();
      if (granted) {
        chatDebug.pushPermissionAlready();
      } else {
        /*
         * CHƯA có quyền ⇒ phải hỏi, mà hỏi thì phải đúng chỗ. Cửa chưa mở nghĩa là người dùng còn
         * đang ở giữa luồng đăng nhập (màn nhập OTP là ca kinh điển) — im lặng rút lui, effect này
         * sẽ chạy lại khi cửa mở vì `gateOpen` nằm trong danh sách phụ thuộc.
         */
        if (!gateOpen) {
          chatDebug.pushPermissionDeferred();
          return;
        }
        // Qua hàng đợi: trang chủ cũng xin quyền VỊ TRÍ, và hai hộp thoại cùng lúc thì cái sau bị
        // hệ điều hành từ chối thẳng mà không hỏi ai.
        granted = await requestPermissionExclusively('notification', requestPushPermission);
        chatDebug.pushPermission(granted);
      }
      if (!granted) return;

      const token = await getPushToken();
      if (!token) {
        chatDebug.pushTokenMissing();
        return;
      }

      const startedAt = Date.now();
      let device;
      try {
        device = await pushDeviceApi.register({ token, ...deviceInfo() });
      } catch (error) {
        chatDebug.pushRegisterFailed(error, Date.now() - startedAt);
        throw error;
      }
      registeredFor.current = userId;
      /*
       * Token KHÔNG được log — chỉ ghi nhận là đã xong, kèm thời gian đi về VÀ cờ `PUSH_ENABLED`
       * của server. Cờ đó là thứ duy nhất phân biệt "app hỏng" với "server đang tắt đường đẩy",
       * và server trả sẵn nó trong response đăng ký nên không tốn thêm lời gọi nào.
       */
      chatDebug.pushRegistered(Date.now() - startedAt, device.pushEnabled);
    }, 'usePushNotifications.register');
  }, [gateOpen, sessionLoading, userId]);

  // FCM xoay token (khôi phục máy, cài lại app) → POST lại, nếu không máy im lặng vĩnh viễn.
  useEffect(() => {
    if (!userId || !isPushAvailable()) return;
    return onPushTokenRefresh((token) => {
      chatDebug.pushTokenRefreshed();
      fireAndForget(
        () => pushDeviceApi.register({ token, ...deviceInfo() }),
        'usePushNotifications.refresh',
      );
    });
  }, [userId]);

  /*
   * App đang MỞ: hệ điều hành không vẽ gì, nên app tự báo bằng toast của chính nó — VÀ làm mới
   * hộp thư.
   *
   * Bước làm mới là chỗ COM-07 gặp COM-04: chuông đang hiện số cũ, và người dùng vừa được báo có
   * tin mới. Không invalidate thì badge chỉ đúng ở nhịp poll kế tiếp (tới 60 giây sau), tức là
   * app vừa tự mâu thuẫn với chính thông báo nó vừa bắn ra.
   *
   * Phủ cả `chat`: tin nhắn mới cũng là một thông báo đẩy, và nó đổi số chưa đọc của hộp thư.
   */
  useEffect(() => {
    if (!isPushAvailable()) return;
    return onPushMessage((message) => {
      const title = message.notification?.title;
      const body = message.notification?.body;
      chatDebug.pushReceived(PUSH_TRIGGER.FOREGROUND, Boolean(title ?? body));
      chatDebug.pushRaw(PUSH_TRIGGER.FOREGROUND, message);

      // Chữ của thông báo do SERVER gửi và đã địa phương hoá lúc phát; chỉ nhánh dự phòng
      // (payload không có notification block) mới cần một câu của app.
      toast.showInfo(body ?? title ?? t('fallback'));

      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
      /*
       * Và ĐÚNG những danh sách mà loại thông báo này vừa làm đổi.
       *
       * Đường push là đường DUY NHẤT biết được loại (`data.type` do worker đặt), nên nó làm mới
       * hẹp: tin về một chuyến chỉ đụng chuyến/đơn/lịch, không kéo theo gói dịch vụ hay kho xe.
       * Bản chiếu huy hiệu chỉ có một con số nên vẫn phải làm mới rộng — hai đường cùng gọi một
       * hàm, khác nhau đúng ở tham số `type`.
       */
      refreshForNotification(queryClient, notificationTypeOf(message));
      chatDebug.pushInboxRefreshed();
    });
  }, [queryClient, t, toast]);

  // Bấm thông báo khi app đang ở nền.
  useEffect(() => {
    if (!isPushAvailable()) return;
    return onPushOpened((message) => {
      chatDebug.pushReceived(PUSH_TRIGGER.BACKGROUND, Boolean(message.notification));
      chatDebug.pushRaw(PUSH_TRIGGER.BACKGROUND, message);
      open(urlOf(message), PUSH_TRIGGER.BACKGROUND);
    });
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
      if (!message) return;
      chatDebug.pushReceived(PUSH_TRIGGER.COLD_START, Boolean(message.notification));
      chatDebug.pushRaw(PUSH_TRIGGER.COLD_START, message);
      open(urlOf(message), PUSH_TRIGGER.COLD_START);
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
