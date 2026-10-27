'use client';

import { CloseCircleOutlined, WarningFilled } from '@ant-design/icons';
import { Alert, App, Button, Popconfirm, Skeleton } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SUPPORT_CASE_STATUS_META, type SupportCaseStatus } from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CheckboxField } from '@/components/form/CheckboxField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  ACCOUNT_DELETION_ITEMS as ITEMS,
  useAccountDeletionForm,
  useAccountDeletionRequest,
} from '../hooks/use-account-deletion';
import { AccountPageHeader } from './AccountPageHeader';
import styles from './DeleteAccountView.module.css';

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
export function DeleteAccountView({
  headingLevel = 'h1',
  embedded = false,
  impact,
}: {
  headingLevel?: 'h1' | 'h2';
  /**
   * Nằm TRONG một section đã có tiêu đề (trang Tài khoản & bảo mật của site partner). Khi đó form
   * KHÔNG mở sẵn: thao tác khó lùi lại này không được nằm phơi giữa trang cạnh ô đổi mật khẩu.
   * Một dòng giới thiệu + nút; bấm mới hiện ảnh hưởng và form xác nhận. Yêu cầu đang chờ thì
   * vẫn hiện thẳng — đó là trạng thái người dùng cần thấy, không phải một thao tác.
   */
  embedded?: boolean;
  /** Khối "ảnh hưởng của việc đóng tài khoản" — chỉ hiện khi đã mở form (chế độ nhúng). */
  impact?: ReactNode;
} = {}) {
  const t = useTranslations('Account.deleteAccount');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const { pendingQuery, pending, openCase, withdraw } = useAccountDeletionRequest();
  /** Chế độ nhúng: form xác nhận đã được mở chưa. */
  const [expanded, setExpanded] = useState(false);
  const { control, onSubmit, reset, formState } = useAccountDeletionForm(openCase, () =>
    setExpanded(false),
  );

  // Nhúng: section đã giữ `h2` và khung — tiêu đề con xuống `h3`, khối con không vẽ viền thứ hai.
  const SubHeading = embedded ? 'h3' : 'h2';
  const box = embedded ? styles.inset : styles.card;

  const warning = (
    <Alert
      type="error"
      showIcon
      icon={<WarningFilled />}
      className={styles.warning}
      title={t('warningTitle')}
      description={t('warningBody')}
    />
  );

  return (
    <div className={styles.page}>
      {embedded ? null : (
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} as={headingLevel} />
      )}
      {embedded ? null : warning}

      {pendingQuery.isLoading ? (
        <div className={box}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      ) : pendingQuery.isError ? (
        <div className={box}>
          <EmptyState
            variant="error"
            title={t('loadError')}
            onRetry={() => void pendingQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        </div>
      ) : pending ? (
        <section className={box} aria-live="polite">
          <div className={styles.pendingHead}>
            <SubHeading className={styles.cardTitle}>{t('pendingTitle')}</SubHeading>
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
      ) : embedded && !expanded ? (
        <div className={styles.intro}>
          <p className={styles.cardBody}>{t('embeddedIntro')}</p>
          <Button danger onClick={() => setExpanded(true)}>
            {t('start')}
          </Button>
        </div>
      ) : (
        <div className={styles.flow}>
          {embedded ? impact : null}
          {embedded ? warning : null}
          <form onSubmit={onSubmit} noValidate className={box}>
            <SubHeading className={styles.cardTitle}>{t('confirmTitle')}</SubHeading>
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
              {embedded ? (
                <Button
                  onClick={() => {
                    reset();
                    setExpanded(false);
                  }}
                  disabled={openCase.isPending}
                >
                  {t('collapse')}
                </Button>
              ) : (
                <Button onClick={() => reset()} disabled={!formState.isDirty || openCase.isPending}>
                  {t('reset')}
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
