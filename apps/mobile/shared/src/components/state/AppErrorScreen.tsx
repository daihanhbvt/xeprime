import { IntlProvider, useTranslations } from 'use-intl';
import { TamaguiProvider } from 'tamagui';
import { Screen } from '@/components/layout/Screen';
import { APP_TIME_ZONE, DEFAULT_LOCALE } from '@/i18n/config';
import { MESSAGES } from '@/i18n/messages';
import { tamaguiConfig } from '@/theme/tamagui.config';
import { ScreenMessage } from './ScreenMessage';

interface AppErrorScreenProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Màn lỗi cấp cao nhất.
 *
 * Nó nằm NGOÀI mọi provider của app (expo-router bắt lỗi ở `ErrorBoundary` của layout gốc), nên
 * phải tự dựng lại đủ những gì nó cần: `IntlProvider` cho chữ và `TamaguiProvider` cho nút.
 * Thiếu một trong hai là màn lỗi tự nổ — người dùng mất luôn cả thông báo lẫn nút thử lại.
 *
 * Ngôn ngữ dùng bản MẶC ĐỊNH, không đọc lựa chọn đã lưu: lỗi có thể đến từ chính provider ngôn
 * ngữ, và đọc lại nó ở đây là mời lỗi thứ hai chồng lên lỗi đầu.
 */
export function AppErrorScreen({ error, onRetry }: AppErrorScreenProps) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <IntlProvider
        locale={DEFAULT_LOCALE}
        messages={MESSAGES[DEFAULT_LOCALE]}
        timeZone={APP_TIME_ZONE}
      >
        <AppErrorBody error={error} onRetry={onRetry} />
      </IntlProvider>
    </TamaguiProvider>
  );
}

function AppErrorBody({ error, onRetry }: AppErrorScreenProps) {
  const t = useTranslations('MobileShell');
  const tCommon = useTranslations('Common');

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        title={t('appError.title')}
        description={error.message}
        actionLabel={tCommon('actions.retry')}
        onAction={onRetry}
      />
    </Screen>
  );
}
