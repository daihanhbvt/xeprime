'use client';

import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TENANT_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  accountVehiclePath,
  vehicleListPathFor,
  type VehicleRegistrationSource,
} from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

import type { QuickRegistrationResult } from '../hooks';
import styles from './QuickVehicleSuccess.module.css';

/**
 * Màn kết quả của wizard — nói ĐÚNG chuyện vừa xảy ra, không nói chung chung.
 *
 * Ba kết cục khác nhau và không được lẫn vào nhau:
 *
 *  1. **Đã gửi duyệt** — có phiếu duyệt thật, xe đang chờ nền tảng xem.
 *  2. **Đã lưu nháp** — người dùng chọn lưu nháp, hoặc gian hàng chưa được duyệt hoạt động nên
 *     chưa gửi xe lên chợ được. Nói rõ việc tiếp theo là hoàn tất hồ sơ gian hàng.
 *  3. **Đã lưu nháp nhưng một phần cấu hình chưa lưu được** — xe TỒN TẠI; người dùng phải biết
 *     điều đó để không bấm tạo lại và đẻ ra chiếc xe thứ hai.
 */
export function QuickVehicleSuccess({
  result,
  source,
  onAddAnother,
}: {
  result: QuickRegistrationResult;
  source: VehicleRegistrationSource;
  onAddAnother: () => void;
}) {
  const t = useTranslations('ListYourVehicle.success');
  const { data: user } = useCurrentUser();

  const tenantActive = user?.tenant?.status === TENANT_STATUS.ACTIVE;
  const pendingReview = result.vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const manageHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.MANAGE.VEHICLES
      : accountVehiclePath.manage(result.vehicle.id);

  return (
    <section className={styles.wrap}>
      <span
        className={result.partialError ? styles.badgeWarning : styles.badge}
        aria-hidden="true"
      >
        {result.partialError ? <WarningFilled /> : <CheckCircleFilled />}
      </span>

      <h1 className={styles.title}>
        {result.partialError
          ? t('partialTitle')
          : result.submitted || pendingReview
            ? t('submittedTitle')
            : t('draftTitle')}
      </h1>
      <p className={styles.vehicle}>{result.vehicle.name}</p>

      {result.partialError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          message={t('partialBody')}
          description={result.partialError}
        />
      ) : result.submitted || pendingReview ? (
        <p className={styles.body}>{t('submittedBody')}</p>
      ) : (
        <p className={styles.body}>{t('draftBody')}</p>
      )}

      {/*
        Gian hàng chưa được duyệt hoạt động thì backend KHÔNG cho gửi xe lên chợ. Nói đúng việc
        cần làm và dẫn tới đúng chỗ làm việc đó, thay vì để người dùng bấm gửi duyệt và ăn lỗi.
      */}
      {!tenantActive ? (
        <Alert
          type="info"
          showIcon
          className={styles.alert}
          message={t('shopPendingTitle')}
          description={t('shopPendingBody')}
          action={
            <Link href={ROUTES.MANAGE.SHOP}>
              <Button size="small">{t('shopPendingCta')}</Button>
            </Link>
          }
        />
      ) : null}

      <div className={styles.actions}>
        <Link href={manageHref}>
          <Button type="primary" size="large">
            {t('manageCta')}
          </Button>
        </Link>
        <Button size="large" onClick={onAddAnother}>
          {t('addAnotherCta')}
        </Button>
        <Link href={vehicleListPathFor(source)}>
          <Button type="text" size="large">
            {t('listCta')}
          </Button>
        </Link>
      </div>
    </section>
  );
}
