'use client';

import { App, Card } from 'antd';
import { useTranslations } from 'next-intl';
import { PLAN_GUIDE_PLACEHOLDER, PLAN_GUIDE_PLACEHOLDER_VALUES } from '@xeprime/types';
import styles from './PlanGuideTemplateEditor.module.css';

const token = (name: string) => `{{${name}}}`;
const CONDITIONAL_HOTLINE = `{{#${PLAN_GUIDE_PLACEHOLDER.HOTLINE}}}…{{/${PLAN_GUIDE_PLACEHOLDER.HOTLINE}}}`;

/**
 * Bảng tra biến của mẫu email — danh sách lấy từ `PLAN_GUIDE_PLACEHOLDER` (cùng nguồn với server),
 * nên một biến mới ở server hiện ra ở đây mà không phải chép tay. Bấm để chép vào clipboard.
 */
export function PlaceholderCheatSheet() {
  const t = useTranslations('AdminAppConfig');
  const { message } = App.useApp();

  const copy = (value: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => message.success(t('editor.placeholders.copied', { token: value })))
      .catch(() => undefined);
  };

  return (
    <Card size="small" title={t('editor.placeholders.title')} className={styles.sideCard}>
      <p className={styles.hint}>{t('editor.placeholders.hint')}</p>
      <dl className={styles.placeholderList}>
        {PLAN_GUIDE_PLACEHOLDER_VALUES.map((name) => (
          <div key={name} className={styles.placeholderRow}>
            <dt>
              <button type="button" className={styles.token} onClick={() => copy(token(name))}>
                {token(name)}
              </button>
            </dt>
            <dd>{t(`editor.placeholders.${name}`)}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.hint}>{t('editor.placeholders.conditional')}</p>
      <button type="button" className={styles.token} onClick={() => copy(CONDITIONAL_HOTLINE)}>
        {CONDITIONAL_HOTLINE}
      </button>
    </Card>
  );
}
