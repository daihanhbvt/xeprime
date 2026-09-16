'use client';

import { CheckOutlined, ExclamationCircleFilled, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton, Tag, Tooltip } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR } from '@xeprime/types';

import { useErrorMessage } from '@/i18n/use-error-message';

import { useMyProfile } from '../hooks/use-account';
import { CONTACT_CHANNEL, type ContactChannel } from '../types';
import { ContactVerifyModal } from './ContactVerifyModal';
import styles from './LoginMethodsCard.module.css';

/**
 * PHƯƠNG THỨC ĐĂNG NHẬP — email và số điện thoại, kèm tình trạng xác minh và lối đổi.
 *
 * ## Vì sao tách khỏi `AccountView`
 *
 * `AccountView` là hồ sơ CON NGƯỜI ở khu marketplace: ảnh đại diện, tên hiển thị, nhãn tuyến,
 * thẻ lối vào gian hàng — và hai dòng liên hệ nằm lẫn trong đó. Trang bảo mật của cổng quản lý
 * chỉ cần đúng hai dòng ấy: trong Manage, hình đại diện nổi bật là LOGO GIAN HÀNG, và một ô sửa
 * avatar cá nhân ở đây dựng ra một tấm ảnh thứ hai mà không màn nào trong cổng hiển thị.
 *
 * Dùng lại đúng `ContactVerifyModal` và `useMyProfile` — luồng đổi định danh (nhập định danh
 * mới → OTP → xác nhận) là một, và nó là luồng BẢO MẬT: một bản sao thứ hai là chỗ để một trong
 * hai bản quên mất bước xác minh.
 *
 * ## Vì sao luôn hiện tình trạng xác minh
 *
 * Kể cả khi CHƯA xác minh. Một tài khoản tạo bằng email/mật khẩu có email nhưng chưa ai chứng
 * minh hộp thư đó tồn tại — và với chủ gian hàng, chính hai dòng này là thứ mà khối "Chủ gian
 * hàng" ở trang Cửa hàng khoe là "đã xác minh". Không thấy khoảng cách đó thì họ tưởng đã xong.
 */
export function LoginMethodsCard({ headingLevel: Heading = 'h2' }: { headingLevel?: 'h1' | 'h2' }) {
  const t = useTranslations('Account');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();
  /** Kênh đang đổi — `null` là không có modal nào mở. */
  const [editing, setEditing] = useState<ContactChannel | null>(null);

  return (
    <section className={styles.card} aria-labelledby="login-methods-title">
      <header className={styles.head}>
        <Heading className={styles.title} id="login-methods-title">
          {t('loginMethods.title')}
        </Heading>
        <p className={styles.subtitle}>{t('loginMethods.subtitle')}</p>
      </header>

      {profile.isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
      {profile.isError ? (
        <Alert type="error" showIcon title={errorMessage(profile.error)} />
      ) : null}

      {profile.data ? (
        <dl className={styles.rows}>
          <ContactRow
            icon={<MailOutlined aria-hidden />}
            label={t('profile.email')}
            value={profile.data.email}
            emptyLabel={t('noEmail')}
            verified={profile.data.emailVerified}
            onEdit={() => setEditing(CONTACT_CHANNEL.EMAIL)}
          />
          <ContactRow
            icon={<PhoneOutlined aria-hidden />}
            label={t('profile.phone')}
            value={profile.data.phone}
            emptyLabel={t('noPhone')}
            verified={profile.data.phoneVerified}
            onEdit={() => setEditing(CONTACT_CHANNEL.PHONE)}
          />
        </dl>
      ) : null}

      {/*
        `key` theo kênh: modal giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở email
        ngay sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {editing && profile.data ? (
        <ContactVerifyModal
          key={editing}
          channel={editing}
          open
          onClose={() => setEditing(null)}
          current={editing === CONTACT_CHANNEL.EMAIL ? profile.data.email : profile.data.phone}
        />
      ) : null}
    </section>
  );
}

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
    <div className={styles.row}>
      <dt className={styles.rowLabel}>
        {icon}
        {label}
      </dt>
      <dd className={styles.rowValue}>
        <span className={value ? styles.value : styles.empty}>{value ?? emptyLabel}</span>
        {value && verified ? (
          <Tooltip title={t('verified')}>
            {/*
              Huy hiệu tự vẽ chứ không phải `CheckCircleFilled` tô màu: biểu tượng của AntD nhận
              màu bằng `color`, mà `color` KẾ THỪA — nó nằm cùng chỗ với màu chữ của cả hàng, nên
              chỉ cần một quy tắc nào đó trúng phần tử trước là dấu tích lặng lẽ đen trở lại.
              Ở đây màu xanh nằm ở `background`, thứ không kế thừa từ đâu cả.
            */}
            <span className={styles.verifiedMark} role="img" aria-label={t('verified')}>
              <CheckOutlined aria-hidden />
            </span>
          </Tooltip>
        ) : null}
        {value && !verified ? (
          <Tag color={STATUS_COLOR.WARNING} icon={<ExclamationCircleFilled />}>
            {t('profile.unverified')}
          </Tag>
        ) : null}
        <Button
          size="small"
          onClick={onEdit}
          aria-label={
            value
              ? t('contact.changeAria', { field: label })
              : t('contact.addAria', { field: label })
          }
        >
          {value ? t('contact.change') : t('contact.add')}
        </Button>
      </dd>
    </div>
  );
}
