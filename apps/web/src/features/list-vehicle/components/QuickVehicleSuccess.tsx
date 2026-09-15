'use client';

import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  accountVehiclePath,
  vehicleListPathFor,
  type VehicleRegistrationSource,
} from '@/constants/routes';
import { usePublicationLabels } from '@/features/vehicles/hooks/use-publication-labels';

import type { QuickRegistrationResult } from '../hooks';
import styles from './QuickVehicleSuccess.module.css';

/**
 * Màn kết quả của wizard — nói ĐÚNG chuyện vừa xảy ra, không nói chung chung.
 *
 * Bốn kết cục, và không được lẫn vào nhau:
 *
 *  1. **Đã gửi duyệt** — phiếu duyệt XE có thật (`submitted` chỉ bật khi server trả về xe ở
 *     `pending_public_review`). Đây là toàn bộ vòng duyệt của tuyến hoa hồng: một cổng, không
 *     còn bước "chờ duyệt gian hàng" nào phía trước (ADR 0036).
 *  2. **Chưa gửi được vì còn thiếu điều kiện** — liệt kê TỪNG mục, xe nằm nháp và sửa được ngay.
 *     Đây là lý do màn này nhận `missingRequirements` dưới dạng MÃ: nó dựng nhãn theo ngôn ngữ
 *     đang dùng, thay vì hiện lại câu tiếng Việt của server (ADR 0012).
 *  3. **Đã lưu nháp** — người dùng chủ động chọn "Lưu nháp".
 *  4. **Lưu nháp nhưng một phần cấu hình chưa lưu được** — xe TỒN TẠI; người dùng phải biết điều
 *     đó để không bấm tạo lại và đẻ ra chiếc xe thứ hai.
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
  const manageHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.MANAGE.VEHICLES
      : accountVehiclePath.manage(result.vehicle.id);

  const title = result.partialError
    ? t('partialTitle')
    : incomplete
      ? t('incompleteTitle')
      : result.submitted
        ? t('submittedTitle')
        : t('draftTitle');

  return (
    <section className={styles.wrap}>
      <span
        className={result.partialError || incomplete ? styles.badgeWarning : styles.badge}
        aria-hidden="true"
      >
        {result.partialError || incomplete ? <WarningFilled /> : <CheckCircleFilled />}
      </span>

      <h1 className={styles.title}>{title}</h1>
      <p className={styles.vehicle}>{result.vehicle.name}</p>

      {result.partialError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('partialBody')}
          description={result.partialError}
        />
      ) : incomplete ? (
        /*
         * Danh sách việc phải làm, không phải một lỗi. Mỗi dòng là một mục CỤ THỂ — "thiếu 4 ảnh"
         * chứ không phải "dữ liệu chưa hợp lệ" — vì chủ xe phải biết bấm vào đâu để sửa.
         */
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('incompleteBody')}
          description={
            <ul className={styles.missingList}>
              {result.missingRequirements.map((key) => (
                <li key={key}>{requirement(key)}</li>
              ))}
            </ul>
          }
          action={
            <Link href={manageHref}>
              <Button size="small" type="primary">
                {t('incompleteCta')}
              </Button>
            </Link>
          }
        />
      ) : result.submitted ? (
        <p className={styles.body}>{t('submittedBody')}</p>
      ) : (
        <p className={styles.body}>{t('draftBody')}</p>
      )}

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
