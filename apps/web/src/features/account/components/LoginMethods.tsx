'use client';

import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  MailOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cx } from '@/lib/cx';

import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../types';
import { ContactVerifyModal } from './ContactVerifyModal';
import styles from './LoginMethods.module.css';

/**
 * PHƯƠNG THỨC ĐĂNG NHẬP — email và số điện thoại, kèm tình trạng xác minh và lối đổi.
 *
 * Chỉ là DANH SÁCH, không tự vẽ khung hay tiêu đề: trang chứa nó (Tài khoản & bảo mật) đặt nó
 * trong một `SectionCard` cùng nhịp với các section khác.
 *
 * Dùng lại đúng `ContactVerifyModal` — luồng đổi định danh (nhập định danh mới → OTP → xác nhận)
 * là một, và nó là luồng BẢO MẬT: một bản sao thứ hai là chỗ để một trong hai bản quên mất bước
 * xác minh.
 *
 * ## Vì sao luôn hiện tình trạng xác minh
 *
 * Kể cả khi CHƯA xác minh. Một tài khoản tạo bằng email/mật khẩu có email nhưng chưa ai chứng
 * minh hộp thư đó tồn tại — và với chủ gian hàng, chính hai dòng này là thứ mà khối "Chủ gian
 * hàng" ở trang Cửa hàng khoe là "đã xác minh". Không thấy khoảng cách đó thì họ tưởng đã xong.
 */
export function LoginMethods({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  /** Kênh đang đổi — `null` là không có modal nào mở. */
  const [editing, setEditing] = useState<ContactChannel | null>(null);

  return (
    <>
      <ul className={styles.rows}>
        <MethodRow
          icon={<MailOutlined aria-hidden />}
          label={t('profile.email')}
          value={profile.email}
          emptyLabel={t('noEmail')}
          verified={profile.emailVerified}
          onEdit={() => setEditing(CONTACT_CHANNEL.EMAIL)}
        />
        <MethodRow
          icon={<PhoneOutlined aria-hidden />}
          label={t('profile.phone')}
          // `UserProfileDto.phone` đã ở dạng nội địa `0…` — server đổi trước khi trả.
          value={profile.phone}
          emptyLabel={t('noPhone')}
          verified={profile.phoneVerified}
          onEdit={() => setEditing(CONTACT_CHANNEL.PHONE)}
        />
      </ul>

      {/*
        `key` theo kênh: modal giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở email
        ngay sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {editing ? (
        <ContactVerifyModal
          key={editing}
          channel={editing}
          open
          onClose={() => setEditing(null)}
          current={editing === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
        />
      ) : null}
    </>
  );
}

/**
 * Một dòng cài đặt: ô biểu tượng · nhãn + giá trị · tình trạng · nút đổi.
 *
 * Tình trạng là CHỮ kèm biểu tượng, không chỉ một dấu tích màu: "đã xác minh" và "chưa xác minh"
 * phải đọc được bằng trình đọc màn hình và bởi người không phân biệt được xanh/cam.
 */
function MethodRow({
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
    <li className={styles.row}>
      <span className={styles.icon}>{icon}</span>

      <div className={styles.body}>
        <span className={styles.label}>{label}</span>
        <span className={value ? styles.value : styles.empty}>{value ?? emptyLabel}</span>
      </div>

      {value ? (
        <span className={cx(styles.status, verified ? styles.verified : styles.unverified)}>
          {verified ? <CheckCircleFilled aria-hidden /> : <ExclamationCircleFilled aria-hidden />}
          {verified ? t('verified') : t('profile.unverified')}
        </span>
      ) : null}

      <Button
        className={styles.action}
        onClick={onEdit}
        aria-label={
          value ? t('contact.changeAria', { field: label }) : t('contact.addAria', { field: label })
        }
      >
        {value ? t('contact.change') : t('contact.add')}
      </Button>
    </li>
  );
}
