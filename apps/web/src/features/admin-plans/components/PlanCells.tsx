'use client';

import {
  BankOutlined,
  CarOutlined,
  CrownOutlined,
  GoldOutlined,
  PercentageOutlined,
  SketchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Switch, Tag, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  OWNER_LITE_VEHICLE_LIMIT,
  PLAN_STATUS,
  PLAN_STATUS_META,
  PLAN_VEHICLE_SCOPE,
  planVehicleScopeOf,
} from '@xeprime/types';
import { MotorbikeOutlined } from '@/components/data-display/VehicleTypeIcon';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  PLAN_KIND,
  headlineTerm,
  planKindOf,
  planReadyToPublish,
  type PlanKind,
} from '../plan-catalog';
import type { Plan } from '../types';
import styles from './PlanCells.module.css';

/**
 * Các ô của bảng danh mục gói — tách khỏi trang để bảng desktop và thẻ mobile (`renderCard`)
 * dựng từ CÙNG một bộ, không phải hai bản vẽ trôi khỏi nhau.
 */

/** Nhãn của một loại gói: hai loại theo chế độ thu phí (namespace `Domain`), một loại riêng. */
export function usePlanKindLabel(): (kind: PlanKind) => string {
  const t = useTranslations('AdminPlans');
  const domainLabel = useDomainLabel();
  return (kind) =>
    kind === PLAN_KIND.SALES_ONLY ? t('page.kind.salesOnly') : domainLabel('billingMode', kind);
}

const KIND_ICON: Record<PlanKind, ReactNode> = {
  [PLAN_KIND.COMMISSION]: <PercentageOutlined />,
  [PLAN_KIND.PACKAGE]: <CarOutlined />,
  [PLAN_KIND.SALES_ONLY]: <BankOutlined />,
};

/** Ô icon nhận diện gói — thuần trang trí, chọn theo loại và nhãn đề xuất. */
function planIcon(plan: Plan): ReactNode {
  const kind = planKindOf(plan);
  if (kind === PLAN_KIND.COMMISSION) return <CrownOutlined />;
  if (kind === PLAN_KIND.SALES_ONLY) return <TeamOutlined />;
  return plan.limits.recommended ? <SketchOutlined /> : <GoldOutlined />;
}

export function PlanNameCell({ plan }: { plan: Plan }) {
  const t = useTranslations('AdminPlans');
  return (
    <div className={styles.nameCell}>
      <span className={styles.planIcon} aria-hidden="true">
        {planIcon(plan)}
      </span>
      <div className={styles.nameBody}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{plan.name}</span>
          {planKindOf(plan) === PLAN_KIND.COMMISSION ? (
            <Tag color="green" className={styles.tag}>
              {t('page.defaultTrackTag')}
            </Tag>
          ) : null}
          {plan.limits.recommended ? (
            <Tag color="orange" className={styles.tag}>
              {t('page.recommendedTag')}
            </Tag>
          ) : null}
        </div>
        {plan.description ? <p className={styles.description}>{plan.description}</p> : null}
        <span className={styles.code}>{t('page.planCode', { code: plan.code })}</span>
      </div>
    </div>
  );
}

export function PlanKindCell({ plan }: { plan: Plan }) {
  const kindLabel = usePlanKindLabel();
  const kind = planKindOf(plan);
  return (
    <span className={styles.kindPill}>
      <span className={styles.kindIcon} aria-hidden="true">
        {KIND_ICON[kind]}
      </span>
      {kindLabel(kind)}
    </span>
  );
}

/**
 * Giá + hạn mức của một bậc trong CÙNG một khối — hai thứ admin đọc cùng nhau khi so các bậc.
 *
 * Giá đầu bảng là MỘT con số (`headlineTerm`); bảng giá đủ các kỳ nằm sau dấu "i" khi bậc bán
 * nhiều hơn một kỳ hạn. Trần của tuyến hoa hồng là quy tắc trong code (`OWNER_LITE_VEHICLE_LIMIT`),
 * không đọc từ `limits`.
 */
