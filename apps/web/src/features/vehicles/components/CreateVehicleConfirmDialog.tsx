'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useImageSlotLabel } from '../hooks/use-image-slot-label';
import styles from './CreateVehicleConfirmDialog.module.css';

const EMPTY = '-';

/**
 * Giá trị hộp xác nhận cần. Giá phụ (cuối tuần, theo giờ, có tài xế, dài hạn) và nguồn xe là TUỲ CHỌN:
 * luồng đăng nhanh không hỏi chúng nên không truyền - dòng đó không vẽ thay vì hiện "-" sai nghĩa.
 */
export type CreateConfirmValues = Pick<
  VehicleFormValues,
  | 'vehicleType'
  | 'name'
  | 'plateNumber'
  | 'brand'
  | 'model'
  | 'vehicleCatalogModelId'
  | 'manufactureYear'
  | 'color'
  | 'seatCount'
  | 'fuelType'
  | 'transmission'
  | 'serviceTypes'
  | 'media'
  | 'weekdayPrice'
  | 'discountPercent'
> &
  Partial<
    Pick<
      VehicleFormValues,
      | 'sourceType'
      | 'weekendPrice'
      | 'hourlyPrice'
      | 'withDriverDailyPrice'
      | 'withDriverInterCityPrice'
      | 'withDriverOneWayPrice'
      | 'monthlyPrice'
    >
  >;

