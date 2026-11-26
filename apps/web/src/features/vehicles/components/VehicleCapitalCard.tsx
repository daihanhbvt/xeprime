'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { moneyPercentOf } from '@xeprime/domain';
import { VEHICLE_SOURCE_TYPE, type VehicleSourceType } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { VEHICLE_EDIT_TAB } from '@/constants/routes';
import type { FinancePeriodFilters } from '@/features/finance/types';
import { countDueDates, sharePercent } from '@/features/finance/vehicle-finance';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { DAY_PARAM_FORMAT, nowInAppTz, toAppTz } from '@/lib/datetime';
import { decorativeIcon } from '@/lib/decorative-icon';
import { isNegativeMoney, isPositiveMoney, subtractMoney, sumMoney } from '@/lib/money';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { useVehicleSource } from '../hooks/use-vehicle-source';
import type { VehicleDetail, VehicleSource } from '../types';
import { Panel } from './Vehicle360Cards';
import styles from './VehicleFinanceTab.module.css';

interface VehicleCapitalCardProps {
  vehicle: VehicleDetail;
  /** Kỳ đang xem - số kỳ đóng tiền và lợi nhuận đều tính trên đúng kỳ này. */
  filters: FinancePeriodFilters;
  /** Kỳ "Toàn bộ" (`filters` không có `from`/`to`): đếm kỳ đóng tiền từ đầu hợp đồng. */
  allTime: boolean;
  /** Doanh thu / lợi nhuận CẢ XE của kỳ (`/finance/summary`), `null` khi chưa có. */
  revenue: string | null;
  profit: string | null;
  moneyLoading: boolean;
}

type Detail = NonNullable<VehicleSource['detail']>;

interface Line {
  key: string;
  label: ReactNode;
  value: ReactNode;
  tone?: 'gain' | 'loss' | 'warn';
}

/**
 * Nghĩa vụ nguồn xe - chiếc xe này đã tự nuôi được nguồn vốn của nó trong kỳ chưa.
 *
 * Đọc hồ sơ nguồn xe (`/vehicles/:id/source`, cần `finance.view`) và ghép với lợi nhuận kỳ:
 *  - **Trả góp / thuê lại**: số phải đóng trong kỳ = khoản mỗi tháng × số NGÀY ĐÓNG TIỀN rơi vào
 *    kỳ (`countDueDates`) - chưa khai ngày đóng thì nói thẳng là cần khai, không đoán;
 *  - **Hợp tác**: phần chia chủ xe ƯỚC TÍNH trên doanh thu cả xe (ⓘ nói rõ cơ sở chia thật hẹp hơn);
 *  - **Sở hữu**: giá mua + lợi nhuận kỳ trên giá mua.
 *
 * Không bịa số: ô nào hồ sơ chưa khai thì không dựng; chưa có hồ sơ thì mời khai.
 */
