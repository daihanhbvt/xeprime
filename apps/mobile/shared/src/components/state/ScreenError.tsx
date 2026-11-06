import { useTranslations } from 'use-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorMessage } from '@/lib/get-error-message';
import { isOfflineError } from '@/lib/network-error';
import { ScreenMessage } from './ScreenMessage';

interface ScreenErrorProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /**
   * Câu mô tả lấy từ đâu — theo ĐÚNG màn tương ứng bên web. `code` (mặc định) = dịch theo mã
   * lỗi (`useErrorMessage`); `backend` = câu nguyên văn của server (`getErrorMessage`).
   */
  messageFrom?: 'code' | 'backend';
}

export function ScreenError({ error, title, onRetry, messageFrom = 'code' }: ScreenErrorProps) {
  const t = useTranslations('Common');
  const tNetwork = useTranslations('MobileShell.network');
  const errorMessage = useErrorMessage();

  // Mất mạng thì nói đúng là mất mạng — câu lỗi chung làm khách tưởng app hỏng (isOfflineError).
  if (isOfflineError(error)) {
    return (
      <ScreenMessage
        icon="cloud-offline-outline"
        title={tNetwork('errorTitle')}
        description={tNetwork('errorHint')}
        {...(onRetry ? { actionLabel: t('actions.retry'), onAction: onRetry } : {})}
      />
    );
  }

  return (
    <ScreenMessage
      icon="alert-circle-outline"
      title={title ?? t('states.error')}
      description={messageFrom === 'backend' ? getErrorMessage(error) : errorMessage(error)}
      {...(onRetry ? { actionLabel: t('actions.retry'), onAction: onRetry } : {})}
    />
  );
}
