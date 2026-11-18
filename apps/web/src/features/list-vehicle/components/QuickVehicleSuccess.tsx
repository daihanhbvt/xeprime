'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  ownerVehiclePath,
  vehicleListPathFor,
  type VehicleRegistrationSource,
} from '@/constants/routes';
import { usePublicationLabels } from '@/features/vehicles/hooks/use-publication-labels';
import styles from '@/features/vehicles/components/VehicleCreateSuccess.module.css';

import type { QuickRegistrationResult } from '../hooks';

/** Icon tĩnh lấy nguyên từ Figma `24352:67918` - cùng bộ với màn kết quả của wizard gian hàng. */
const ICON = {
  success: '/images/vehicle-upload/success-check.png',
  back: '/images/vehicle-upload/arrow-left-gray.svg',
  plus: '/images/vehicle-upload/plus-gray.svg',
  plusDark: '/images/vehicle-upload/plus-dark.svg',
} as const;

/**
 * Màn KẾT QUẢ của wizard đăng xe nhanh (chủ xe) - CÙNG khuôn Figma `24352:67918` với màn kết quả
 * của wizard gian hàng (`VehicleCreateSuccess`, 18/11/2026). Bốn kết cục, logic giữ nguyên:
 *
 *  1. **Đã gửi duyệt** - phiếu duyệt xe có thật (`submitted`).
 *  2. **Chưa gửi được vì còn thiếu điều kiện** - liệt kê TỪNG mục (mã → nhãn theo ngôn ngữ).
 *  3. **Đã lưu nháp** - người dùng chủ động chọn.
 *  4. **Lưu nháp nhưng một phần cấu hình chưa lưu được** - xe TỒN TẠI; nói rõ để không tạo lại.
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
  const { requirement } = usePublicationLabels();

  const incomplete = result.missingRequirements.length > 0;
  const warn = Boolean(result.partialError) || incomplete;
  const manageHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.MANAGE.VEHICLES
      : ownerVehiclePath.manage(result.vehicle.id);
  const subject = [result.vehicle.name, result.vehicle.plateNumber].filter(Boolean).join(' - ');

  const title = result.partialError
    ? t('partialTitle')
    : incomplete
      ? t('incompleteTitle')
      : result.submitted
        ? t('submittedTitle')
        : t('draftTitle');

  return (
    <main className={styles.root} aria-labelledby="quick-success-title">
      <div className={styles.card}>
        <div className={styles.hero}>
          {warn ? (
            <span className={styles.warnIcon} aria-hidden="true">
              !
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- minh hoạ tĩnh của Figma
            <img src={ICON.success} alt="" width={100} height={100} className={styles.heroImage} />
          )}
          <div className={styles.heroText}>
            <h1 id="quick-success-title" className={styles.title}>
              {title}
            </h1>
            <p className={styles.lead}>
              <strong>{subject}</strong>
              <br />
              {result.partialError
                ? t('partialBody')
                : incomplete
                  ? t('incompleteBody')
                  : result.submitted
                    ? t('submittedBody')
                    : t('draftBody')}
            </p>
          </div>
        </div>

        {result.partialError ? (
          <div className={styles.reason} role="alert">
            <p className={styles.reasonText}>{result.partialError}</p>
          </div>
        ) : incomplete ? (
          /*
           * Danh sách việc phải làm, không phải một lỗi. Mỗi dòng là một mục CỤ THỂ — "thiếu 4 ảnh"
           * chứ không phải "dữ liệu chưa hợp lệ" — vì chủ xe phải biết bấm vào đâu để sửa.
           */
          <div className={styles.reason} role="alert">
            <ul className={styles.reasonText}>
              {result.missingRequirements.map((key) => (
                <li key={key}>{requirement(key)}</li>
              ))}
            </ul>
            <Link href={manageHref} className={styles.reasonLink}>
              {t('incompleteCta')}
            </Link>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link href={vehicleListPathFor(source)}>
            <Button className={styles.secondary}>
              {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
              <img src={ICON.back} alt="" width={20} height={20} />
              {t('listCta')}
            </Button>
          </Link>
          <Button className={styles.secondary} onClick={onAddAnother}>
            {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
            <img src={ICON.plus} alt="" width={20} height={20} />
            {t('addAnotherCta')}
          </Button>
          <Link href={manageHref} className={styles.primaryLink}>
            <Button className={styles.primary}>
              {t('manageCta')}
              {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
              <img src={ICON.plusDark} alt="" width={20} height={20} />
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
