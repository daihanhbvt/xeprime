'use client';

import { Button } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { ToneBadge } from '@/components/data-display/ToneBadge';
import { LineIcon } from '@/components/icons/LineIcon';

import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../types';
import { ContactVerifyModal } from './ContactVerifyModal';
import styles from './LoginMethods.module.css';

/** Hộp đang mở: kênh nào, và là ĐỔI sang định danh mới hay XÁC MINH định danh hiện có. */
interface OpenDialog {
  channel: ContactChannel;
  verifyCurrent: boolean;
}

/**
 * THÔNG TIN ĐĂNG NHẬP - số điện thoại (định danh đăng nhập, ADR 0060) rồi email (kênh nhận thông
 * báo), mỗi thứ một thẻ: ô biểu tượng · nhãn + tình trạng xác minh · giá trị · nút, câu giải thích
 * ở dưới (design `24131:71698`).
 *
 * Chỉ là PHẦN THÂN, không tự vẽ khung hay tiêu đề: trang chứa nó đặt nó trong một `InfoCard`.
 *
 * Hai lối, một luồng (`ContactVerifyModal`):
 *  - "Thay đổi" / "Thêm" - nhập định danh MỚI → mã OTP gửi tới định danh mới → xác nhận;
 *  - "Xác minh" (chỉ khi đã có mà CHƯA xác minh) - mã gửi thẳng tới định danh HIỆN CÓ, bỏ bước nhập.
 *    Server nhận lượt đó như một lần "đổi" sang chính nó (`/users/me/{email,phone}/send-otp`).
 *
 * Tình trạng luôn hiện, kể cả khi chưa xác minh: một tài khoản tạo bằng email có email nhưng chưa
 * ai chứng minh hộp thư đó tồn tại - không thấy khoảng cách đó thì người dùng tưởng đã xong.
 */
export function LoginMethods({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const [open, setOpen] = useState<OpenDialog | null>(null);

  return (
    <>
      <ul className={styles.cards}>
        <MethodCard
          icon={<LineIcon name="calling" />}
          label={t('profile.phone')}
          // `UserProfileDto.phone` đã ở dạng nội địa `0…` - server đổi trước khi trả.
          value={profile.phone}
          emptyLabel={t('noPhone')}
          verified={profile.phoneVerified}
          description={t('securityPage.login.phoneBody')}
          onChange={() => setOpen({ channel: CONTACT_CHANNEL.PHONE, verifyCurrent: false })}
          onVerify={() => setOpen({ channel: CONTACT_CHANNEL.PHONE, verifyCurrent: true })}
        />
        <MethodCard
          icon={<LineIcon name="mail" />}
          label={t('profile.email')}
          value={profile.email}
          emptyLabel={t('noEmail')}
          verified={profile.emailVerified}
          description={t('securityPage.login.emailBody')}
          onChange={() => setOpen({ channel: CONTACT_CHANNEL.EMAIL, verifyCurrent: false })}
          onVerify={() => setOpen({ channel: CONTACT_CHANNEL.EMAIL, verifyCurrent: true })}
        />
      </ul>

      {/*
        `key` theo kênh + lối: hộp giữ state riêng (bước, mã đã gửi, đếm ngược), nên mở email ngay
        sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {open ? (
        <ContactVerifyModal
          key={`${open.channel}-${open.verifyCurrent ? 'verify' : 'change'}`}
          channel={open.channel}
          open
          onClose={() => setOpen(null)}
          current={open.channel === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
          verifyCurrent={open.verifyCurrent}
        />
      ) : null}
    </>
  );
}

function MethodCard({
  icon,
  label,
  value,
  emptyLabel,
  verified,
  description,
  onChange,
  onVerify,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
  description: string;
  onChange: () => void;
  onVerify: () => void;
}) {
  const t = useTranslations('Account');

  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>

        <div className={styles.body}>
          <span className={styles.labelRow}>
            <span className={styles.label}>{label}</span>
            {/* Chữ chứ không chỉ một màu: đọc được bằng trình đọc màn hình và bởi người mù màu. */}
            {value ? (
              <ToneBadge size="sm" tone={verified ? 'success' : 'warning'}>
                {verified ? t('verified') : t('profile.unverified')}
              </ToneBadge>
            ) : null}
          </span>
          <span className={value ? styles.value : styles.empty}>{value ?? emptyLabel}</span>
        </div>

        <div className={styles.actions}>
          <Button
            onClick={onChange}
            aria-label={
              value ? t('contact.changeAria', { field: label }) : t('contact.addAria', { field: label })
            }
          >
            {value ? t('contact.change') : t('contact.add')}
          </Button>
          {value && !verified ? (
            <Button
              type="primary"
              onClick={onVerify}
              aria-label={t('contact.verifyAria', { field: label })}
            >
              {t('contact.verify')}
            </Button>
          ) : null}
        </div>
      </div>

      <p className={styles.description}>{description}</p>
    </li>
  );
}
