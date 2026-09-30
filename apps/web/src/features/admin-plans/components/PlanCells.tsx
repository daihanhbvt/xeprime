'use client';

import {
  BankOutlined,
  CarOutlined,
  CrownOutlined,
  GoldOutlined,
  PercentageOutlined,
  ShopOutlined,
  SketchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Switch, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { OWNER_LITE_VEHICLE_LIMIT, PLAN_STATUS, PLAN_STATUS_META } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  COMMISSION_TRACK_BRANCH_LIMIT,
  PLAN_KIND,
  headlineTerm,
  planKindOf,
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
 * không đọc từ `limits` — xem `COMMISSION_TRACK_BRANCH_LIMIT`.
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
  const maxBranches = commission ? COMMISSION_TRACK_BRANCH_LIMIT : plan.limits.maxBranches;

  return (
    <div className={styles.priceBox}>
      <div className={styles.priceHead}>{headline()}</div>
      <ul className={styles.limits}>
        <li>
          <CarOutlined aria-hidden />
          {/* `null` là KHÔNG GIỚI HẠN, không phải "chưa khai" (ADR 0041 điều 3). */}
          {maxVehicles == null
            ? t('page.vehicleUnlimited')
            : t('page.vehicleLimit', { value: fmt.count(maxVehicles) })}
        </li>
        <li>
          <ShopOutlined aria-hidden />
          {maxBranches == null
            ? t('page.branchUnlimited')
            : t('page.branchLimit', { value: fmt.count(maxBranches) })}
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
  const tag = (
    <StatusTag value={plan.status} meta={PLAN_STATUS_META} group="planStatus" />
  );

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