export function PlanPriceCell({ plan }: { plan: Plan }) {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const kind = planKindOf(plan);

  function headline(): ReactNode {
    if (kind === PLAN_KIND.COMMISSION) {
      return (
        <>
          <span className={styles.amount}>
            {plan.commissionPercent == null
              ? tCommon('labels.emptyValue')
              : t('page.commissionPrice', { percent: plan.commissionPercent })}
          </span>
          <span className={styles.unit}>{t('page.perTrip')}</span>
        </>
      );
    }
    if (kind === PLAN_KIND.SALES_ONLY) {
      return (
        <>
          <span className={styles.amountMuted}>{tCommon('labels.emptyValue')}</span>
          <span className={styles.unit}>{t('page.salesOnlyPrice')}</span>
        </>
      );
    }
    const term = headlineTerm(plan);
    if (!term) return <span className={styles.unit}>{t('page.noPricing')}</span>;
    const terms = plan.limits.termPrices;
    return (
      <>
        <span className={styles.amount}>{fmt.money(term.price)}</span>
        <span className={styles.unit}>
          {term.months === 1 ? t('page.perMonth') : t('page.perTerm', { months: term.months })}
        </span>
        {terms.length > 1 ? (
          <InfoHint
            label={t('page.priceTableLabel', { name: plan.name })}
            content={
              <ul className={styles.termList}>
                {[...terms]
                  .sort((a, b) => a.months - b.months)
                  .map((item) => (
                    <li key={item.months}>
                      {t('page.termLine', { months: item.months, amount: fmt.money(item.price) })}
                    </li>
                  ))}
              </ul>
            }
          />
        ) : null}
      </>
    );
  }

  const commission = kind === PLAN_KIND.COMMISSION;
  const maxVehicles = commission ? OWNER_LITE_VEHICLE_LIMIT : plan.limits.maxVehicles;
  const scope = planVehicleScopeOf(plan.vehicleScope);
  const VehicleIcon = scope === PLAN_VEHICLE_SCOPE.MOTORBIKE ? MotorbikeOutlined : CarOutlined;

  /*
   * Trần xe đọc THEO PHẠM VI của bậc (ADR 0065 điều 3): 'Tối đa 5 xe máy' ở bậc xe máy, '5 ô tô' ở
   * bậc ô tô, '5 xe' (chung hai loại) ở bậc phạm vi `all`. Không còn dòng chi nhánh — trần chi nhánh
   * thôi là hạn mức (ADR 0065 điều 1).
   */
  const vehicleText =
    maxVehicles == null
      ? t('page.vehicleUnlimited')
      : scope === PLAN_VEHICLE_SCOPE.MOTORBIKE && !commission
        ? t('page.vehicleLimitMotorbike', { value: fmt.count(maxVehicles) })
        : scope === PLAN_VEHICLE_SCOPE.CAR && !commission
          ? t('page.vehicleLimitCar', { value: fmt.count(maxVehicles) })
          : t('page.vehicleLimit', { value: fmt.count(maxVehicles) });

  return (
    <div className={styles.priceBox}>
      <div className={styles.priceHead}>{headline()}</div>
      <ul className={styles.limits}>
        <li>
          <VehicleIcon aria-hidden />
          {/* `null` là KHÔNG GIỚI HẠN, không phải "chưa khai" (ADR 0041 điều 3). */}
          {vehicleText}
        </li>
      </ul>
    </div>
  );
}

/**
 * Trạng thái + công tắc bật/tắt bán.
 *
 * Bậc tuyến hoa hồng ĐANG hoạt động không có công tắc: nó là cửa vào của cả sàn, backend chặn
 * archive bằng `DEFAULT_PLAN_PROTECTED`, và một công tắc chỉ để báo lỗi là một công tắc sai.
 * Nếu dữ liệu tay lỡ để nó ở `archived` thì công tắc hiện ra — để admin bật lại được cửa vào,
 * chứ không bị kẹt với một hàng "ngừng hoạt động" không có lối sửa.
 *
 * Công tắc KHÔNG tự lật: `checked` luôn là trạng thái server; lượt bấm chỉ mở hộp xác nhận ở
 * trang (`onToggle`), và chỉ lượt mutation thành công mới đổi được nó.
 */
export function PlanStatusCell({
  plan,
  pending,
  onToggle,
}: {
  plan: Plan;
  pending: boolean;
  onToggle: (plan: Plan) => void;
}) {
  const t = useTranslations('AdminPlans');
  const active = plan.status === PLAN_STATUS.ACTIVE;
  const tag = <StatusTag value={plan.status} meta={PLAN_STATUS_META} group="planStatus" />;

  if (planKindOf(plan) === PLAN_KIND.COMMISSION && active) {
    return (
      <div className={styles.statusCell}>
        {tag}
        <InfoHint
          label={t('page.defaultTrackStatusLabel')}
          content={t('page.defaultTrackStatusHint')}
        />
      </div>
    );
  }

  /*
   * Bậc NHÁP (`draft`): chưa từng bán — một nút "Mở bán" thay cho công tắc, vì đây là lần đưa ra
   * chợ ĐẦU TIÊN chứ không phải bật lại. Bậc tự mua chưa có bảng giá thì nút khoá, kèm lý do: mở
   * bán một bậc không có kỳ nào để mua là bày một thẻ không ai bấm được.
   */
  if (plan.status === PLAN_STATUS.DRAFT) {
    const ready = planReadyToPublish(plan);
    const button = (
      <Button
        size="small"
        type="primary"
        loading={pending}
        disabled={!ready}
        onClick={(event) => {
          // Hàng bấm được (mở form sửa) — nút này không được mở cả hai.
          event.stopPropagation();
          onToggle(plan);
        }}
      >
        {t('page.publishAction')}
      </Button>
    );
    return (
      <div className={styles.statusCell}>
        {tag}
        {ready ? button : <Tooltip title={t('page.publishNeedsPrice')}>{button}</Tooltip>}
      </div>
    );
  }

  return (
    <div className={styles.statusCell}>
      <Switch
        checked={active}
        loading={pending}
        onChange={() => onToggle(plan)}
        aria-label={t('page.toggleLabel', { name: plan.name })}
      />
      {tag}
    </div>
  );
}
