import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { WebView, type WebViewNavigation } from 'react-native-webview';
// Tên cookie là HỢP ĐỒNG với web server, không phải hằng của riêng app — xem `packages/types/src/locale.ts`.
import { LOCALE_COOKIE_NAME } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppLocale } from '@/i18n/I18nProvider';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/tokens';

/**
 * Ẩn phần vỏ của MARKETPLACE bên trong WebView.
 *
 * Mọi trang nội dung của web (`/about`, `/legal/<slug>`) nằm trong route group `(public)`, nên nó
 * mang theo thanh trên, chân trang và thanh tab dưới của chợ xe. Trong app thì cả ba là điều
 * hướng THỨ HAI chồng lên điều hướng thật — thanh tab của web thậm chí nằm đúng chỗ ngón cái tìm
 * thanh tab của app.
 *
 * Chọn theo THẺ NGỮ NGHĨA (`header`/`footer`/`nav` đứng sau `main`), không theo tên class băm của
 * CSS Module: tên class đổi mỗi lần build web, thẻ ngữ nghĩa thì không. Web đổi cấu trúc thì tệ
 * nhất là vỏ hiện trở lại — trang vẫn đọc được, không có gì vỡ.
 */
const HIDE_SITE_CHROME = `
  (function () {
    var style = document.createElement('style');
    style.textContent =
      'header, footer, main ~ nav { display: none !important; }' +
      'main { padding-top: 0 !important; }';
    document.head.appendChild(style);
  })();
  true;
`;

export interface WebDocViewProps {
  /** Địa chỉ mở lần đầu — đầy đủ, đã gắn neo nếu có. */
  readonly uri: string;
  /**
   * Tiêu đề thanh đầu màn cho địa chỉ ĐANG hiện.
   *
   * Là một HÀM chứ không phải một chuỗi: trang web dẫn tiếp sang trang khác ngay trong WebView,
   * và một tiêu đề cố định sẽ đứng nguyên khi nội dung dưới nó đã đổi.
   */
  readonly title: (url: string) => string;
  /**
   * Cho địa chỉ này đi tiếp trong WebView hay không.
   *
   * Người gọi tự xử lý các đích rời WebView (mở màn native) TRƯỚC khi trả `false` — luật "đi đâu"
   * thuộc về từng khu nội dung, không thuộc về bộ đọc này.
   *
   * Hàm này được gọi cho MỖI địa chỉ đúng MỘT lần, kể cả khi trang web chuyển trang phía client
   * (xem `handleUrl`). Việc mở màn native nên đi qua `useNavigateOnce` để một cú chạm không đẩy
   * hai màn chồng nhau.
   */
  readonly allowNavigation: (url: string) => boolean;
  /** Rời màn hẳn — chỉ được gọi khi WebView không còn bước nào để lui. */
  readonly onBack: () => void;
  /** Tên khu nội dung trong log, ví dụ `văn bản pháp lý`. */
  readonly logLabel: string;
}

/**
 * Bộ đọc một trang NỘI DUNG của web, ngay trong app.
 *
 * ## Vì sao WebView chứ không phải màn native
 *
 * Văn bản pháp lý và trang giới thiệu phải sửa được ngay khi luật hoặc chính sách đổi, còn một
 * màn native chỉ đổi được qua một bản app mới và một vòng duyệt store. Web là bản CÓ HIỆU LỰC, nên
 * app phải ĐỌC nó chứ không giữ bản sao thứ hai có thể cũ hơn mà không ai biết. Bó message
 * (`Legal.docs.*`, `About.*`) vẫn nằm trong gốc chung, nhưng chúng dành cho web.
 *
 * ## Vì sao WebView chứ không phải `Linking.openURL`
 *
 * Mở trình duyệt hệ thống là đẩy người dùng ra khỏi app giữa chừng một biểu mẫu đăng ký — đúng
 * thứ phải tránh ở chỗ câu cam kết được đặt.
 *
 * ## Ngôn ngữ đi bằng COOKIE trên request đầu
 *
 * Web đọc `XP_LOCALE` ở phía server trước khi render (ADR 0012: không có `?lang=`, không có tiền
 * tố `/en`), và cookie đó là `httpOnly` nên JS trong trang không đặt được. Gửi thẳng ở header của
 * lần tải đầu là cách duy nhất để một người đang dùng app tiếng Anh không nhận về một trang điều
 * khoản tiếng Việt.
 *
 * ## Vì sao bộ đọc này là MỘT chỗ
 *
 * Hai khu nội dung (`/about`, `/legal`) dùng y hệt bộ khung: ẩn vỏ web, cookie ngôn ngữ, trạng
 * thái lỗi có in địa chỉ, nút thử lại, và — từ 23/09/2026 — thanh đầu màn bám theo trang đang hiện
 * cùng nút lui hiểu lịch sử WebView. Để hai bản là để hai bản lệch nhau: lần này cả hai đều cần
 * cùng một sửa chữa, và bản thứ hai đã bị bỏ sót đúng một vòng rà soát.
 */
