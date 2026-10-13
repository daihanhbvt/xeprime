'use client';

import { SendOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Select, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { PlanGuideVariant } from '@xeprime/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  usePlanGuideTemplatePreview,
  useSendTestPlanGuideTemplate,
} from '../hooks/use-app-config';
import type { PlanGuideLocale } from '../types';
import styles from './PlanGuideTemplateEditor.module.css';

/** Đợi người soạn ngừng gõ rồi mới dựng lại bản xem trước. */
const PREVIEW_DEBOUNCE_MS = 600;

/**
 * Xem trước email bằng server (`POST …/preview` — dữ liệu mẫu, gói thật) cho bản NHÁP đang soạn.
 *
 * HTML hiện trong `<iframe sandbox="">` + `srcDoc`: không script, không form, không điều hướng,
 * origin riêng — thân mẫu là HTML do admin gõ tay, nên nó không bao giờ chạy trong trang quản trị.
 */
export function TemplatePreviewPane({
  templateId,
  variant,
  locale,
  onLocaleChange,
  subject,
  body,
}: {
  /** `null` khi đang tạo mới — server chỉ xem trước được mẫu đã có id. */
  templateId: string | null;
  /** Nội dung đang soạn — xem trước và gửi thử đúng biến thể này. */
  variant: PlanGuideVariant;
  locale: PlanGuideLocale;
  onLocaleChange: (locale: PlanGuideLocale) => void;
  subject: string;
  body: string;
}) {
  const t = useTranslations('AdminAppConfig');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  // Debounce từng chuỗi (giá trị nguyên thuỷ) — một object mới mỗi lần render sẽ không bao giờ ổn định.
  const draftSubject = useDebouncedValue(subject, PREVIEW_DEBOUNCE_MS);
  const draftBody = useDebouncedValue(body, PREVIEW_DEBOUNCE_MS);
  const preview = usePlanGuideTemplatePreview(templateId, {
    locale,
    variant,
    // Ô trống ⇒ để server dùng bản đã lưu thay vì dựng một thư rỗng.
    ...(draftSubject.trim() ? { subject: draftSubject } : {}),
    ...(draftBody.trim() ? { body: draftBody } : {}),
  });
  const sendTest = useSendTestPlanGuideTemplate();

  const onSendTest = () => {
    if (!templateId || sendTest.isPending) return;
    sendTest.mutate(
      { id: templateId, locale, variant },
      {
        onSuccess: (res) => message.success(t('editor.sendTestDone', { to: res.to })),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  };

  return (
    <Card
      size="small"
      title={t('editor.preview.title')}
      className={styles.sideCard}
      extra={
        preview.isFetching && preview.data ? (
          <span className={styles.hint}>{t('editor.preview.updating')}</span>
        ) : null
      }
    >
      {!templateId ? (
        <Alert type="info" showIcon message={t('editor.preview.createFirst')} />
      ) : (
        <>
          <div className={styles.previewControls}>
            <Select<PlanGuideLocale>
              className={styles.previewSelect}
              aria-label={t('editor.preview.locale')}
              value={locale}
              onChange={onLocaleChange}
              options={[
                { value: 'vi', label: t('editor.locale.vi') },
                { value: 'en', label: t('editor.locale.en') },
              ]}
            />
            <span className={styles.hint}>{t('editor.preview.variant', { variant: t(`variant.${variant}`) })}</span>
          </div>

          {preview.isError && !preview.data ? (
            <Alert
              type="error"
              showIcon
              message={t('editor.preview.error')}
              description={errorMessage(preview.error)}
            />
          ) : !preview.data ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <>
              <p className={styles.previewSubject}>
                <span className={styles.hint}>{t('editor.preview.subject')}: </span>
                {preview.data.subject}
              </p>
              <iframe
                className={styles.previewFrame}
                title={t('editor.preview.frameTitle')}
                sandbox=""
                srcDoc={preview.data.html}
              />
            </>
          )}

          <div className={styles.sendTest}>
            <Button icon={<SendOutlined />} loading={sendTest.isPending} onClick={onSendTest}>
              {t('editor.sendTest')}
            </Button>
            <span className={styles.hint}>{t('editor.sendTestUsesSaved')}</span>
          </div>
        </>
      )}
    </Card>
  );
}
