'use client';

import {
  CheckOutlined,
  ExclamationCircleOutlined,
  ExclamationOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { App, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { TENANT_ROLE } from '@xeprime/types';

import { EmptyState } from '@/components/feedback/EmptyState';
import { CheckboxField } from '@/components/form/CheckboxField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';

import {
  ACCOUNT_DELETION_ITEMS,
  useAccountDeletionForm,
  useAccountDeletionImpact,
  useAccountDeletionRequest,
} from '../hooks/use-account-deletion';
import styles from './AccountDeletionDialog.module.css';

/**
 * Hộp "Yêu cầu xoá tài khoản" của trang Bảo mật tài khoản — SITE KHÁCH (design Account / Security -
 * Delete, Figma `21621:68914` · `21621:69376`).
 *
 * Vẫn là một YÊU CẦU (support case `account_deletion`, nền tảng xử lý tay), không phải nút xoá —
 * cùng hook với khối nhúng `DeleteAccountView` của site partner. Hai trạng thái:
 *
 *  - Chưa có yêu cầu: "Kiểm tra điều kiện" (số dư ví điểm, lệnh rút còn giữ tiền, chuyến đi thuê
 *    chưa khép) → quy trình xử lý → dữ liệu bị xử lý → tick xác nhận → gửi. Điều kiện KHÔNG chặn
 *    nút gửi (người quyết là XePrime — ADR 0033); nó chỉ bảo đảm người gửi biết mình gửi gì.
 *  - Đã có yêu cầu đang mở: trạng thái + mã + lúc gửi, và nút rút yêu cầu.
 *
 * Gửi xong hộp KHÔNG đóng: danh sách case được làm mới và hộp tự chuyển sang trạng thái "đang xử
 * lý" — đúng màn thứ hai của bản vẽ, và người dùng thấy ngay mã yêu cầu của mình.
 *
 * Bản vẽ có vài chỗ KHÔNG theo: hạn "3 - 5 ngày làm việc" (chưa có cam kết SLA), "xoá vĩnh viễn" và
 * "Ví điện tử" (số dư là sổ công nợ, không phải ví điện tử — ADR 0033 điều 1).
 */
export function AccountDeletionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Account.deleteAccount');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();

  const { pendingQuery, pending, openCase, withdraw } = useAccountDeletionRequest();
  const { control, onSubmit, reset, formState } = useAccountDeletionForm(openCase);

  const close = () => {
    // Một lần mở là một lần đọc mới — tick xác nhận không đi theo sang lần mở sau.
    reset();
    onClose();
  };

  const busy = openCase.isPending || withdraw.isPending;

  const footer =
    pendingQuery.isLoading || pendingQuery.isError ? null : pending ? (
      <div className={styles.footer}>
        <Button size="large" onClick={close} disabled={busy}>
          {tCommon('actions.back')}
        </Button>
        <Button
          size="large"
          type="primary"
          loading={withdraw.isPending}
          onClick={() => {
            if (withdraw.isPending) return;
            withdraw.mutate(pending.id, {
              onSuccess: () => message.success(t('withdrawn')),
              onError: (err) => message.error(errorMessage(err)),
            });
          }}
        >
          {t('withdraw')}
        </Button>
      </div>
    ) : (
      <div className={styles.footer}>
        <Button size="large" onClick={close} disabled={busy}>
          {tCommon('actions.back')}
        </Button>
        <Button
          size="large"
          type="primary"
          danger
          loading={openCase.isPending}
          disabled={!formState.isValid}
          onClick={() => void onSubmit()}
        >
          {t('submit')}
        </Button>
      </div>
    );

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      size="lg"
      confirmLoading={busy}
      title={
        <span className={styles.heading}>
          <span className={styles.title}>{t('title')}</span>
          <span className={styles.subtitle}>{t('dialogSubtitle')}</span>
        </span>
      }
      footer={footer}
    >
      {pendingQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : pendingQuery.isError ? (
        <EmptyState
          variant="error"
          title={t('loadError')}
          onRetry={() => void pendingQuery.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : pending ? (
        <div className={styles.body} aria-live="polite">
          <section className={styles.processing}>
            <span className={styles.processingIcon} aria-hidden="true">
              <LoadingOutlined />
            </span>
            <h3 className={styles.processingTitle}>{t('pendingTitle')}</h3>
            <p className={styles.processingText}>{t('pendingBody', { code: pending.code })}</p>
            <p className={styles.processingText}>
              {t('sentAt', { date: fmt.dateTime(pending.createdAt) })}
            </p>
          </section>
          <DeletedData />
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className={styles.body}>
          <Conditions />

          <section className={styles.process} role="note">
            <span className={styles.processIcon} aria-hidden="true">
              <ExclamationCircleOutlined />
            </span>
            <div className={styles.processText}>
              <h3 className={styles.processTitle}>{t('warningTitle')}</h3>
              <p>{t('warningBody')}</p>
            </div>
          </section>

          <DeletedData />

          <CheckboxField control={control} name="acknowledged" disabled={openCase.isPending}>
            <span className={styles.acknowledge}>{t('acknowledge')}</span>
          </CheckboxField>
        </form>
      )}
    </ResponsiveDialog>
  );
}

/** "Kiểm tra điều kiện xoá tài khoản" — số dư, lệnh rút, chuyến chưa khép (chỉ để biết, không chặn). */
function Conditions() {
  const t = useTranslations('Account.deleteAccount');
  const tImpact = useTranslations('Account.deletionImpact');
  const fmt = useAppFormat();
  const { user, wallet, holding, openTrips, loading, failed } = useAccountDeletionImpact();

  const checks = [
    { key: 'withdrawals', ok: holding === 0, label: tImpact('withdrawals', { count: holding }) },
    { key: 'trips', ok: openTrips === 0, label: tImpact('openTrips', { count: openTrips }) },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{t('conditionsTitle')}</h3>
        <p className={styles.sectionText}>{t('conditionsBody')}</p>
      </div>

      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : (
        <>
          {wallet ? (
            <dl className={styles.balances}>
              <div className={styles.balance}>
                <div>
                  <dt className={styles.balanceLabel}>{tImpact('balance')}</dt>
                  <dd className={styles.balanceValue}>{fmt.money(wallet.available)}</dd>
                </div>
                {/* Rút tiền là việc của mục Quản lý thanh toán — đây chỉ là lối tắt tới đó. */}
                {Number(wallet.available) > 0 ? (
                  <CtaButton href={ROUTES.ACCOUNT.BALANCE} variant="neutral">
                    {t('withdrawNow')}
                  </CtaButton>
                ) : null}
              </div>
              <div className={styles.balance}>
                <div>
                  <dt className={styles.balanceLabel}>{tImpact('pending')}</dt>
                  <dd className={styles.balanceValue}>{fmt.money(wallet.pending)}</dd>
                </div>
              </div>
            </dl>
          ) : null}

          <ul className={styles.checks}>
            {user?.tenant ? (
              <li className={styles.check}>
                <span className={cx(styles.checkIcon, styles.checkWarn)} aria-hidden="true">
                  <ExclamationOutlined />
                </span>
                <span>
                  {user.tenant.roleKey === TENANT_ROLE.SHOP_OWNER
                    ? tImpact('ownerNote')
                    : tImpact('memberNote')}
                </span>
              </li>
            ) : null}
            {checks.map((check) => (
              <li key={check.key} className={styles.check}>
                <span
                  className={cx(styles.checkIcon, check.ok ? styles.checkOk : styles.checkWarn)}
                  aria-hidden="true"
                >
                  {check.ok ? <CheckOutlined /> : <ExclamationOutlined />}
                </span>
                <span>{check.label}</span>
              </li>
            ))}
          </ul>

          {failed ? <p className={styles.note}>{tImpact('loadError')}</p> : null}
          <p className={styles.note}>{tImpact('settleFirst')}</p>
        </>
      )}
    </section>
  );
}

/** "Dữ liệu nào sẽ bị xử lý" — danh sách + ghi chú lưu trữ theo luật. */
function DeletedData() {
  const t = useTranslations('Account.deleteAccount');

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{t('dataTitle')}</h3>
        <p className={styles.sectionText}>{t('confirmBody')}</p>
      </div>
      <ul className={styles.items}>
        {ACCOUNT_DELETION_ITEMS.map((item) => (
          <li key={item} className={styles.item}>
            {t(`items.${item}`)}
          </li>
        ))}
      </ul>
      <p className={styles.note}>{t('retentionNote')}</p>
    </section>
  );
}
