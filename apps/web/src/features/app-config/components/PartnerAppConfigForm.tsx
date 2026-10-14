'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App, Button, Card } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { APP_CONFIG_CONTACT_PHONE_MAX, APP_CONFIG_CONTACT_PHONE_PATTERN } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  usePlatformPartnerAppConfig,
  useUpdatePlatformPartnerAppConfig,
} from '../hooks/use-app-config';
import type { PartnerAppConfigAdmin } from '../types';
import styles from './PartnerAppConfigForm.module.css';

interface FormValues {
  isPlanPromotionEnabled: boolean;
  supportHotline: string;
  supportZalo: string;
}

function toFormValues(config: PartnerAppConfigAdmin): FormValues {
  return {
    isPlanPromotionEnabled: config.isPlanPromotionEnabled,
    supportHotline: config.supportHotline ?? '',
    supportZalo: config.supportZalo ?? '',
  };
}

/** Ô trống ⇒ `null` (xoá kênh), không gửi chuỗi rỗng. */
const blankToNull = (value: string): string | null => value.trim() || null;

/**
 * Cấu hình app XePrime Partner do nền tảng bật/tắt từ xa.
 *
 * Không cache: query đọc lại mỗi lần mở trang (`staleTime: 0`) vì công tắc tác động NGAY tới người
 * dùng đang mở app — admin phải thấy trạng thái thật, kể cả khi đồng nghiệp vừa đổi nó.
 */
export function PartnerAppConfigForm() {
  const t = useTranslations('AdminAppConfig');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { data, isPending, isError, error, refetch } = usePlatformPartnerAppConfig();
  const update = useUpdatePlatformPartnerAppConfig();

  const schema = useMemo(() => {
    const contact = yup
      .string()
      .defined()
      .trim()
      .max(APP_CONFIG_CONTACT_PHONE_MAX, t('config.contactTooLong', { max: APP_CONFIG_CONTACT_PHONE_MAX }))
      // Ô trống hợp lệ (xoá kênh); có giá trị thì đúng luật của DTO API.
      .test('phone', t('config.contactInvalid'), (v) => !v || APP_CONFIG_CONTACT_PHONE_PATTERN.test(v));
    return yup.object({
      isPlanPromotionEnabled: yup.boolean().defined(),
      supportHotline: contact,
      supportZalo: contact,
    });
  }, [t]);

  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { isPlanPromotionEnabled: false, supportHotline: '', supportZalo: '' },
  });

  // Đồng bộ form với bản server mỗi khi bản đó đổi (tải xong, lưu xong, đồng nghiệp vừa đổi).
  useEffect(() => {
    if (data) reset(toFormValues(data));
  }, [data, reset]);

  if (isPending) return <LoadingState variant="page" label={t('config.loading')} />;
  if (isError || !data) {
    return (
      <EmptyState
        variant="error"
        title={t('config.loadError')}
        description={errorMessage(error)}
        onRetry={() => void refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const onSubmit = handleSubmit((values) => {
    if (update.isPending) return;
    update.mutate(
      {
        isPlanPromotionEnabled: values.isPlanPromotionEnabled,
        supportHotline: blankToNull(values.supportHotline),
        supportZalo: blankToNull(values.supportZalo),
      },
      {
        onSuccess: () => message.success(t('config.saved')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const updatedAt = fmt.dateTime(data.updatedAt);

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      <Card className={styles.card}>
        <SwitchField
          control={control}
          name="isPlanPromotionEnabled"
          label={t('config.isPlanPromotionEnabled.label')}
          description={t('config.isPlanPromotionEnabled.description')}
          disabled={update.isPending}
        />
      </Card>

      <Card className={styles.card} title={t('config.contactTitle')}>
        <p className={styles.hint}>{t('config.contactHint')}</p>
        <div className={styles.contactGrid}>
          <TextField
            control={control}
            name="supportHotline"
            type="tel"
            label={t('config.hotline')}
            placeholder={t('config.hotlinePlaceholder')}
            disabled={update.isPending}
          />
          <TextField
            control={control}
            name="supportZalo"
            type="tel"
            label={t('config.zalo')}
            placeholder={t('config.zaloPlaceholder')}
            help={t('config.zaloHint')}
            disabled={update.isPending}
          />
        </div>
      </Card>

      <div className={styles.footer}>
        <span className={styles.meta}>
          {data.updatedByName
            ? t('config.metaBy', { updatedAt, name: data.updatedByName })
            : t('config.meta', { updatedAt })}
          {formState.isDirty ? <span className={styles.dirty}>{t('config.unsaved')}</span> : null}
        </span>
        <div className={styles.actions}>
          <Button
            onClick={() => reset(toFormValues(data))}
            disabled={!formState.isDirty || update.isPending}
          >
            {t('config.reset')}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={update.isPending}
            disabled={!formState.isDirty}
          >
            {t('config.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}
