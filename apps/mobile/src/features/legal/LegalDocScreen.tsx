import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { legalPath, type LegalDoc } from '@xeprime/domain';
// Tên cookie là HỢP ĐỒNG với web server, không phải hằng của riêng app — xem `packages/types/src/locale.ts`.
import { LOCALE_COOKIE_NAME } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppLocale } from '@/i18n/I18nProvider';
import { logger } from '@/lib/logger';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { colors } from '@/theme/tokens';

/**
 * Ẩn phần vỏ của MARKETPLACE bên trong WebView.
 *
 * Trang `/legal/<slug>` nằm trong route group `(public)` của web, nên nó mang theo thanh trên,
 * chân trang và thanh tab dưới của chợ xe. Trong app thì cả ba là điều hướng THỨ HAI chồng lên
 * điều hướng thật — thanh tab của web thậm chí nằm đúng chỗ ngón cái tìm thanh tab của app.
 *
 * Chọn theo THẺ NGỮ NGHĨA (`header`/`footer`/`nav` đứng sau `main`), không theo tên class băm
 * của CSS Module: tên class đổi mỗi lần build web, thẻ ngữ nghĩa thì không. Web đổi cấu trúc
 * thì tệ nhất là vỏ hiện trở lại — trang vẫn đọc được, không có gì vỡ.
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

/**
 * Một văn bản pháp lý, đọc NGAY TRONG app bằng WebView.
 *
 * Vì sao WebView chứ không phải một màn native render từ bó message (`Legal.docs.*` đã nằm sẵn
 * trong bundle): văn bản pháp lý phải sửa được ngay khi luật hoặc chính sách đổi, còn một màn
 * native chỉ đổi được qua một bản app mới và một vòng duyệt store. Web là bản CÓ HIỆU LỰC
 * (ADR 0028 điều 9), nên app phải ĐỌC nó chứ không giữ bản sao thứ hai có thể cũ hơn mà không
 * ai biết.
 *
 * Vì sao WebView chứ không phải `Linking.openURL`: mở trình duyệt hệ thống là đẩy người dùng ra
 * khỏi app giữa chừng một biểu mẫu đăng ký — đúng thứ phải tránh ở chỗ câu cam kết được đặt.
 *
 * **Ngôn ngữ đi bằng COOKIE trên request đầu.** Web đọc `XP_LOCALE` ở phía server trước khi
 * render (ADR 0012: không có `?lang=`, không có tiền tố `/en`), và cookie đó là `httpOnly` nên
 * JS trong trang không đặt được. Gửi thẳng ở header của lần tải đầu là cách duy nhất để một
 * người đang dùng app tiếng Anh không nhận về một trang điều khoản tiếng Việt.
 */
export function LegalDocScreen({ doc, onBack }: { doc: LegalDoc; onBack: () => void }) {
  const t = useTranslations('Legal');
  const tCommon = useTranslations('Common');
  const { locale } = useAppLocale();
  const [failed, setFailed] = useState(false);
  /** Đổi để BẮT `WebView` tải lại — nó không có API "thử lại" nào khác. */
  const [attempt, setAttempt] = useState(0);

  const uri = `${resolveWebBaseUrl()}${legalPath.doc(doc)}`;

  const source = useMemo(
    () => ({ uri, headers: { Cookie: `${LOCALE_COOKIE_NAME}=${locale}` } }),
    [uri, locale],
  );

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  /*
   * WebView chỉ nói "không mở được trang" — nó KHÔNG nói đã thử mở cái gì, mà đó lại là câu hỏi
   * đầu tiên: địa chỉ đến từ `EXPO_PUBLIC_WEB_URL`, thứ được NHÚNG lúc bundle nên có thể vắng
   * trong bundle đang chạy dù `.env` đã có. In URL cùng mã lỗi để phân biệt "trỏ sai chỗ" với
   * "trỏ đúng nhưng server trả lỗi".
   */
  const reportFailure = useCallback(
    (reason: string, detail: Readonly<Record<string, unknown>>) => {
      logger.error(`Không mở được văn bản pháp lý (${reason}): ${uri}`, detail);
      setFailed(true);
    },
    [uri],
  );

  /**
   * Giữ WebView TRONG khu pháp lý.
   *
   * Bốn văn bản viện dẫn lẫn nhau nên đi giữa chúng là chuyện bình thường và phải mượt. Nhưng
   * chân trang của web dẫn ra cả chợ xe: cho phép mọi liên kết ở đây là dựng một bản web đầy đủ
   * bên trong app, nơi nút lui của app không hiểu người dùng đang ở đâu.
   */
  const allowNavigation = useCallback(
    (request: WebViewNavigation) => request.url.includes('/legal'),
    [],
  );

  return (
    <>
      <AppHeader onBack={onBack} title={t(`docs.${doc}.title` as never)} />

      <SafeAreaView style={styles.flex} edges={['left', 'right', 'bottom']}>
        {failed ? (
          <ScreenMessage
            icon="cloud-offline-outline"
            title={tCommon('states.error')}
            /*
             * ĐỊA CHỈ đứng trong câu mô tả, không chỉ nằm trong log: người gặp lỗi này thường là
             * người đang cầm điện thoại, không phải người đang nhìn console Metro — và câu trả
             * lời cho "vì sao vỡ" nằm gọn trong chính chuỗi đó (trỏ vào localhost = thiếu
             * `EXPO_PUBLIC_WEB_URL` trong bundle).
             */
            description={`${tCommon('states.errorHint')}\n${uri}`}
            actionLabel={tCommon('actions.retry')}
            onAction={retry}
          />
        ) : (
          <WebView
            key={attempt}
            source={source}
            /* Cookie ngôn ngữ chỉ có tác dụng khi WebView dùng kho cookie chung của hệ thống. */
            sharedCookiesEnabled
            originWhitelist={['https://*', 'http://*']}
            injectedJavaScript={HIDE_SITE_CHROME}
            onShouldStartLoadWithRequest={allowNavigation}
            onLoadStart={() => logger.debug(`Mở văn bản pháp lý: ${uri}`, { locale })}
            onError={({ nativeEvent }) =>
              reportFailure('native', {
                code: nativeEvent.code,
                description: nativeEvent.description,
                url: nativeEvent.url,
              })
            }
            onHttpError={({ nativeEvent }) =>
              reportFailure('http', {
                statusCode: nativeEvent.statusCode,
                url: nativeEvent.url,
              })
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
