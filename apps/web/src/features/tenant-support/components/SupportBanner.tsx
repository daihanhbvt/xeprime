'use client';

import { CustomerServiceOutlined, LogoutOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SUPPORT_MODE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useRevokeSupportContext } from '../hooks/use-tenant-support';
import type { SupportContext } from '../types';
import styles from './SupportBanner.module.css';

/**
 * Băng cố định đầu không gian hỗ trợ (ADR 0050): LUÔN nói rõ đây là nhân sự nền tảng đang thao
 * tác trong khu của một gian hàng — ai, ở đâu, tới khi nào — và một lối thoát.
 *
 * Không có đường nào ẩn băng này trong phiên: một ảnh chụp màn hình khu gian hàng không được
 * trông giống chính chủ gian hàng đang làm.
 */
export function SupportBanner({ context }: { context: SupportContext }) {
  const t = useTranslations('TenantSupport.banner');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { message } = App.useApp();
  const revoke = useRevokeSupportContext(context.id);

  function exit() {
    revoke.mutate(undefined, {
      onSuccess: () => router.push(ROUTES.MANAGE.ADMIN_TENANTS),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.banner} role="region" aria-label={t('regionLabel')}>
      <CustomerServiceOutlined className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        <p className={styles.title}>{t('title', { tenant: context.tenant.name })}</p>
        <p className={styles.meta}>
          <Tag className={styles.tag}>{t(`workspace.${context.workspace}`)}</Tag>
          <Tag className={styles.tag}>
            {context.mode === SUPPORT_MODE.ASSIST ? t('mode.assist') : t('mode.view')}
          </Tag>
          <span>{t('actor', { name: context.actor.displayName })}</span>
          <span>{t('expiresAt', { time: fmt.dateTime(context.expiresAt) })}</span>
        </p>
        {context.writeRestriction ? (
          <p className={styles.restriction}>{t(`restriction.${context.writeRestriction}`)}</p>
        ) : null}
      </div>
      <Button icon={<LogoutOutlined />} loading={revoke.isPending} onClick={exit}>
        {t('exit')}
      </Button>
    </div>
  );
}
