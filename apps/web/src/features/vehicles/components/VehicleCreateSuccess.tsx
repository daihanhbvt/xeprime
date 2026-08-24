'use client';

import { CheckOutlined, CarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { VEHICLE_EDIT_TAB, vehiclePath, vehicleTabPath } from '@/constants/routes';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { VehicleDetail } from '../types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './VehicleCreateSuccess.module.css';

interface VehicleCreateSuccessProps {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  onCreateAnother: () => void;
}

export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  onCreateAnother,
}: VehicleCreateSuccessProps) {
  const t = useTranslations('Vehicles.form.success');
  const domainLabel = useDomainLabel();

  const sourceLabel = domainLabel('vehicleSourceType', vehicle.sourceType);

  return (
    <main className={styles.root} aria-labelledby="create-success-title">
      <div className={styles.successIcon} aria-hidden="true">
        <CheckOutlined />
      </div>
      <h1 id="create-success-title">{t('title')}</h1>
      <p>{submittedForReview ? t('submitted') : t('draft')}</p>

      <section className={styles.vehicleCard} aria-label={t('cardLabel')}>
        <div className={styles.thumb}>
          {vehicle.mainImageUrl ? (
            <PreviewImage src={vehicle.mainImageUrl} alt="" className={styles.thumbImage} />
          ) : (
            <CarOutlined aria-hidden="true" />
          )}
        </div>
        <div className={styles.vehicleInfo}>
          <strong>{vehicle.name}</strong>
          <span>
            {[vehicle.plateNumber, vehicle.code, sourceLabel].filter(Boolean).join(' · ')}
          </span>
        </div>
        {/* Cùng `StatusTag` với danh sách và Hồ sơ 360 — không tự dựng `Tag` thứ hai ở đây. */}
        <StatusTag
          value={vehicle.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
          group="vehicleOperationStatus"
        />
      </section>

      <section className={styles.checklist} aria-labelledby="complete-profile-title">
        <h2 id="complete-profile-title">{t('checklistTitle')}</h2>
        <p>{t('checklistBody')}</p>
        <ul>
          <li>
            <span>{t('checkInfo')}</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.INFORMATION)}>
              {t('checkInfoLink')}
            </Link>
          </li>
          <li>
            <span>{t('checkMedia')}</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.MEDIA)}>
              {t('checkMediaLink')}
            </Link>
          </li>
          <li>
            <span>{t('checkPricing')}</span>
            <Link href={vehiclePath.pricing(vehicle.id)}>{t('checkPricingLink')}</Link>
          </li>
          <li>
            <span>{t('checkSource')}</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)}>
              {t('checkSourceLink')}
            </Link>
          </li>
          <li className={styles.futureItem}>
            <span>{t('checkFuture')}</span>
            <span>{t('checkFutureNote')}</span>
          </li>
        </ul>
      </section>

      <div className={styles.actions}>
        <Link href={vehiclePath.detail(vehicle.id)}>
          <Button type="primary" size="large">
            {t('viewDetail')}
          </Button>
        </Link>
        <Button size="large" onClick={onCreateAnother}>
          {t('createAnother')}
        </Button>
      </div>
    </main>
  );
}
