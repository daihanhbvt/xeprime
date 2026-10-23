'use client';

import {
  AppstoreOutlined,
  ClockCircleOutlined,
  CrownFilled,
  PercentageOutlined,
} from '@ant-design/icons';
import { Alert } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BILLING_MODE, BILLING_PHASE, QUOTA_LIMIT_REASON, type BillingPhase } from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@/lib/datetime';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { cx } from '@/lib/cx';

import {
  PLAN_LANE_SCOPES,
  VEHICLE_QUOTA_KIND,
  laneVehicleType,
  quotaForLane,
  quotaIsFull,
  quotasShareOneCap,
  type PlanLaneScope,
} from '../plan-lanes';
import type { MySubscription, VehicleTypeQuota } from '../types';
import styles from './PlanSummaryPanel.module.css';

/** Trên ngưỡng này thì ô hạn mức chuyển sang cảnh báo — còn chỗ, nhưng sắp hết. */
const NEAR_LIMIT_RATIO = 0.8;

/** Dưới mốc này thì ô thời hạn chuyển sang cảnh báo: còn một tuần là lúc nên nhắc. */
export const TERM_WARNING_DAYS = 7;

/**
 * GÓI HIỆN HÀNH — tuyến đang ở, hạn mức THEO LOẠI xe, phí dịch vụ (tuyến hoa hồng).
 *
 * ## Hai hình dạng theo tuyến
 *
 *  - **Tuyến gói** (`currentPlans` không rỗng): tiêu đề nói "đang dùng N gói" — từng gói, thời hạn
 *    và nút gia hạn nằm ở LÀN của nó ngay bên dưới (ADR 0065: tối đa một gói xe máy và một gói ô tô).
 *    Một viên nhãn thời hạn ở đây sẽ phải chọn MỘT trong hai ngày hết hạn và nói sai về gói kia.
 *  - **Tuyến hoa hồng** (hoặc chưa có gói nào): gói hiện hành + viên nhãn thời hạn như trước.
 *
 * ## Ô hạn mức theo loại xe, trừ khi hai loại dùng CHUNG một trần
 *
 * Gói `car_N` gác ô tô, gói `moto_N` gác xe máy — hai ô, mỗi ô một trần (ADR 0065 điều 3). Tuyến
 * hoa hồng (Owner Lite 3 xe TỔNG) và bậc doanh nghiệp dùng một trần cho cả hai loại ⇒ MỘT ô tổng:
 * hai ô cùng in "3 xe" là mời chủ xe đăng 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu tiên bị từ chối.
 *
 * Loại xe CHƯA có gói (`scope_required`) không phải "0/0": ô nói "chưa có gói", vì xe loại đó
 * không lên chợ được cho tới khi mua (ADR 0065 điều 4) — lối mua nằm ở làn của nó.
 *
 * ## Màu theo MỨC DÙNG
 *
 * Dưới 80% trung tính; 80–99% cảnh báo; đủ 100% cảnh báo ĐẬM nhưng không phải màu lỗi: dùng hết chỗ
 * đã mua là trạng thái hợp lệ của gói.
 *
 * ## Vì sao không in `commissionPercent` của gói
 *
 * Phí dịch vụ thật tính từ `fee_policies.serviceFeePercent` lúc tạo đơn; con số trên dòng thuê bao
 * là một knob riêng chụp lúc gán (ADR 0029 điều 2) — in nó ra là hứa một tỉ lệ hệ thống không giữ.
 */
