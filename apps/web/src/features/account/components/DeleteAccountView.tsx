'use client';

import { CloseCircleOutlined, WarningFilled } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Popconfirm, Skeleton } from 'antd';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_META,
  type SupportCaseStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextField } from '@/components/form/TextField';
import {
  useOpenSupportCase,
  useSupportCases,
  useWithdrawAccountDeletion,
} from '@/features/support-cases/hooks/use-support-cases';
import { SUPPORT_SURFACE } from '@/features/support-cases/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';

import { AccountPageHeader } from './AccountPageHeader';
import styles from './DeleteAccountView.module.css';

interface DeleteAccountValues {
  acknowledged: boolean;
  phrase: string;
}

const ITEMS = ['profile', 'vehicles', 'trips', 'billing'] as const;

/**
 * "Yêu cầu xoá tài khoản" — một YÊU CẦU đi vào hàng đợi support của nền tảng, không phải nút xoá.
 *
 * Tái dùng `SupportCase` với loại `account_deletion`: yêu cầu có mã, có trạng thái, có dòng thời
 * gian và admin xử lý tay. Repo chưa có chính sách lưu trữ/ẩn danh hoá đủ để hứa "xoá ngay và
 * không khôi phục được", nên màn này KHÔNG nói câu đó — nó nói đúng điều backend làm.
 *
 * Idempotent từ hai phía: server chỉ giữ tối đa MỘT case loại này còn mở cho mỗi người; client
 * đọc case đang mở (mặc định danh sách chỉ trả case còn mở) và hiện trạng thái thay vì form.
 * Sau khi gửi KHÔNG đăng xuất, KHÔNG đánh dấu tài khoản đã xoá — tài khoản dùng bình thường
 * tới khi XePrime hoàn tất, và người dùng rút yêu cầu được trong lúc chờ.
 */
export function DeleteAccountView() {
  const t = useTranslations('Account.deleteAccount');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const pendingQuery = useSupportCases(SUPPORT_SURFACE.CUSTOMER, {
    category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
    limit: 1,
  });
  const openCase = useOpenSupportCase(SUPPORT_SURFACE.CUSTOMER);
  const withdraw = useWithdrawAccountDeletion();

  const phrase = t('confirmPhrase');
  const schema = useMemo(
    () =>
      yup.object({
        // `.test` thay vì `.oneOf([true])`: giữ kiểu `boolean` cho form, chỉ đổi luật.
        acknowledged: yup
          .boolean()
          .required(t('acknowledgeRequired'))
          .test('acknowledged', t('acknowledgeRequired'), (value) => value === true),
        phrase: yup
          .string()
          .required(t('confirmPhraseMismatch'))
          .test(
            'phrase',
            t('confirmPhraseMismatch'),
            (value) =>
              (value ?? '').trim().toLocaleUpperCase('vi-VN') === phrase.toLocaleUpperCase('vi-VN'),
          ),
      }),
    [phrase, t],
  );

  const { control, handleSubmit, reset, formState } = useForm<DeleteAccountValues>({
    resolver: yupResolver(schema),
    defaultValues: { acknowledged: false, phrase: '' },
    // Nút gửi chỉ bật khi đủ hai điều kiện — phải kiểm ngay lúc gõ, không chờ tới lúc submit.
    mode: 'onChange',
  });

  const onSubmit = handleSubmit(() => {
    openCase.mutate(
      {
        category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
        subject: t('caseSubject'),
        description: t('caseDescription'),
      },
      {
        onSuccess: () => {
          message.success(t('submitted'));
          reset();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const pending = pendingQuery.data?.items[0];

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />

      <Alert
        type="error"
        showIcon
        icon={<WarningFilled />}
        className={styles.warning}
        message={t('warningTitle')}
        description={t('warningBody')}
      />

      {pendingQuery.isLoading ? (
        <div className={styles.card}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      ) : pendingQuery.isError ? (
        <div className={styles.card}>
          <EmptyState
            variant="error"
            title={t('loadError')}
            onRetry={() => void pendingQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        </div>
      ) : pending ? (
        <section className={styles.card} aria-live="polite">
          <div className={styles.pendingHead}>
            <h2 className={styles.cardTitle}>{t('pendingTitle')}</h2>
            <StatusTag
              value={pending.status as SupportCaseStatus}
              meta={SUPPORT_CASE_STATUS_META}
              group="supportCaseStatus"
            />
          </div>
          <p className={styles.cardBody}>{t('pendingBody', { code: pending.code })}</p>
          <p className={styles.meta}>{t('sentAt', { date: fmt.dateTime(pending.createdAt) })}</p>
          <div className={styles.actions}>
            <Popconfirm
              title={t('withdrawConfirm')}
              okText={tCommon('actions.confirm')}
              cancelText={tCommon('actions.cancel')}
              onConfirm={() =>
                withdraw.mutate(pending.id, {
                  onSuccess: () => message.success(t('withdrawn')),
                  onError: (err) => message.error(errorMessage(err)),
                })
              }
            >
              <Button loading={withdraw.isPending}>{t('withdraw')}</Button>
            </Popconfirm>
          </div>
        </section>
      ) : (
        <form onSubmit={onSubmit} noValidate className={styles.card}>
          <h2 className={styles.cardTitle}>{t('confirmTitle')}</h2>
          <p className={styles.cardBody}>{t('confirmBody')}</p>
          <ul className={styles.items}>
            {ITEMS.map((item) => (
              <li key={item} className={styles.item}>
                <CloseCircleOutlined className={styles.itemIcon} aria-hidden="true" />
                <span>{t(`items.${item}`)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.meta}>{t('retentionNote')}</p>

          <div className={styles.fields}>
            <CheckboxField control={control} name="acknowledged" disabled={openCase.isPending}>
              {t('acknowledge')}
            </CheckboxField>
            <TextField
              control={control}
              name="phrase"
              label={t('confirmPhraseLabel')}
              placeholder={t('confirmPhrasePlaceholder', { phrase })}
              autoComplete="off"
              disabled={openCase.isPending}
            />
          </div>

          <div className={styles.actions}>
            <Button
              type="primary"
              danger
              htmlType="submit"
              loading={openCase.isPending}
              disabled={!formState.isValid || openCase.isPending}
            >
              {t('submit')}
            </Button>
            <Button onClick={() => reset()} disabled={!formState.isDirty || openCase.isPending}>
              {t('reset')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
