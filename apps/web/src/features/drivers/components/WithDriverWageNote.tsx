'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDriverWageSettings } from '../hooks/use-drivers';
import styles from './WithDriverWageNote.module.css';

/**
 * Một dòng dưới giá có tài xế của xe (ADR 0075): giá đó là tiền KHÁCH trả, còn tiền công trả tài
 * xế là MỨC CHUNG của gian hàng cho mọi xe — cấu hình một chỗ ở trang Tài xế. Dòng này chỉ trỏ
 * sang đó, không có ô nhập thứ hai. Không đọc được (đang tải, thiếu quyền) thì không hiện gì.
 */
export function WithDriverWageNote() {
  const t = useTranslations('Drivers.wage.note');
  const fmt = useAppFormat();
  const settings = useDriverWageSettings();
  if (!settings.data) return null;
  const daily = settings.data.dailyWage;

  return (
    <p className={styles.note}>
      {daily ? t('set', { amount: fmt.money(daily) }) : t('unset')}{' '}
      <Link href={ROUTES.MANAGE.DRIVERS}>{t('link')}</Link>
    </p>
  );
}
