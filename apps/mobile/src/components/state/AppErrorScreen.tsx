import { IntlProvider, useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { APP_TIME_ZONE, DEFAULT_LOCALE } from '@/i18n/config';
import { MESSAGES } from '@/i18n/messages';
import { ScreenMessage } from './ScreenMessage';

interface AppErrorScreenProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Màn lỗi cấp cao nhất. Dựng `IntlProvider` riêng ở ngôn ngữ mặc định vì lỗi có thể đến từ
 * chính provider của app — đọc ngôn ngữ đã chọn ở đây là mời lỗi thứ hai chồng lên lỗi đầu.
 */
export function AppErrorScreen({ error, onRetry }: AppErrorScreenProps) {
  return (
    <IntlProvider
      locale={DEFAULT_LOCALE}
      messages={MESSAGES[DEFAULT_LOCALE]}
      timeZone={APP_TIME_ZONE}
    >
      <AppErrorBody error={error} onRetry={onRetry} />
    </IntlProvider>
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
