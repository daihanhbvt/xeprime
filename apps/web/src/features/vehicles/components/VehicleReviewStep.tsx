'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { VehicleFormValues } from '@xeprime/validators';
import { useCatalogLabels, type CatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import type { DomainLabel } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './VehicleReviewStep.module.css';

interface ReviewGroup {
  key: string;
  title: string;
  /** Bước cần quay lại khi bấm "Chỉnh sửa". */
  step: number;
  items: { label: string; value: string }[];
}

/** Bộ dịch của `Vehicles.form.review` — chữ ký gọn để `groupsOf` không nhận sáu tham số rời. */
type ReviewTranslator = ReturnType<typeof useTranslations<'Vehicles.form.review'>>;

interface ReviewDeps {
  t: ReviewTranslator;
  labels: CatalogLabels;
  fmt: AppFormat;
  domainLabel: DomainLabel;
  /** `Common.labels.emptyValue` — dấu gạch cho ô chưa có dữ liệu. */
  empty: string;
  /** `Common.units.seat` — "5 chỗ" / "5 seats". */
  seats: (count: number) => string;
}

/**
 * Bốn thẻ tổng kết của bước xác nhận.
 *
 * Hàm THUẦN (nhận sẵn bộ dịch/định dạng, không gọi hook) nên nó vẫn đọc được như một bảng dữ
 * liệu thay vì bị xé thành bốn component chỉ để gọi `useTranslations`.
 */
function groupsOf(values: VehicleFormValues, deps: ReviewDeps): ReviewGroup[] {
  const { t, labels, fmt, domainLabel, empty, seats } = deps;

  const text = (value: string | number | null | undefined): string =>
    value == null || value === '' ? empty : String(value);
  const money = (value: number | null | undefined): string =>
    value == null ? empty : fmt.money(String(value));

  const brandAndModel = [labels.brandLabel(values.brand), values.model].filter(Boolean).join(' ');
  // `bodyTypeLabel` trả `null` khi danh mục chưa nạp xong — khi đó bỏ hẳn phần ngoặc thay vì
  // in ra một cặp ngoặc rỗng.
  const bodyTypeLabel = values.bodyType ? labels.bodyTypeLabel(values.bodyType) : null;

  return [
    {
      key: 'basic',
      title: t('groups.basic'),
      step: 0,
      items: [
        { label: t('name'), value: text(values.name) },
        { label: t('code'), value: text(values.code) },
        {
          label: t('typeAndService'),
          value: `${domainLabel('vehicleType', values.vehicleType)} / ${fmt.serviceTypes(values.serviceTypes)}`,
        },
        {
          label: t('operationStatus'),
          value: domainLabel('vehicleOperationStatus', values.operationStatus),
        },
        {
          label: t('sourceType'),
          value: domainLabel('vehicleSourceType', values.sourceType),
        },
      ],
    },
    {
      key: 'specs',
      title: t('groups.specs'),
      step: 0,
      items: [
        { label: t('plateNumber'), value: text(values.plateNumber) },
        {
          label: t('brandAndBody'),
          value: !brandAndModel
            ? empty
            : bodyTypeLabel
              ? t('brandWithBody', { brand: brandAndModel, bodyType: bodyTypeLabel })
              : brandAndModel,
        },
        {
          label: t('seatsAndFuel'),
          value:
            [
              values.seatCount ? seats(values.seatCount) : null,
              values.fuelType ? labels.fuelTypeLabel(values.fuelType) : null,
            ]
              .filter(Boolean)
              .join(' / ') || empty,
        },
        {
          label: t('yearAndColor'),
          value: [values.manufactureYear, values.color].filter(Boolean).join(' / ') || empty,
        },
      ],
    },
    {
      key: 'pricing',
      title: t('groups.pricing'),
      step: 1,
      items: [
        { label: t('weekdayPrice'), value: money(values.weekdayPrice) },
        { label: t('weekendPrice'), value: money(values.weekendPrice) },
        {
          label: t('discount'),
          value:
            values.discountPercent == null
              ? empty
              : t('discountValue', { percent: values.discountPercent }),
        },
        {
          label: t('policy'),
          value: values.deliveryEnabled ? t('policyDelivery') : t('policyNone'),
        },
      ],
    },
    {
      key: 'media',
      title: t('groups.media'),
      step: 2,
      items: [
        {
          label: t('overview'),
          value: t('overviewValue', {
            mainImage: values.mainImageUrl ? t('mainImageSet') : t('mainImageMissing'),
            gallery: values.images?.length ?? 0,
            features: values.features?.length ?? 0,
          }),
        },
      ],
    },
  ];
}

interface VehicleReviewStepProps {
  values: VehicleFormValues;
  onEditStep: (step: number) => void;
}

/**
 * Bước xác nhận cuối wizard TẠO (Figma `193:2009`): bốn thẻ tổng kết đúng những gì đã nhập
 * trong bốn bước, mỗi thẻ có lối "Chỉnh sửa" quay về ĐÚNG bước của nó. Thông số kỹ thuật
 * nâng cao không xuất hiện — luồng tạo không thu thập chúng.
 *
 * (Hình thái "tóm tắt thay đổi" cho luồng sửa đã gỡ cùng wizard sửa — chỉnh sửa nay đi qua
 * `VehicleEditWorkspace` dạng tab, xác nhận nhạy cảm nằm ở dialog của workspace.)
 */
export function VehicleReviewStep({ values, onEditStep }: VehicleReviewStepProps) {
  const t = useTranslations('Vehicles.form.review');
  const tUnits = useTranslations('Common.units');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  // Bảng tổng kết phải hiện TÊN hãng/kiểu dáng, không phải key đã lưu.
  const labels = useCatalogLabels();

  const groups = groupsOf(values, {
    t,
    labels,
    fmt,
    domainLabel,
    empty: tLabels('emptyValue'),
    seats: (count) => tUnits('seat', { count }),
  });

  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <header className={styles.groupHeader}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <Button type="link" size="small" onClick={() => onEditStep(group.step)}>
              {t('editStep')}
            </Button>
          </header>
          <dl className={styles.items}>
            {group.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
