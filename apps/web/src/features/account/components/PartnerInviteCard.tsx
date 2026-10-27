'use client';

import { CloseOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { PARTNER_MONTHLY_INCOME_RANGE } from '@/constants/partner-offer';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { usePartnerOffer } from '@/features/account/hooks/use-partner-offer';

import styles from './PartnerInviteCard.module.css';

const MILLION = 1_000_000;

/**
 * Lời mời "Hợp tác với XePrime" ở menu khu tài khoản (design Account). Khoảng thu nhập là hằng số
 * marketing; % hoa hồng đọc từ chính sách phí hiện hành (nấc thấp nhất → cao nhất) — chưa có chính sách thì ẩn
 * nhãn chứ không đoán một con số.
 */
export function PartnerInviteCard() {
  const t = useTranslations('Account.partnerInvite');
  const offer = usePartnerOffer().data;
  const minPercent = offer?.minOwnerCommissionPercent ?? null;
  const maxPercent = offer?.maxOwnerCommissionPercent ?? null;
  // Đóng chỉ có hiệu lực tới lần tải trang kế tiếp — CỐ Ý không lưu, F5 là thẻ hiện lại.
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const dismiss = () => setDismissed(true);

  return (
    <aside className={styles.card} aria-label={t('title')}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <TrophyOutlined />
        </span>
        <button type="button" className={styles.close} onClick={dismiss} aria-label={t('dismiss')}>
          <CloseOutlined />
        </button>
      </div>
      <p className={styles.titleRow}>
        <span className={styles.title}>{t('title')}</span>
        {minPercent !== null && maxPercent !== null ? (
          <span className={styles.badge}>
            {minPercent === maxPercent
              ? t('commissionBadgeFlat', { percent: maxPercent })
              : t('commissionBadge', { min: minPercent, max: maxPercent })}
          </span>
        ) : null}
      </p>
      <p className={styles.body}>
        {t('body', {
          min: PARTNER_MONTHLY_INCOME_RANGE.min / MILLION,
          max: PARTNER_MONTHLY_INCOME_RANGE.max / MILLION,
        })}
      </p>
      <a className={styles.cta} href={resolveOwnerCtaHref()}>
        {t('cta')}
      </a>
    </aside>
  );
}
