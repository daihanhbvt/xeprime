'use client';

import { CheckOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import styles from './PartnerSignupIntro.module.css';

/** Ba quyền lợi theo thứ tự bản vẽ. */
const BENEFITS = ['first', 'second', 'third'] as const;

const ART: Record<RegistrationTrack, { bg: string; illustration: string }> = {
  [REGISTRATION_TRACK.COMMISSION]: {
    bg: '/partner/signup/bg-personal.webp',
    illustration: '/partner/signup/personal.webp',
  },
  [REGISTRATION_TRACK.PACKAGE]: {
    bg: '/partner/signup/bg-shop.webp',
    illustration: '/partner/signup/shop.webp',
  },
};

/**
 * Cột trái của form đăng ký đối tác: giới thiệu TUYẾN đang chọn (Figma Partner-XePrime
 * `24382:23516` chủ xe cá nhân · `24382:85032` gian hàng). Chỉ là phần nhìn — tuyến thật do
 * `registrationTrack` gửi lên quyết (ADR 0040).
 */
export function PartnerSignupIntro({
  track,
  back,
}: {
  track: RegistrationTrack;
  /** "Đổi cách cho thuê" — trang gọi bỏ đi khi người dùng đến từ site khách. */
  back?: ReactNode;
}) {
  const t = useTranslations('ShopOnboarding.signup.intro');
  const art = ART[track];

  return (
    <aside className={styles.intro}>
      <Image src={art.bg} alt="" fill sizes="520px" className={styles.bg} aria-hidden="true" />
      {back}
      <Image
        src={art.illustration}
        alt=""
        width={436}
        height={354}
        className={styles.illustration}
        aria-hidden="true"
      />
      <div className={styles.text}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{t(`${track}.title`)}</h2>
          <p className={styles.tagline}>{t(`${track}.tagline`)}</p>
        </div>
        <p className={styles.body}>{t(`${track}.body`)}</p>
      </div>
      <ul className={styles.benefits}>
        {BENEFITS.map((key) => (
          <li key={key} className={styles.benefit}>
            <span className={styles.check} aria-hidden="true">
              <CheckOutlined />
            </span>
            <span className={styles.benefitText}>
              <span className={styles.benefitTitle}>{t(`${track}.${key}.title`)}</span>
              <span className={styles.benefitSub}>{t(`${track}.${key}.sub`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Class của link "Đổi cách cho thuê" để trang gọi dựng link đúng kiểu cột này. */
export const SIGNUP_INTRO_BACK_CLASS = styles.back;
