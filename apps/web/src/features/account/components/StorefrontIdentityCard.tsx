'use client';

import { CheckCircleFilled, MailOutlined, PhoneOutlined, WarningOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { StorefrontIdentity } from '@xeprime/types';

import { ACCOUNT_SECTION, type AccountSection } from '@/constants/routes';
import { initialOf } from '@/lib/initials';

import styles from './StorefrontIdentityCard.module.css';

/**
 * "KHÁCH THẤY BẠN LÀ" — danh tính công khai của chủ xe tuyến hoa hồng, CHỈ ĐỌC (ADR 0054).
 *
 * Trang chủ xe không còn bộ tên/SĐT/email riêng: nó dùng chính tài khoản (`storefrontIdentity` —
 * cùng hàm API dùng cho chợ, chuyến, hợp đồng). Thẻ này cho chủ xe thấy đúng thứ khách thấy, và dẫn
 * tới NƠI DUY NHẤT sửa từng thứ — không có ô nhập thứ hai để hai bên lệch nhau.
 *
 * SĐT/email chưa xác thực thì khách KHÔNG thấy gì — thẻ nói thẳng điều đó và mời xác thực, thay vì
 * hiện một số mà khách sẽ không bao giờ nhận được.
 */
export function StorefrontIdentityCard({
  identity,
  onGoTo,
}: {
  identity: StorefrontIdentity;
  /** Nhảy tới section sửa thứ đó trên cùng trang (đổi `?section=`). */
  onGoTo: (section: AccountSection) => void;
}) {
  const t = useTranslations('Account.ownerHub.identity');

  return (
    <div className={styles.card}>
      <div className={styles.who}>
        <Avatar size={48} src={identity.avatarUrl ?? undefined} className={styles.avatar}>
          {initialOf(identity.name)}
        </Avatar>
        <div className={styles.whoText}>
          <span className={styles.label}>{t('title')}</span>
          <span className={styles.name}>{identity.name}</span>
        </div>
        <Button type="link" size="small" onClick={() => onGoTo(ACCOUNT_SECTION.PROFILE)}>
          {t('editProfile')}
        </Button>
      </div>

      <ul className={styles.contacts}>
        <ContactRow
          icon={<PhoneOutlined aria-hidden />}
          label={t('phone')}
          value={identity.phone}
          missing={t('phoneMissing')}
        />
        <ContactRow
          icon={<MailOutlined aria-hidden />}
          label={t('email')}
          value={identity.email}
          missing={t('emailMissing')}
        />
      </ul>

      <div className={styles.footer}>
        <p className={styles.note}>{t('note')}</p>
        <Button size="small" onClick={() => onGoTo(ACCOUNT_SECTION.LOGIN)}>
          {t('editLogin')}
        </Button>
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  missing,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  missing: string;
}) {
  return (
    <li className={styles.contact}>
      <span className={styles.contactIcon}>{icon}</span>
      <span className={styles.contactLabel}>{label}</span>
      {value ? (
        <span className={styles.contactValue}>
          {value}
          <CheckCircleFilled className={styles.verified} aria-hidden />
        </span>
      ) : (
        <span className={styles.contactMissing}>
          <WarningOutlined aria-hidden /> {missing}
        </span>
      )}
    </li>
  );
}