export function VehicleCapitalCard({
  vehicle,
  filters,
  allTime,
  revenue,
  profit,
  moneyLoading,
}: VehicleCapitalCardProps) {
  const t = useTranslations('Finance.vehicle.capital');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { vehicles: vehiclePaths } = useWorkspace();
  const can = useVehicleCapabilities();
  const sourceHref = useAvailableHref()(
    vehiclePaths.part(vehicle.id, VEHICLE_EDIT_TAB.SOURCE, null),
  );
  const enabled = can.source && sourceHref !== null;
  const source = useVehicleSource(vehicle.id, enabled);
  const detail = source.data?.detail ?? null;
  const sourceType = (source.data?.sourceType ??
    vehicle.sourceType ??
    VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;

  if (!enabled) return null;

  const profitLabel = allTime ? t('profitAll') : t('profit');
  const lines = detail ? buildLines() : [];

  function buildLines(): Line[] {
    const d = detail as Detail;
    const out: Line[] = [];
    switch (sourceType) {
      case VEHICLE_SOURCE_TYPE.FINANCED:
        if (d.bankName) out.push({ key: 'bank', label: t('financed.bank'), value: d.bankName });
        pushInstalment(out, d, d.monthlyTotal, 'financed');
        break;
      case VEHICLE_SOURCE_TYPE.RENTED:
        if (d.ownerName) out.push({ key: 'owner', label: t('rented.owner'), value: d.ownerName });
        pushInstalment(out, d, d.monthlyRent, 'rented');
        break;
      case VEHICLE_SOURCE_TYPE.PARTNERSHIP: {
        if (d.commissionPercent) {
          out.push({
            key: 'owner',
            label: d.ownerName
              ? t('partnership.ownerNamed', { name: d.ownerName })
              : t('partnership.owner'),
            value: t('partnership.ownerPercent', { percent: Number(d.commissionPercent) }),
          });
          const ownerShare = moneyPercentOf(revenue, d.commissionPercent);
          if (ownerShare !== null && revenue !== null) {
            out.push({
              key: 'ownerShare',
              label: (
                <span className={styles.titleWithInfo}>
                  {t('partnership.ownerShare')}
                  <InfoHint content={t('partnership.info')} label={t('partnership.infoLabel')} />
                </span>
              ),
              value: fmt.money(ownerShare),
              tone: 'warn',
            });
            const shopShare = subtractMoney(revenue, ownerShare);
            out.push({
              key: 'shopShare',
              label: t('partnership.shopShare', {
                percent: Math.max(0, 100 - Number(d.commissionPercent)),
              }),
              value: fmt.money(shopShare),
              tone: isNegativeMoney(shopShare) ? 'loss' : 'gain',
            });
          }
        }
        break;
      }
      default: {
        if (d.purchaseDate) {
          out.push({
            key: 'date',
            label: t('owned.purchaseDate'),
            value: fmt.date(d.purchaseDate),
          });
        }
        if (d.purchasePrice) {
          out.push({
            key: 'price',
            label: t('owned.purchasePrice'),
            value: fmt.money(d.purchasePrice),
          });
        }
        out.push({ key: 'none', label: t('owned.noObligation'), value: null });
        if (profit !== null)
          out.push({ key: 'profit', label: profitLabel, value: fmt.money(profit) });
        if (profit !== null && isPositiveMoney(d.purchasePrice)) {
          const roi = sharePercent(profit, d.purchasePrice as string);
          out.push({
            key: 'roi',
            label: t('owned.roi'),
            value: t('owned.roiValue', { percent: roi }),
            tone: roi < 0 ? 'loss' : 'gain',
          });
        } else {
          out.push({ key: 'noPrice', label: t('owned.noPrice'), value: null });
        }
      }
    }
    return out;
  }

  /** Trả góp và thuê lại: khoản mỗi tháng → số phải đóng trong kỳ → dư sau khi đóng. */
  function pushInstalment(
    out: Line[],
    d: Detail,
    monthly: string | null | undefined,
    kind: 'financed' | 'rented',
  ) {
    if (!monthly) return;
    out.push({
      key: 'monthly',
      label: d.paymentDay ? t(`${kind}.monthlyDay`, { day: d.paymentDay }) : t(`${kind}.monthly`),
      value: fmt.money(monthly),
    });
    /*
     * Chỉ các kỳ đóng ĐÃ TỚI HẠN tính tới hôm nay: lợi nhuận của kỳ đang chạy cũng mới tính tới hôm
     * nay, nên đem cả năm tiền vay so với 11 tháng lợi nhuận là cho ra một khoản "lỗ" không có thật.
     */
    const today = nowInAppTz().format(DAY_PARAM_FORMAT);
    /*
     * "Toàn bộ": đếm từ đầu hợp đồng; chưa khai ngày bắt đầu thì từ ngày mua, rồi từ ngày xe vào hệ
     * thống - mốc sớm nhất mà sổ có thể có tiền của xe này.
     */
    const from = filters.from ?? dayKeyOf(d.startDate ?? d.purchaseDate ?? vehicle.createdAt);
    const to = filters.to && filters.to < today ? filters.to : today;
    const count = countDueDates({
      from,
      to,
      paymentDay: d.paymentDay,
      startDate: d.startDate,
      endDate: d.endDate,
      termMonths: d.termMonths,
    });
    if (count === null) {
      out.push({ key: 'needsDay', label: t('needsDay'), value: null });
      return;
    }
    const due = sumMoney(Array.from({ length: count }, () => monthly));
    out.push({ key: 'due', label: t(`${kind}.due`, { count }), value: fmt.money(due) });
    if (profit === null) return;
    out.push({ key: 'profit', label: profitLabel, value: fmt.money(profit), tone: 'gain' });
    const net = subtractMoney(profit, due);
    out.push({
      key: 'net',
      label: t(`${kind}.net`),
      value: fmt.money(net),
      tone: isNegativeMoney(net) ? 'loss' : 'gain',
    });
  }

  return (
    <Panel
      className={styles.wrapHead}
      title={
        <span className={styles.capitalTitle}>
          {t('title')}
          <span className={styles.capitalTag}>{domainLabel('vehicleSourceType', sourceType)}</span>
        </span>
      }
      extra={
        sourceHref && !source.isLoading && !source.isError ? (
          <Link href={sourceHref} className={styles.capitalLink}>
            {detail ? t('configure') : t('add')} {decorativeIcon(<ArrowRightOutlined />)}
          </Link>
        ) : null
      }
    >
      {source.isLoading || moneyLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : source.isError ? (
        <p className={styles.muted}>{t('error')}</p>
      ) : !detail ? (
        <p className={styles.muted}>{t('missing')}</p>
      ) : (
        <div className={styles.capitalLines}>
          {lines.map((line) =>
            line.value === null ? (
              <p key={line.key} className={styles.capitalNote}>
                {line.label}
              </p>
            ) : (
              <div
                key={line.key}
                className={cx(
                  styles.capitalLine,
                  (line.key === 'net' || line.key === 'shopShare' || line.key === 'roi') &&
                    styles.capitalTotal,
                )}
              >
                <span className={styles.capitalLabel}>{line.label}</span>
                <span
                  className={cx(
                    styles.capitalValue,
                    line.tone === 'gain' && styles.gain,
                    line.tone === 'loss' && styles.loss,
                    line.tone === 'warn' && styles.warn,
                  )}
                >
                  {line.value}
                </span>
              </div>
            ),
          )}
        </div>
      )}
    </Panel>
  );
}

/** Ngày lịch VN (`YYYY-MM-DD`) của một mốc server trả (ngày trần hoặc ISO đầy đủ). */
function dayKeyOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toAppTz(value).format(DAY_PARAM_FORMAT);
}
