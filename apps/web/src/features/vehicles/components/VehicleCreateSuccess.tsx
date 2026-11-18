'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { API_ERROR_CODE } from '@xeprime/types';
import { VEHICLE_EDIT_TAB, ROUTES, vehicleTabPath, type VehicleEditTab } from '@/constants/routes';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import type { VehicleDetail } from '../types';
import styles from './VehicleCreateSuccess.module.css';

interface VehicleCreateSuccessProps {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  /**
   * Xe ĐÃ tạo nhưng lượt gửi duyệt bị server từ chối (vd gian hàng thiếu logo) - màn này nói rõ
   * lý do và lối xử lý thay vì chỉ "Đã lưu nháp" (18/11/2026). `undefined` = người dùng tự lưu nháp.
   */
  submitError?: unknown;
  onCreateAnother: () => void;
}

/** Icon tĩnh lấy nguyên từ Figma `24352:67918`. */
const ICON = {
  success: '/images/vehicle-upload/success-check.png',
  chevron: '/images/vehicle-upload/chevron-right.svg',
  back: '/images/vehicle-upload/arrow-left-gray.svg',
  plus: '/images/vehicle-upload/plus-gray.svg',
  plusDark: '/images/vehicle-upload/plus-dark.svg',
} as const;

/**
 * Màn kết quả sau khi thêm xe - Figma `24352:67918` ("Đã gửi duyệt xe thành công"). Ba trạng thái
 * cùng một khung: đã gửi duyệt · đã lưu nháp · đã lưu nháp nhưng gửi duyệt bị từ chối (kèm lý do +
 * lối xử lý). Danh sách "Hoàn thiện hồ sơ" dẫn thẳng tới đúng mục của màn sửa xe.
 */
export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  submitError,
  onCreateAnother,
}: VehicleCreateSuccessProps) {
  const t = useTranslations('Vehicles.form.success');
  const errorMessage = useErrorMessage();
  const subject = [vehicle.name, vehicle.plateNumber].filter(Boolean).join(' - ');
  const rejected = !submittedForReview && submitError !== undefined;
  const shopGap = rejected && getErrorCode(submitError) === API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING;

  const items: Array<{
    key: 'documents' | 'media' | 'policy' | 'maintenance';
    tab: VehicleEditTab;
    optional?: boolean;
  }> = [
    { key: 'documents', tab: VEHICLE_EDIT_TAB.DOCUMENTS },
    { key: 'media', tab: VEHICLE_EDIT_TAB.MEDIA },
    { key: 'policy', tab: VEHICLE_EDIT_TAB.POLICY },
    { key: 'maintenance', tab: VEHICLE_EDIT_TAB.MAINTENANCE, optional: true },
  ];

  const title = submittedForReview
    ? t('submittedTitle')
    : rejected
      ? t('notSubmittedTitle')
      : t('draftTitle');

  return (
    <main className={styles.root} aria-labelledby="create-success-title">
      <div className={styles.card}>
        <div className={styles.hero}>
          {rejected ? (
            <span className={styles.warnIcon} aria-hidden="true">
              !
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- minh hoạ tĩnh của Figma
            <img src={ICON.success} alt="" width={100} height={100} className={styles.heroImage} />
          )}
          <div className={styles.heroText}>
            <h1 id="create-success-title" className={styles.title}>
              {title}
            </h1>
            <p className={styles.lead}>
              {submittedForReview
                ? t('submittedBody', { vehicle: subject })
                : t('draftBody', { vehicle: subject })}
            </p>
          </div>
        </div>

        {rejected ? (
          <div className={styles.reason} role="alert">
            <p className={styles.reasonText}>
              {t('notSubmittedReason', { reason: errorMessage(submitError) })}
            </p>
            {shopGap ? (
              <Link href={ROUTES.MANAGE.SHOP} className={styles.reasonLink}>
                {t('fixShopProfile')}
              </Link>
            ) : null}
          </div>
        ) : null}

        <section className={styles.checklist} aria-labelledby="complete-profile-title">
          <h2 id="complete-profile-title" className={styles.checklistTitle}>
            {t('checklistTitle')}
          </h2>
          <ul>
            {items.map((item) => (
              <li key={item.key}>
                <Link href={vehicleTabPath(vehicle.id, item.tab)} className={styles.row}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{t(`items.${item.key}.title`)}</span>
                    <span className={styles.rowBody}>{t(`items.${item.key}.body`)}</span>
                  </span>
                  {item.optional ? <span className={styles.optional}>{t('optional')}</span> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
                  <img src={ICON.chevron} alt="" width={20} height={20} className={styles.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.actions}>
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button className={styles.secondary}>
              {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
              <img src={ICON.back} alt="" width={20} height={20} />
              {t('backToList')}
            </Button>
          </Link>
          <Button className={styles.secondary} onClick={onCreateAnother}>
            {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
            <img src={ICON.plus} alt="" width={20} height={20} />
            {t('createAnother')}
          </Button>
          <Link
            href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.INFORMATION)}
            className={styles.primaryLink}
          >
            <Button className={styles.primary}>
              {t('completeProfile')}
              {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
              <img src={ICON.plusDark} alt="" width={20} height={20} />
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