interface CreateVehicleConfirmDialogProps {
  open: boolean;
  values: CreateConfirmValues;
  branchLabel: string | null;
  /** Số khung · số máy đọc từ cà vẹt (hoặc người dùng nhập) - `null` khi không hỏi cà vẹt. */
  registration: { chassisNumber: string; engineNumber: string } | null;
  submitting: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

/**
 * "Xác nhận thông tin & gửi duyệt xe" - Figma `24335:66465`. Thay bước "Xác nhận" cũ: chủ xe soát lại
 * thư viện ảnh, thông tin xe, dịch vụ & giá rồi chọn Lưu nháp hoặc Gửi duyệt (cùng hai hành vi
 * backend như trước - `POST /vehicles`, rồi `submit-public` nếu gửi duyệt).
 */
export function CreateVehicleConfirmDialog({
  open,
  values,
  branchLabel,
  registration,
  submitting,
  onClose,
  onSaveDraft,
  onSubmit,
}: CreateVehicleConfirmDialogProps) {
  const t = useTranslations('Vehicles.form.confirm');
  const tPrices = useTranslations('Vehicles.form.prices');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const labels = useCatalogLabels();
  const slotLabel = useImageSlotLabel();
  // Dòng xe chọn bằng id danh mục - chữ `model` chỉ có sau khi server lưu, nên đọc nhãn từ danh mục.
  const { models } = useCatalogModels({
    vehicleType: values.vehicleType,
    brandKey: values.brand,
    includeId: values.vehicleCatalogModelId ?? null,
  });
  const modelLabel =
    models.find((m) => m.id === values.vehicleCatalogModelId)?.label ?? values.model ?? null;

  const money = (value: number | string | null | undefined) =>
    value == null || value === '' ? EMPTY : fmt.money(String(value));
  const text = (value: string | number | null | undefined) =>
    value == null || value === '' ? EMPTY : String(value);
  const isCar = values.vehicleType === VEHICLE_TYPE.CAR;
  const services = values.serviceTypes ?? [];
  const media = values.media ?? [];

  const info: Array<{ label: string; value: string }> = [
    { label: t('vehicleType'), value: domainLabel('vehicleType', values.vehicleType) },
    { label: t('name'), value: text(values.name) },
    { label: t('plate'), value: text(values.plateNumber) },
    { label: t('branch'), value: text(branchLabel) },
    ...(registration
      ? [
          { label: t('chassis'), value: text(registration.chassisNumber) },
          { label: t('engine'), value: text(registration.engineNumber) },
        ]
      : []),
    { label: t('brand'), value: text(labels.brandLabel(values.brand)) },
    { label: t('model'), value: text(modelLabel) },
    { label: t('year'), value: text(values.manufactureYear) },
    { label: t('color'), value: text(values.color) },
    ...(isCar ? [{ label: t('seats'), value: text(values.seatCount) }] : []),
    { label: t('fuel'), value: text(values.fuelType ? labels.fuelTypeLabel(values.fuelType) : null) },
    {
      label: t('transmission'),
      value: text(values.transmission ? domainLabel('transmissionType', values.transmission) : null),
    },
    ...(values.sourceType
      ? [{ label: t('source'), value: domainLabel('vehicleSourceType', values.sourceType) }]
      : []),
  ];

  const footer = (
    <div className={styles.footer}>
      <Button onClick={onClose} disabled={submitting}>
        {t('backToEdit')}
      </Button>
      <div className={styles.footerRight}>
        <Button onClick={onSaveDraft} loading={submitting}>
          {t('saveDraft')}
        </Button>
        <Button type="primary" onClick={onSubmit} loading={submitting}>
          {t('submit')}
        </Button>
      </div>
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      title={t('title')}
      size="xl"
      onClose={onClose}
      footer={footer}
      maskClosable={!submitting}
      closable={!submitting}
    >
      <p className={styles.subtitle}>{t('subtitle')}</p>
      <div className={styles.grid}>
        <div className={styles.left}>
          <section aria-labelledby="confirm-gallery">
            <div className={styles.sectionHeader}>
              <h3 id="confirm-gallery" className={styles.sectionTitle}>
                {t('gallery')}
              </h3>
              <span className={styles.photoCount}>{t('photoCount', { count: media.length })}</span>
            </div>
            <ul className={styles.gallery}>
              {media.map((item) => (
                <li key={item.url}>
                  <PreviewImage src={item.url} alt={slotLabel(item.type)} className={styles.thumb} />
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="confirm-info" className={styles.infoSection}>
            <h3 id="confirm-info" className={styles.sectionTitle}>
              {t('info')}
            </h3>
            <dl className={styles.infoGrid}>
              {info.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section aria-labelledby="confirm-pricing" className={styles.pricing}>
          <h3 id="confirm-pricing" className={styles.sectionTitle}>
            {t('pricing')}
          </h3>
          {services.includes(SERVICE_TYPE.SELF_DRIVE) ? (
            <PriceGroup title={domainLabel('serviceType', SERVICE_TYPE.SELF_DRIVE)}>
              <PriceRow label={tPrices('weekday')} value={money(values.weekdayPrice)} />
              {values.weekendPrice !== undefined ? (
                <PriceRow label={tPrices('weekend')} value={money(values.weekendPrice)} />
              ) : null}
              {values.hourlyPrice !== undefined ? (
                <PriceRow label={tPrices('hourly')} value={money(values.hourlyPrice)} />
              ) : null}
              <PriceRow
                label={tPrices('discountPercent')}
                value={values.discountPercent ? `${values.discountPercent}%` : EMPTY}
                positive={Boolean(values.discountPercent)}
              />
            </PriceGroup>
          ) : null}
          {services.includes(SERVICE_TYPE.WITH_DRIVER) ? (
            <PriceGroup title={domainLabel('serviceType', SERVICE_TYPE.WITH_DRIVER)}>
              <PriceRow label={tPrices('withDriverDaily')} value={money(values.withDriverDailyPrice)} />
              <PriceRow
                label={tPrices('withDriverInterCity')}
                value={money(values.withDriverInterCityPrice)}
              />
              <PriceRow label={tPrices('withDriverOneWay')} value={money(values.withDriverOneWayPrice)} />
            </PriceGroup>
          ) : null}
          {services.includes(SERVICE_TYPE.LONG_TERM) ? (
            <PriceGroup title={domainLabel('serviceType', SERVICE_TYPE.LONG_TERM)}>
              <PriceRow label={tPrices('monthly')} value={money(values.monthlyPrice)} />
            </PriceGroup>
          ) : null}
        </section>
      </div>
      <p className={styles.note}>
        {decorativeIcon(<InfoCircleOutlined />)}
        <span>{t('note')}</span>
      </p>
    </ResponsiveDialog>
  );
}

function PriceGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.priceGroup}>
      <h4 className={styles.priceGroupTitle}>{title}</h4>
      <dl className={styles.priceList}>{children}</dl>
    </div>
  );
}

function PriceRow({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className={styles.priceRow}>
      <dt>{label}</dt>
      <dd className={positive ? styles.positive : undefined}>{value}</dd>
    </div>
  );
}
