'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { TENANT_ROLE } from '@xeprime/types';

import { useAppFormat } from '@/i18n/use-app-format';

import { useAccountDeletionImpact } from '../hooks/use-account-deletion';

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
  // Số liệu (ví, lệnh rút, chuyến chưa khép) đọc chung với hộp thoại của site khách.
  const { user, wallet, holding, openTrips, hasMoney, loading, failed } =
    useAccountDeletionImpact();

  if (!user) return null;

  const isOwner = user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

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
            {wallet ? (
              <>
                <div className={styles.fact}>
                  <dt className={styles.label}>{t('balance')}</dt>
                  <dd className={styles.value}>{fmt.money(wallet.available)}</dd>
                </div>
                <div className={styles.fact}>
                  <dt className={styles.label}>{t('pending')}</dt>
                  <dd className={styles.value}>{fmt.money(wallet.pending)}</dd>
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