export function WebDocView({
  uri,
  title,
  allowNavigation,
  onBack,
  logLabel,
}: WebDocViewProps) {
  const tCommon = useTranslations('Common');
  const { locale } = useAppLocale();

  const web = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  /** Đổi để BẮT `WebView` tải lại — nó không có API "thử lại" nào khác. */
  const [attempt, setAttempt] = useState(0);
  /** Địa chỉ ĐANG hiện; khác `uri` ngay khi người đọc bấm một liên kết trong trang. */
  const [current, setCurrent] = useState(uri);
  /** WebView có lịch sử RIÊNG: đi ba trang rồi bấm lui phải về trang trước, không rời màn. */
  const [canGoBack, setCanGoBack] = useState(false);

  const source = useMemo(
    () => ({ uri, headers: { Cookie: `${LOCALE_COOKIE_NAME}=${locale}` } }),
    [uri, locale],
  );

  /* Tải lại là dựng lại WebView: lịch sử và trang đang hiện trở về đúng lúc mở màn. */
  const retry = useCallback(() => {
    setFailed(false);
    setCurrent(uri);
    setCanGoBack(false);
    setAttempt((n) => n + 1);
  }, [uri]);

  /*
   * WebView chỉ nói "không mở được trang" — nó KHÔNG nói đã thử mở cái gì, mà đó lại là câu hỏi
   * đầu tiên: địa chỉ đến từ `EXPO_PUBLIC_WEB_URL`, thứ được NHÚNG lúc bundle nên có thể vắng
   * trong bundle đang chạy dù `.env` đã có. In URL cùng mã lỗi để phân biệt "trỏ sai chỗ" với
   * "trỏ đúng nhưng server trả lỗi".
   */
  const reportFailure = useCallback(
    (reason: string, detail: Readonly<Record<string, unknown>>) => {
      logger.error(`Không mở được ${logLabel} (${reason}): ${current}`, detail);
      setFailed(true);
    },
    [current, logLabel],
  );

  /**
   * Quyết định cho MỘT địa chỉ, dùng chung cho cả hai cửa mà WebView báo về.
   *
   * ## Vì sao phải có HAI cửa (xác minh trên máy 24/09/2026)
   *
   * `onShouldStartLoadWithRequest` trên Android là `WebViewClient.shouldOverrideUrlLoading`, và
   * Android **không gọi** hàm đó cho một cú chuyển trang bằng History API. Trang web của XePrime
   * là Next.js App Router: mọi `<Link>` đều chuyển trang PHÍA CLIENT. Hệ quả đo được: bấm "Tới
   * trung tâm hỗ trợ" trong một văn bản pháp lý thì trang `/support` của web mở ngay bên trong
   * WebView pháp lý — màn hỗ trợ native không hề chạy, và không có gì báo lỗi.
   *
   * Nên luật phải chạy cả ở `onNavigationStateChange`. Ở cửa đó trang ĐÃ hiện rồi, nên ngoài việc
   * mở màn native còn phải KÉO WEBVIEW LUI về chỗ cũ — nếu không, lúc người dùng quay lại họ thấy
   * một trang không thuộc khu này nằm dưới tiêu đề của khu này.
   *
   * Chống gọi hai lần: một lần tải THẬT chỉ đi qua cửa thứ nhất (trả `false` thì trang không tải,
   * nên không có trạng thái điều hướng nào bắn ra); một cú chuyển phía client chỉ đi qua cửa thứ
   * hai. Trường hợp cả hai cùng bắn thì `useNavigateOnce` ở phía người gọi nuốt cú thứ hai.
   */
  const handleUrl = useCallback(
    (url: string, alreadyShown: boolean) => {
      // Địa chỉ trung gian (`about:blank` giữa hai lần tải) không được đổi tiêu đề của trang đang hiện.
      if (!url.startsWith('http')) return true;

      if (allowNavigation(url)) {
        setCurrent(url);
        return true;
      }

      if (alreadyShown) {
        // Lui một bước để trở lại trang hợp lệ; không lui được thì dựng lại WebView ở địa chỉ gốc.
        if (canGoBack) web.current?.goBack();
        else setAttempt((n) => n + 1);
      }
      return false;
    },
    [allowNavigation, canGoBack],
  );

  const trackPage = useCallback(
    (state: WebViewNavigation) => {
      setCanGoBack(state.canGoBack);
      handleUrl(state.url, true);
    },
    [handleUrl],
  );

  /**
   * Lui MỘT bước trong khu nội dung trước khi rời màn.
   *
   * Người đọc đi điều khoản → bảo mật → quy chế bằng cặp trước/sau rồi bấm lui: nếu màn thoát hẳn
   * thì hai bước đọc ở giữa biến mất, đúng thứ nút lui của trình duyệt không bao giờ làm.
   *
   * Khi đang ở màn LỖI thì không còn trang nào để lui về — lui là rời màn.
   */
  const stepBack = useCallback(() => {
    if (canGoBack && !failed) {
      web.current?.goBack();
      return;
    }
    onBack();
  }, [canGoBack, failed, onBack]);

  /*
   * Nút lui CỨNG của Android phải làm đúng việc mà nút lui trên thanh đầu màn làm. Hai nút lui cho
   * hai kết quả khác nhau trên cùng một màn là một cái bẫy, không phải một lựa chọn.
   */
  useFocusEffect(
    useCallback(() => {
      if (!canGoBack || failed) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        web.current?.goBack();
        return true;
      });
      return () => subscription.remove();
    }, [canGoBack, failed]),
  );

  return (
    <>
      <AppHeader onBack={stepBack} title={title(current)} />

      <SafeAreaView style={styles.flex} edges={['left', 'right', 'bottom']}>
        {failed ? (
          <ScreenMessage
            icon="cloud-offline-outline"
            title={tCommon('states.error')}
            /*
             * ĐỊA CHỈ đứng trong câu mô tả, không chỉ nằm trong log: người gặp lỗi này thường là
             * người đang cầm điện thoại, không phải người đang nhìn console Metro — và câu trả lời
             * cho "vì sao vỡ" nằm gọn trong chính chuỗi đó (trỏ vào localhost = thiếu
             * `EXPO_PUBLIC_WEB_URL` trong bundle).
             */
            description={`${tCommon('states.errorHint')}\n${current}`}
            actionLabel={tCommon('actions.retry')}
            onAction={retry}
          />
        ) : (
          <WebView
            key={attempt}
            ref={web}
            source={source}
            /* Cookie ngôn ngữ chỉ có tác dụng khi WebView dùng kho cookie chung của hệ thống. */
            sharedCookiesEnabled
            originWhitelist={['https://*', 'http://*']}
            injectedJavaScript={HIDE_SITE_CHROME}
            onShouldStartLoadWithRequest={(request) => handleUrl(request.url, false)}
            onNavigationStateChange={trackPage}
            onLoadStart={() => logger.debug(`Mở ${logLabel}: ${uri}`, { locale })}
            onError={({ nativeEvent }) =>
              reportFailure('native', {
                code: nativeEvent.code,
                description: nativeEvent.description,
                url: nativeEvent.url,
              })
            }
            onHttpError={({ nativeEvent }) =>
              reportFailure('http', { statusCode: nativeEvent.statusCode, url: nativeEvent.url })
            }
            startInLoadingState
            renderLoading={() => (
              <YStack style={StyleSheet.absoluteFill} ai="center" jc="center" bg={colors.background}>
                <ActivityIndicator color={colors.primary} />
              </YStack>
            )}
            style={styles.web}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { backgroundColor: colors.background, flex: 1 },
  web: { backgroundColor: colors.background, flex: 1 },
});
