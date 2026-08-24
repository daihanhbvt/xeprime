import { useTranslations } from 'use-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ScreenMessage } from './ScreenMessage';

interface ScreenErrorProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ScreenError({ error, title, onRetry }: ScreenErrorProps) {
  const t = useTranslations('Common');
  const errorMessage = useErrorMessage();

  return (
    <ScreenMessage
      title={title ?? t('error.title')}
      description={errorMessage(error)}
      {...(onRetry ? { actionLabel: t('actions.retry'), onAction: onRetry } : {})}
    />
  );
}
