'use client';

import {
  VEHICLE_DATA_ORIGIN,
  VEHICLE_DATA_RENT_FIELDS,
  VEHICLE_TYPE,
  type VehicleDataOrigin,
  type VehicleDataRentField,
} from '@xeprime/types';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';

import type { VehicleDataDetail, VehicleDataVehicle } from '../types';
import { useYearsLabel } from '../use-years-label';
import { VehicleDataStatusTag } from './VehicleDataStatusTag';
import styles from './VehicleData.module.css';

/**
 * Cột phải của panel: dữ liệu này đang được dùng ra sao — nguồn tạo, xe gốc của chủ xe, các xe đang
 * dùng, giá thực tế trên chợ so với giá tham khảo, giá trị xe theo năm, dữ liệu có thể trùng.
 */
export function VehicleDataSide({
  detail,
  onNavigate,
}: {
  detail: VehicleDataDetail;
  onNavigate: (id: string) => void;
}) {
  const t = useTranslations('AdminVehicleData');
  const fmt = useAppFormat();
  const isCar = detail.vehicleType === VEHICLE_TYPE.CAR;
  const years = useYearsLabel();

  const facts: WorkDrawerFact[] = [
    {
      key: 'status',
      label: t('side.facts.status'),
      value: <VehicleDataStatusTag status={detail.status} />,
    },
    {
      key: 'origin',
      label: t('side.facts.origin'),
      value: t(`origin.${detail.origin as VehicleDataOrigin}`),
    },
    ...(detail.origin === VEHICLE_DATA_ORIGIN.OWNER && detail.proposedByTenantName
      ? [
          {
            key: 'proposedBy',
            label: t('side.facts.proposedBy'),
            value: detail.proposedByTenantName,
          },
        ]
      : []),
    {
      key: 'updated',
      label: t('side.facts.updated'),
      value: detail.updatedByName
        ? t('side.facts.updatedBy', {
            time: fmt.dateTime(detail.updatedAt),
            name: detail.updatedByName,
          })
        : fmt.dateTime(detail.updatedAt),
    },
    ...(detail.reviewNote
      ? [{ key: 'note', label: t('side.facts.reviewNote'), value: detail.reviewNote, wide: true }]
      : []),
  ];

  const market = detail.market.filter((m) => m.sampleSize > 0);
  const similar = detail.similar;

  return (
    <div className={styles.stack}>
      <WorkDrawerFacts items={facts} />

      {detail.sourceVehicle ? (
        <section className={styles.sideBlock} aria-labelledby="vd-source">
          <h4 id="vd-source" className={styles.sideTitle}>
            {t('side.sourceTitle')}
          </h4>
          <VehicleLine vehicle={detail.sourceVehicle} />
          <p className={styles.note}>{t('side.sourceHint')}</p>
        </section>
      ) : null}

      <section className={styles.sideBlock} aria-labelledby="vd-usage">
        <h4 id="vd-usage" className={styles.sideTitle}>
          {t('side.usageTitle')} · {t('side.usageCount', { count: detail.usageCount })}
        </h4>
        {detail.vehicles.length > 0 ? (
          <ul className={styles.list}>
            {detail.vehicles.map((v) => (
              <li key={v.id}>
                <VehicleLine vehicle={v} />
              </li>
            ))}
          </ul>
        ) : null}
        {detail.usageCount > detail.vehicles.length ? (
          <p className={styles.note}>
            {t('side.usageMore', { count: detail.usageCount - detail.vehicles.length })}
          </p>
        ) : null}
      </section>

      <section className={styles.sideBlock} aria-labelledby="vd-market">
        <h4 id="vd-market" className={styles.sideTitle}>
          {t('side.marketTitle')}
        </h4>
        <p className={styles.note}>{t('side.marketHint')}</p>
        {market.length === 0 ? (
          <p className={styles.note}>{t('side.marketEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {market.map((m) => {
              const field = m.field as VehicleDataRentField;
              const reference = (VEHICLE_DATA_RENT_FIELDS as readonly string[]).includes(field)
                ? detail[field]
                : null;
              return (
                <li key={m.field} className={styles.stack}>
                  <span className={styles.strong}>{t(`form.rent.${field}`)}</span>
                  <span className={styles.amount}>
                    {t('side.marketValue', {
                      low: fmt.money(m.low ?? '0'),
                      high: fmt.money(m.high ?? '0'),
                      median: fmt.money(m.median ?? '0'),
                      count: m.sampleSize,
                    })}
                  </span>
                  {reference ? (
                    <span className={styles.muted}>
                      {t('side.marketVsReference', { price: fmt.money(reference) })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isCar ? (
        <section className={styles.sideBlock} aria-labelledby="vd-value">
          <h4 id="vd-value" className={styles.sideTitle}>
            {t('side.valueTitle')}
          </h4>
          <p className={styles.note}>{t('side.valueHint')}</p>
          {detail.valueByYear.length === 0 ? (
            <p className={styles.note}>{t('side.valueEmpty')}</p>
          ) : (
            <dl className={styles.valueTable}>
              {detail.valueByYear.map((row) => (
                <div key={row.year} className={styles.valueRow}>
                  <dt>{row.year}</dt>
                  <dd>{fmt.money(row.amount)}</dd>
                  <dd>{t('side.valueRow', { percent: row.residualPercent })}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ) : null}

      <section className={styles.sideBlock} aria-labelledby="vd-similar">
        <h4 id="vd-similar" className={styles.sideTitle}>
          {t('side.similarTitle')}
        </h4>
        <p className={styles.note}>{t('side.similarHint')}</p>
        {similar.length === 0 ? (
          <p className={styles.note}>{t('side.similarEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {similar.map((s) => {
              return (
                <li key={s.id} className={styles.listRow}>
                  <span className={styles.stack}>
                    <span className={styles.strong}>
                      {detail.modelLabel} {s.variantLabel || t('cells.anyVariant')}
                    </span>
                    <span className={styles.muted}>{years(s.yearFrom, s.yearTo)}</span>
                  </span>
                  <span className={styles.inline}>
                    <VehicleDataStatusTag status={s.status} />
                    <Button size="small" onClick={() => onNavigate(s.id)}>
                      {t('side.similarOpen')}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function VehicleLine({ vehicle }: { vehicle: VehicleDataVehicle }) {
  const t = useTranslations('AdminVehicleData.side');
  const fmt = useAppFormat();
  return (
    <span className={styles.stack}>
      <Link
        href={`${ROUTES.ADMIN.VEHICLES}?open=${encodeURIComponent(vehicle.id)}`}
        className={styles.strong}
      >
        {vehicle.name}
      </Link>
      <span className={styles.muted}>
        {[
          vehicle.tenantName,
          vehicle.plateNumber ? t('plate', { plate: vehicle.plateNumber }) : null,
          vehicle.manufactureYear ? String(vehicle.manufactureYear) : null,
          vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </span>
  );
}
