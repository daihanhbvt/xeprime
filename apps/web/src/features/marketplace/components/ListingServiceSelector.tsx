'use client';

import { CalendarOutlined, CarOutlined, UserOutlined } from '@ant-design/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SERVICE_TYPE, serviceTypeLabel } from '@xeprime/types';
import { cx } from '@/lib/cx';
import styles from './ListingServiceSelector.module.css';
import { useTranslations } from 'next-intl';

function serviceTone(value: string): string | undefined {
  if (value === SERVICE_TYPE.SELF_DRIVE) return styles.selfDrive;
  if (value === SERVICE_TYPE.WITH_DRIVER) return styles.withDriver;
  if (value === SERVICE_TYPE.LONG_TERM) return styles.longTerm;
  return undefined;
}

function serviceIcon(value: string) {
  if (value === SERVICE_TYPE.SELF_DRIVE) return <CarOutlined aria-hidden="true" />;
  if (value === SERVICE_TYPE.WITH_DRIVER) return <UserOutlined aria-hidden="true" />;
  if (value === SERVICE_TYPE.LONG_TERM) return <CalendarOutlined aria-hidden="true" />;
  return null;
}

/**
 * Bộ chọn dịch vụ trên trang chi tiết xe (17/08) — client island nhỏ cạnh khối giá.
 *
 * Ghi `?serviceType=` bằng router.replace: trang chi tiết là server component nên khối giá
 * lớn re-render theo dịch vụ mới, và props truyền vào popup thuê cũng đổi theo — selector,
 * giá và popup không bao giờ nói ba dịch vụ khác nhau. Rời `with_driver` thì `routeType`
 * (ngữ cảnh có tài xế) bị xoá khỏi URL.
 */
export function ListingServiceSelector({
  services,
  active,
}: {
  services: readonly string[];
  active: string;
}) {
  const t = useTranslations('Listings.detail');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (services.length === 0) return null;

  return (
    <div className={styles.selector} role="group" aria-label={t('serviceSelector')}>
      <span className={styles.label}>{t('serviceLabel')}</span>
      <div className={styles.options}>
        {services.map((value) => {
          const isActive = value === active;
          const className = cx(styles.option, serviceTone(value), isActive && styles.active);
          const content = (
            <>
              {serviceIcon(value)}
              <span>{serviceTypeLabel(value)}</span>
            </>
          );

          if (services.length === 1) {
            return (
              <span key={value} className={className}>
                {content}
              </span>
            );
          }

          return (
            <button
              key={value}
              type="button"
              className={className}
              aria-pressed={isActive}
              onClick={() => {
                if (isActive) return;
                const params = new URLSearchParams(searchParams.toString());
                params.set('serviceType', value);
                if (value !== SERVICE_TYPE.WITH_DRIVER) params.delete('routeType');
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
