'use client';

import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import {
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type VehicleOperationStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { decorativeIcon } from '@/lib/decorative-icon';

import { useVehicleSummary } from '../hooks/use-vehicle-summary';
import type { VehicleDetail } from '../types';
import styles from './VehicleInfoAside.module.css';

/** Số ảnh nhỏ dưới ảnh chính — phần còn lại gom vào ô "+N". */
const THUMBNAILS = 4;

/**
 * Cột phải của mục "Thông tin xe & tiện ích" (30/09/2026) — CHỈ ĐỌC, không có ô sửa nào.
 *
 * Người đang sửa tên, biển số, thông số cần thấy chiếc xe họ đang sửa và các con số khách sẽ
 * thấy — không phải mở tab khác. Ảnh sửa ở mục Hình ảnh (nút "Chỉnh sửa" dẫn tới đó), giá ở
 * "Giá & chính sách"; ở đây chỉ là bản xem, nên không có lối ghi thứ hai cho dữ liệu nào.
 */
export function VehicleInfoAside({
  vehicle,
  onEditImages,
}: {
  vehicle: VehicleDetail;
  /** Mở mục Hình ảnh — `undefined` khi người này không tới được mục đó. */
  onEditImages?: () => void;
}) {
  const t = useTranslations('Vehicles.edit.aside');
  const tEdit = useTranslations('Vehicles.edit');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const summary = useVehicleSummary(vehicle.id).data;

  // Ảnh chính đứng đầu, rồi các ảnh còn lại theo thứ tự đã sắp — không lặp ảnh chính.
  const urls = [
    ...(vehicle.mainImageUrl ? [vehicle.mainImageUrl] : []),
    ...(vehicle.media ?? []).map((item) => item.url),
  ].filter((url, index, all) => all.indexOf(url) === index);
  const [main, ...rest] = urls;
  const thumbs = rest.slice(0, THUMBNAILS);
  const hidden = rest.length - thumbs.length;

  /*
   * Giá khách thấy trước tiên: ngày thường của tự lái; xe không tự lái thì giá ngày có tài xế;
   * chỉ thuê dài hạn thì giá tháng. Không tự suy giá nào khác.
   */
  const services = vehicle.serviceTypes ?? [];
  const price =
    services.includes(SERVICE_TYPE.SELF_DRIVE) && vehicle.weekdayPrice
      ? t('perDay', { price: fmt.money(vehicle.weekdayPrice) })
      : services.includes(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice
        ? t('perDay', { price: fmt.money(vehicle.withDriverDailyPrice) })
        : services.includes(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice
          ? t('perMonth', { price: fmt.money(vehicle.monthlyPrice) })
          : tLabels('notAvailable');

  return (
    <aside className={styles.aside}>
      <section className={styles.card} aria-label={t('imagesTitle')}>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('imagesTitle')}</h2>
          {onEditImages ? (
            <Button
              type="link"
              size="small"
              icon={decorativeIcon(<EditOutlined />)}
              onClick={onEditImages}
              aria-label={t('editImagesLabel')}
            >
              {t('editImages')}
            </Button>
          ) : null}
        </header>
        {main ? (
          <PreviewImageGroup>
            <div className={styles.mainImage}>
              <PreviewImage className={styles.mainImg} src={main} alt={vehicle.name} />
              {vehicle.mainImageUrl ? <span className={styles.badge}>{t('mainBadge')}</span> : null}
            </div>
            {thumbs.length > 0 ? (
              <ul className={styles.thumbs}>
                {thumbs.map((url, index) => (
                  <li key={url} className={styles.thumb}>
                    <PreviewImage
                      className={styles.thumbImg}
                      src={url}
                      alt={`${vehicle.name} ${index + 2}`}
                    />
                    {index === thumbs.length - 1 && hidden > 0 ? (
                      <span className={styles.more} aria-hidden="true">
                        {t('moreImages', { count: hidden })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </PreviewImageGroup>
        ) : (
          <p className={styles.empty}>{t('noImages')}</p>
        )}
      </section>

      <section className={styles.card} aria-label={t('summaryTitle')}>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('summaryTitle')}</h2>
        </header>
        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>{t('vehicleType')}</dt>
            <dd>{domainLabel('vehicleType', vehicle.vehicleType)}</dd>
          </div>
          {vehicle.vehicleType === VEHICLE_TYPE.CAR ? (
            <div className={styles.row}>
              <dt>{t('seats')}</dt>
              <dd>
                {vehicle.seatCount
                  ? t('seatsValue', { count: vehicle.seatCount })
                  : tLabels('notAvailable')}
              </dd>
            </div>
          ) : null}
          <div className={styles.row}>
            <dt>{t('status')}</dt>
            <dd>
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
                group="vehicleOperationStatus"
              />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('price')}</dt>
            <dd>{price}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('odometer')}</dt>
            <dd>{fmt.km(summary?.currentOdometerKm ?? null)}</dd>
          </div>
        </dl>
        {/*
          Xe ĐÃ ĐƯỢC DUYỆT: bốn ô căn cước bị khoá (biển số · hộp số · nhiên liệu · năm sản xuất) —
          nói ở đây, cạnh bản tóm tắt, thay vì một băng thông báo đè lên đầu form.
        */}
        {vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
          <p className={styles.notice}>
            {decorativeIcon(<InfoCircleOutlined className={styles.noticeIcon} />)}
            <span>{tEdit('lockedNotice')}</span>
          </p>
        ) : null}
      </section>
    </aside>
  );
}