export function PlanSummaryPanel({ data }: { data: MySubscription }) {
  const t = useTranslations('Subscription');
  const { tenant } = useTenantScope();

  const { currentPlan, currentPlans, vehicleQuotas } = data;
  const packageTrack = currentPlans.length > 0;
  const isCommission = currentPlan?.billingMode === BILLING_MODE.COMMISSION;
  /*
   * PHA đọc từ server (`/auth/me`), không suy từ `endsAt` bằng đồng hồ máy khách: `current` và
   * `grace` có cùng một `endsAt` trong quá khứ nhưng khác nhau ở toàn bộ quyền dùng Manage.
   */
  const phase = (tenant?.billingPhase ?? null) as BillingPhase | null;
  const serviceFeePercent = tenant?.serviceFeePercent ?? null;
  const sharedCap = quotasShareOneCap(vehicleQuotas);

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <span className={styles.planIcon} aria-hidden="true">
          <CrownFilled />
        </span>
        <div className={styles.headText}>
          <h2 className={styles.planName}>
            {packageTrack
              ? t('current.packageTitle')
              : currentPlan
                ? currentPlan.planName
                : t('current.none')}
            {packageTrack || currentPlan ? (
              <span className={styles.activeTag}>{t('current.activeTag')}</span>
            ) : null}
          </h2>
          <p className={styles.planMeta}>
            {packageTrack
              ? t('current.packageCount', { count: currentPlans.length })
              : currentPlan
                ? isCommission
                  ? t('current.commissionSummary')
                  : t('current.packageSummary')
                : t('current.noneHint')}
          </p>
        </div>

        {!packageTrack && currentPlan ? (
          <div className={styles.headSide}>
            <TermPill endsAt={currentPlan.endsAt} phase={phase} />
          </div>
        ) : null}
      </header>

      <div className={cx(styles.tiles, sharedCap && styles.tilesShared)}>
        {sharedCap ? (
          <QuotaTile
            label={t('usage.fleetTotal')}
            icon={<AppstoreOutlined className={styles.tileIcon} aria-hidden="true" />}
            quota={vehicleQuotas.car}
            highlight
          />
        ) : (
          PLAN_LANE_SCOPES.map((scope) => (
            <LaneQuotaTile key={scope} scope={scope} quota={quotaForLane(vehicleQuotas, scope)} />
          ))
        )}
        {/*
          PHÍ DỊCH VỤ đọc từ CHÍNH SÁCH PHÍ hiệu lực (`/auth/me`). Tuyến gói không thu gì trên chuyến
          nên ô này vắng mặt thay vì hiện "0%".
        */}
        {serviceFeePercent != null ? (
          <div className={styles.tile}>
            <p className={styles.tileLabel}>
              {t('usage.serviceFee')}
              <PercentageOutlined className={styles.tileIcon} aria-hidden />
            </p>
            <p className={styles.tileValue}>
              <span className={styles.tileText}>
                {t('usage.serviceFeeValue', { percent: serviceFeePercent })}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      <QuotaWarnings quotas={vehicleQuotas} sharedCap={sharedCap} />
    </section>
  );
}

/**
 * THỜI HẠN GÓI — một viên nhãn hai dòng. Dùng ở khối tuyến hoa hồng và ở từng làn gói.
 *
 * Số ngày tính bằng đồng hồ máy khách và đó là chấp nhận được — nó chỉ là một con số để đọc. Thứ
 * quyết định quyền dùng (`phase`) thì đọc từ server.
 */
export function TermPill({ endsAt, phase }: { endsAt: string; phase: BillingPhase | null }) {
  const t = useTranslations('Subscription');
  const daysLeft = toAppTz(endsAt).diff(nowInAppTz(), 'day');

  const lapsed = phase === BILLING_PHASE.LAPSED;
  const grace = phase === BILLING_PHASE.GRACE;
  const tone = lapsed || grace || daysLeft <= TERM_WARNING_DAYS ? 'near' : 'ok';

  return (
    <div className={styles.termPill} data-tone={tone}>
      <span className={styles.termPillLabel}>
        <ClockCircleOutlined aria-hidden="true" />
        {t('term.pillLabel')}
      </span>
      <span className={styles.termPillValue}>
        {lapsed
          ? t('term.lapsed')
          : grace
            ? t('term.grace')
            : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </span>
    </div>
  );
}

/** Ô hạn mức của MỘT loại xe. */
function LaneQuotaTile({ scope, quota }: { scope: PlanLaneScope; quota: VehicleTypeQuota }) {
  const t = useTranslations('Subscription');
  const Icon = VEHICLE_TYPE_ICON[laneVehicleType(scope)];
  return (
    <QuotaTile
      label={t(`usage.${scope}`)}
      icon={<Icon className={styles.tileIcon} aria-hidden />}
      quota={quota}
    />
  );
}

/**
 * Ô HẠN MỨC: `đã dùng / trần`, một dòng phụ, và một thanh mảnh.
 *
 * Không giới hạn ⇒ KHÔNG vẽ thanh (một thanh 0% cho thứ không có trần nói ngược với con chữ). Chưa
 * có gói cho loại xe này ⇒ số xe đang có + "Chưa có gói" — không phải "0/0".
 */
export function QuotaTile({
  label,
  icon,
  quota,
  highlight = false,
}: {
  label: string;
  icon: ReactNode;
  quota: VehicleTypeQuota;
  /** Ô trần CHUNG của cả đội xe — nền vàng nhạt kéo mắt về con số người dùng tới đây để xem. */
  highlight?: boolean;
}) {
  const t = useTranslations('Subscription');
  const { used, limit } = quota;
  const capped = quota.kind === VEHICLE_QUOTA_KIND.TOTAL && limit != null;
  const missing = quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED;
  const ratio = capped && limit > 0 ? used / limit : 0;
  const tone = missing
    ? 'near'
    : !capped
      ? 'ok'
      : quotaIsFull(quota)
        ? 'full'
        : ratio >= NEAR_LIMIT_RATIO
          ? 'near'
          : 'ok';

  return (
    <div className={cx(styles.tile, highlight && styles.tileQuota)} data-tone={tone}>
      <p className={styles.tileLabel}>
        {label}
        {icon}
      </p>
      <p className={styles.tileValue}>
        <span className={styles.tileNumber}>{capped ? `${used}/${limit}` : used}</span>
        <span className={styles.tileSub}>
          {missing
            ? t('usage.scopeRequired')
            : capped
              ? t('usage.fleetLimitSub')
              : t('usage.unlimited')}
        </span>
      </p>
      {capped && limit > 0 ? (
        <span className={styles.meter} aria-hidden="true">
          {/*
            Ngoại lệ DUY NHẤT của luật cấm inline style (CLAUDE.md mục 5): bề rộng chỉ biết được
            lúc chạy. Nó đi qua một CSS custom property, không phải một thuộc tính trình bày.
          */}
          <span
            className={styles.meterFill}
            style={{ '--xp-meter': `${Math.min(100, Math.round(ratio * 100))}%` } as CSSProperties}
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Một dòng cảnh báo cho MỖI trần đã dùng hết — và chỉ khi đó.
 *
 * Câu chữ đi theo `reason`: chạm trần của bậc ĐÃ MUA thì việc cần làm là nâng bậc của đúng loại xe
 * đó; chạm trần Owner Lite thì là mua gói. Loại xe chưa có gói KHÔNG cảnh báo ở đây — làn của nó đã
 * nói và đã có nút mua.
 */
function QuotaWarnings({
  quotas,
  sharedCap,
}: {
  quotas: MySubscription['vehicleQuotas'];
  sharedCap: boolean;
}) {
  const t = useTranslations('Subscription');

  if (sharedCap) {
    const quota = quotas.car;
    if (!quotaIsFull(quota) || !quota.limit) return null;
    return (
      <Alert
        type="warning"
        showIcon
        className={styles.warning}
        title={t('usage.atLimitTotal', { limit: quota.limit })}
        description={
          quota.reason === QUOTA_LIMIT_REASON.PLAN
            ? t('usage.atLimitUpgrade')
            : t('usage.atLimitBuyPlan')
        }
      />
    );
  }

  return (
    <>
      {PLAN_LANE_SCOPES.map((scope) => {
        const quota = quotaForLane(quotas, scope);
        if (!quotaIsFull(quota) || !quota.limit) return null;
        return (
          <Alert
            key={scope}
            type="warning"
            showIcon
            className={styles.warning}
            title={t(`usage.atLimitScope.${scope}`, { limit: quota.limit })}
            description={t(`usage.atLimitUpgradeScope.${scope}`)}
          />
        );
      })}
    </>
  );
}
