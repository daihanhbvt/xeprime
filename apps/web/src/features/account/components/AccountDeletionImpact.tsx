'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_TRIP_FILTER,
  TENANT_ROLE,
  TRIP_ROLE,
  WITHDRAWAL_STATUS_HOLDING_FUNDS,
  type WithdrawalStatus,
} from '@xeprime/types';

import { useTrips } from '@/features/trips/hooks';
import { useWalletSummary, useWithdrawals } from '@/features/wallet/hooks';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';

import styles from './AccountDeletionImpact.module.css';

/**
 * ẢNH HƯỞNG của việc đóng tài khoản, đặt NGAY TRÊN form yêu cầu xoá.
 *
 * ## Vì sao khối này tồn tại
 *
 * `DeleteAccountView` nói đúng thứ nó làm: mở một support case. Nhưng nó không nói người gửi
 * đang mang theo gì — một sổ công nợ XePrime còn nợ họ, có thể vài lệnh chuyển tiền đang chạy dở,
 * những chuyến chưa khép, và (với chủ xe) một pháp nhân. Mời họ gõ "XOÁ TÀI KHOẢN" mà không nói
 * ra bốn thứ đó là để họ quyết định trong bóng tối.
 *
 * Khối này KHÔNG chặn nút gửi — và đó là chủ ý. Yêu cầu đi vào hàng đợi support của nền tảng
 * (ADR 0033: không có luồng tự động nào chi tiền hay đóng pháp nhân), nên người quyết định cuối
 * cùng là con người ở XePrime. Việc của giao diện là bảo đảm người gửi biết mình đang gửi gì.
 *
 * ## Áp cho MỌI người đăng nhập, không riêng chủ xe
 *
 * Khách thuê thuần cũng có ví (tiền hoàn khoản giữ chỗ) và có thể còn chuyến chưa khép. Ví của
 * họ thuộc `user` thay vì tenant — `walletScopeFor` là nơi duy nhất biết điều đó, nên khối này
 * không tự đoán lại.
 *
 * ## Vì sao các con số được phép thiếu
 *
 * Lỗi đọc KHÔNG được biến thành rào chắn: một dòng "chưa kiểm tra được" tốt hơn một nút bị vô
 * hiệu hoá không lý do. Lệnh rút cũng chỉ có ở sổ nào thật sự cho rút.
 */
export function AccountDeletionImpact() {
  const t = useTranslations('Account.deletionImpact');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();

  const scope = walletScopeFor(user);
  const wallet = useWalletSummary(scope);
  const withdrawals = useWithdrawals(scope);
  /*
   * Chuyến ĐI THUÊ, không phải chuyến cho thuê: đơn khách đặt xe của gian hàng thuộc về pháp
   * nhân và không đi theo tài khoản cá nhân này. Trang 1 là đủ — chỉ cần `counts`, không cần
   * danh sách.
   */
  const renterTrips = useTrips(CUSTOMER_TRIP_FILTER.CURRENT, 1, TRIP_ROLE.RENTER);

  if (!user) return null;

  const isOwner = user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
  const queries = [wallet, withdrawals, renterTrips];
  const loading = queries.some((q) => q.isLoading);
  const failed = queries.some((q) => q.isError);

  const holding = (withdrawals.data ?? []).filter((row) =>
    (WITHDRAWAL_STATUS_HOLDING_FUNDS as readonly string[]).includes(row.status as WithdrawalStatus),
  ).length;
  const openTrips = renterTrips.data?.counts.current ?? 0;
  // Còn nghĩa vụ tiền = còn thứ phải đối soát TRƯỚC khi đóng, không phải sau.
  const hasMoney =
    Number(wallet.data?.available ?? 0) > 0 ||
    Number(wallet.data?.pending ?? 0) > 0 ||
    holding > 0;

  return (
    <section className={styles.block} aria-live="polite">
      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        title={t('title')}
        description={user.tenant ? t('body', { shop: user.tenant.name }) : t('bodyPersonal')}
      />

      {loading ? (
        <p className={styles.note}>{t('loading')}</p>
      ) : (
        <>
          {failed ? <Alert type="info" showIcon title={t('loadError')} /> : null}

          <dl className={styles.facts}>
            {user.tenant ? (
              <div className={styles.fact}>
                <dt className={styles.label}>{t('shop')}</dt>
                <dd className={styles.value}>{user.tenant.name}</dd>
              </div>
            ) : null}
            {wallet.data ? (
              <>
                <div className={styles.fact}>
                  <dt className={styles.label}>{t('balance')}</dt>
                  <dd className={styles.value}>{fmt.money(wallet.data.available)}</dd>
                </div>
                <div className={styles.fact}>
                  <dt className={styles.label}>{t('pending')}</dt>
                  <dd className={styles.value}>{fmt.money(wallet.data.pending)}</dd>
                </div>
              </>
            ) : null}
          </dl>

          <ul className={styles.items}>
            {user.tenant ? <li>{isOwner ? t('ownerNote') : t('memberNote')}</li> : null}
            <li>{t('withdrawals', { count: holding })}</li>
            <li>{t('openTrips', { count: openTrips })}</li>
          </ul>

          {hasMoney ? <Alert type="warning" showIcon title={t('settleFirst')} /> : null}
        </>
      )}
    </section>
  );
}
