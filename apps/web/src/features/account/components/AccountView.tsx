'use client';

import {
  EditOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Avatar, Button, Spin } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/use-current-user';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { WalletBalancePill } from '@/features/wallet/components/WalletBalancePill';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useMyProfile } from '../hooks/use-account';
import { useAccountIdentityLabel } from '../hooks/use-account-identity-label';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../types';
import { AccountPanel } from './AccountPanel';
import { AccountProfileEditModal } from './AccountProfileEditModal';
import { ContactVerifyModal } from './ContactVerifyModal';
import { ShopEntryCard } from './ShopEntryCard';
import styles from './AccountView.module.css';

/**
 * Trang gốc của khu tài khoản — hồ sơ của CON NGƯỜI đang đăng nhập.
 *
 * Không phải hồ sơ gian hàng (`/manage/shop`): người không có gian hàng vẫn phải sửa được tên
 * và ảnh của mình, còn chủ gian hàng thì sửa hồ sơ cá nhân ở ĐÂY chứ không phải ở cổng quản lý
 * (ADR 0014 — hai trang cùng ghi vào một hàng `users` là bug chờ sẵn).
 *
 * Cổng đăng nhập nằm ở `AccountShell`, không lặp lại ở đây; component này chỉ lo trạng thái
 * của chính truy vấn hồ sơ.
 */
export function AccountView() {
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();

  if (profile.isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="large" />
      </div>
    );
  }
  if (profile.isError) {
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon title={errorMessage(profile.error)} />
        <Button onClick={() => void profile.refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }
  if (!profile.data) return null;

  return (
    <>
      <ProfileCard profile={profile.data} />
      <ShopEntryCard />
    </>
  );
}

/**
 * Thẻ "Thông tin tài khoản" — design Account / Profile (Figma `21621:65695`): danh tính bên trái,
 * hai kênh liên lạc bên phải, ghi chú đăng nhập, rồi nút "Cập nhật thông tin" mở hộp thoại sửa.
 *
 * Góc phải đầu thẻ là lối tắt SỐ DƯ: nó là câu hỏi người dùng mang theo khi mở trang tài khoản.
 * Viên số dư chỉ nói MỘT con số và mở màn "Quản lý thanh toán" — sổ và lệnh rút ở đúng một chỗ.
 */
function ProfileCard({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  // `/auth/me` đã nằm sẵn trong cache (vỏ khu tài khoản gọi nó trước khi render) — đọc lại ở
  // đây không thêm request nào, và nó là nguồn DUY NHẤT của nhãn vai (ADR 0038 điều 1).
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  const [editing, setEditing] = useState(false);
  /** Kênh liên lạc đang được đổi — `null` là không có modal nào mở. */
  const [editingContact, setEditingContact] = useState<ContactChannel | null>(null);

  return (
    <AccountPanel
      as="h1"
      title={t('profile.title')}
      subtitle={t('profile.description')}
      extra={<WalletBalancePill />}
    >
      <div className={styles.profileGrid}>
        <section className={styles.summary} aria-label={t('profile.accountLabel')}>
          <Avatar size={64} src={profile.avatarUrl || undefined} className={styles.avatar}>
            {initialOf(profile.displayName)}
          </Avatar>
          <div className={styles.identity}>
            <p className={styles.name}>{profile.displayName}</p>
            {/* Nhãn danh tính đọc TUYẾN, không đọc bảng vai — cùng nguồn với menu trái. */}
            <p className={styles.role}>{identityLabel(user)}</p>
          </div>
        </section>

        <div className={styles.details}>
          <ContactRow
            icon={<MailOutlined aria-hidden />}
            label={t('profile.email')}
            value={profile.email}
            emptyLabel={t('noEmail')}
            verified={profile.emailVerified}
            onEdit={() => setEditingContact(CONTACT_CHANNEL.EMAIL)}
          />
          <ContactRow
            icon={<PhoneOutlined aria-hidden />}
            label={t('profile.phone')}
            value={profile.phone}
            emptyLabel={t('noPhone')}
            verified={profile.phoneVerified}
            onEdit={() => setEditingContact(CONTACT_CHANNEL.PHONE)}
          />
        </div>
      </div>

      <div className={styles.securityNote}>
        <SafetyCertificateOutlined className={styles.securityIcon} aria-hidden />
        <div>
          <h2 className={styles.securityTitle}>{t('profile.securityTitle')}</h2>
          <p className={styles.securityDescription}>{t('profile.securityDescription')}</p>
        </div>
      </div>

      <div className={styles.actions}>
        <CtaButton
          variant="neutral"
          iconStart={<EditOutlined />}
          className={styles.updateButton}
          onClick={() => setEditing(true)}
        >
          {t('profile.update')}
        </CtaButton>
      </div>

      <AccountProfileEditModal profile={profile} open={editing} onClose={() => setEditing(false)} />

      {/*
        `key` theo kênh: modal giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở email
        ngay sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {editingContact ? (
        <ContactVerifyModal
          key={editingContact}
          channel={editingContact}
          open
          onClose={() => setEditingContact(null)}
          current={editingContact === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
        />
      ) : null}
    </AccountPanel>
  );
}

/**
 * Một dòng liên lạc: giá trị + tình trạng xác minh + lối vào để đổi.
 *
 * Tình trạng luôn hiện khi đã có giá trị, kể cả khi CHƯA xác minh: một tài khoản tạo bằng
 * email/mật khẩu có email nhưng chưa ai chứng minh hộp thư đó tồn tại, và người dùng cần thấy
 * khoảng cách đó để biết còn việc phải làm — không thấy thì họ tưởng mình đã xong.
 */
function ContactRow({
  icon,
  label,
  value,
  emptyLabel,
  verified,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('Account');

  return (
    <div className={styles.detailRow}>
      <span className={styles.detailIcon}>{icon}</span>
      <div className={styles.detailBody}>
        <p className={styles.detailLabel}>{label}</p>
        <p className={styles.detailValue}>
          <span className={value ? styles.contactValue : styles.contactEmpty}>
            {value ?? emptyLabel}
          </span>
          {value ? (
            <span className={cx(styles.badge, verified ? styles.badgeOk : styles.badgeTodo)}>
              {verified ? t('verified') : t('profile.unverified')}
            </span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        className={styles.detailAction}
        onClick={onEdit}
        aria-label={
          value ? t('contact.changeAria', { field: label }) : t('contact.addAria', { field: label })
        }
      >
        {value ? t('contact.change') : t('contact.add')}
      </button>
    </div>
  );
}
