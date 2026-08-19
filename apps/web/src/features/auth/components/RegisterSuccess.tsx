'use client';

import { CheckCircleFilled, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import styles from './RegisterSuccess.module.css';
import { useTranslations } from 'next-intl';

export interface RegisterSuccessProps {
  /** Đã có gian hàng (hiếm — race/nhiều tab): "Trở thành chủ xe" đổi thành vào thẳng portal. */
  hasTenant: boolean;
  onBecomeOwner: () => void;
  onOpenAccount: () => void;
  onClose: () => void;
  /** Nhãn nút đóng đổi theo việc có tiếp tục hành động dở dang hay không. */
  closeLabel: string;
}

/**
 * Màn sau khi tạo tài khoản thành công.
 *
 * Điểm mấu chốt của toàn bộ thay đổi này: đăng ký xong KHÔNG đẩy vào `/manage` và KHÔNG hiện
 * form tạo gian hàng. Khách được mời — chứ không bị bắt — trở thành chủ xe, nên "Trở thành chủ
 * xe" là nút phụ, còn hành động chính là tiếp tục việc họ đang làm.
 */
export function RegisterSuccess({
  hasTenant,
  onBecomeOwner,
  onOpenAccount,
  onClose,
  closeLabel,
}: RegisterSuccessProps) {
  const t = useTranslations('Auth.registered');

  return (
    <div className={styles.wrap}>
      <CheckCircleFilled className={styles.icon} />
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.desc}>{t('body')}</p>

      <div className={styles.actions}>
        <Button type="primary" size="large" block onClick={onClose}>
          {closeLabel}
        </Button>
        <Button size="large" block icon={<UserOutlined />} onClick={onOpenAccount}>
          {t('openAccount')}
        </Button>
        <Button size="large" block icon={<ShopOutlined />} onClick={onBecomeOwner}>
          {hasTenant ? t('openPortal') : t('becomeOwner')}
        </Button>
      </div>

      <p className={styles.note}>{t('ownerNote')}</p>
    </div>
  );
}
