'use client';

import { Alert, Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { BILLING_MODE, BILLING_PHASE, type BillingPhase } from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@/lib/datetime';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { MySubscription, SlotUsage } from '../types';
import { PlanFeatureList } from './PlanFeatureList';
import styles from './PlanSummaryPanel.module.css';

/** Trên ngưỡng này thì ô hạn mức chuyển sang cảnh báo — còn chỗ, nhưng sắp hết. */
const NEAR_LIMIT_RATIO = 0.8;

/**
 * GÓI & HẠN MỨC — một khối, ba con số.
 *
 * ## Vì sao không còn ba `Card` của AntD
 *
 * Bản trước dựng ba thẻ ngang hàng ("gói hiện hành" · "chỗ đang dùng" · "nâng cấp được gì"), và
 * mỗi thẻ mang viền + bóng + tiêu đề riêng. Ở trong trang Cửa hàng, ba thẻ đó nằm bên trong một
 * thẻ section nữa — bốn lớp khung cho một mẩu thông tin đọc hết trong năm giây. Ở đây chỉ còn:
 * một dòng tên gói, một dòng hạn, và ba ô số nhỏ.
 *
 * ## Màu theo MỨC DÙNG, không theo cảm giác
 *
 * Dưới 80% là trung tính — còn chỗ thì không có gì để báo động. 80–99% là cảnh báo. Đủ 100% là
 * cảnh báo ĐẬM nhưng vẫn không phải màu lỗi: dùng hết chỗ đã mua là một trạng thái hợp lệ của
 * gói, không phải một sự cố. Đỏ để dành cho thứ hỏng thật.
 *
 * ## Vì sao không in `commissionPercent` của gói
 *
 * Phí dịch vụ thật tính từ `fee_policies.serviceFeePercent` lúc tạo đơn (`resolveHoldAllocation`),
 * còn con số trên dòng thuê bao là một knob riêng được chụp lại lúc gán. Không có ràng buộc nào
 * buộc hai số đó bằng nhau (ADR 0029 điều 2), nên in nó ra là hứa một tỉ lệ hệ thống không giữ.
 */
export function PlanSummaryPanel({
  data,
  canPurchase,
  onPurchase,
}: {
  data: MySubscription;
  /** Quyền `subscription.purchase`. Thiếu ⇒ KHÔNG dựng CTA nào dẫn vào luồng API sẽ chặn. */
  canPurchase: boolean;
  onPurchase: () => void;
}) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { data: user } = useCurrentUser();

  const { currentPlan, usage, fleetQuota } = data;
  const isCommission = currentPlan?.billingMode === BILLING_MODE.COMMISSION;
  /*
   * PHA đọc từ server (`/auth/me`), không suy từ `endsAt` bằng đồng hồ máy khách: `current` và
   * `grace` có cùng một `endsAt` trong quá khứ nhưng khác nhau ở toàn bộ quyền dùng Manage, và
   * chỉ server biết `graceDays` của gói là bao nhiêu (ADR 0038 điều 1).
   */
  const phase = (user?.tenant?.billingPhase ?? null) as BillingPhase | null;

  return (
    <div className={styles.panel}>
      <div className={styles.planRow}>
        <div className={styles.planText}>
          <p className={styles.planName}>
            {currentPlan ? currentPlan.planName : t('current.none')}
            {currentPlan?.billingMode ? (
              <Tag className={styles.modeTag}>
                {domainLabel('billingMode', currentPlan.billingMode)}
              </Tag>
            ) : null}
          </p>
          <p className={styles.planMeta}>
            {currentPlan
              ? t('current.expires', { date: fmt.date(currentPlan.endsAt) })
              : t('current.noneHint')}
          </p>
        </div>
        {canPurchase ? (
          <Button type="primary" onClick={onPurchase}>
            {currentPlan ? t('current.renewButton') : t('current.purchaseButton')}
          </Button>
        ) : null}
      </div>

      <div className={styles.tiles}>
        {/*
          Owner Lite có trần TỔNG (ô tô + xe máy), tuyến gói có hạn mức theo LOẠI. Hai luật khác
          nhau nên hai cách vẽ khác nhau — nhét trần tổng vào ô của từng loại là màn hình nói
          "3 ô tô" trong khi backend chặn ở "3 xe", và chủ xe sẽ đăng đủ 3 ô tô rồi ngạc nhiên
          vì chiếc xe máy đầu tiên bị từ chối.
        */}
        {fleetQuota.kind === 'total' && fleetQuota.totalLimit != null ? (
          <QuotaTile
            label={t('usage.fleetTotal')}
            used={fleetQuota.totalUsed}
            limit={fleetQuota.totalLimit}
          />
        ) : (
          <>
            <QuotaTile
              label={t('usage.car')}
              used={usage.car.used}
              limit={usage.car.limit ?? null}
            />
            <QuotaTile
              label={t('usage.motorbike')}
              used={usage.motorbike.used}
              limit={usage.motorbike.limit ?? null}
            />
          </>
        )}
        {currentPlan ? <TermTile endsAt={currentPlan.endsAt} phase={phase} /> : null}
      </div>

      <p className={styles.note}>
        {isCommission ? t('current.commissionSummary') : t('current.packageSummary')}
      </p>

      <QuotaWarning usage={usage} fleetQuota={fleetQuota} />

      {/* "Nâng cấp được thêm gì" — tự biến mất khi không còn tính năng nào bị khoá. */}
      <PlanFeatureList onUpgrade={canPurchase ? onPurchase : undefined} />
    </div>
  );
}

/**
 * Một ô hạn mức: nhãn, `đã dùng / hạn mức`, và một thanh mảnh.
 *
 * `limit == null` = không giới hạn ⇒ KHÔNG vẽ thanh: một thanh 0% cho thứ không có trần là hình
 * ảnh nói ngược với con chữ bên cạnh nó.
 */
function QuotaTile({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const t = useTranslations('Subscription');
  const ratio = limit && limit > 0 ? used / limit : 0;
  const tone = limit == null ? 'ok' : ratio >= 1 ? 'full' : ratio >= NEAR_LIMIT_RATIO ? 'near' : 'ok';

  return (
    <div className={styles.tile} data-tone={tone}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>
        {limit == null ? `${used} · ${t('usage.unlimited')}` : `${used}/${limit}`}
      </span>
      {limit != null && limit > 0 ? (
        <span className={styles.meter} aria-hidden="true">
          {/*
            Ngoại lệ DUY NHẤT của luật cấm inline style (CLAUDE.md mục 5): bề rộng chỉ biết được
            lúc chạy. Nó đi qua một CSS custom property, không phải một thuộc tính trình bày.
          */}
          <span className={styles.meterFill} style={{ '--xp-meter': `${Math.min(100, Math.round(ratio * 100))}%` } as React.CSSProperties} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Ô thời hạn: còn bao nhiêu ngày, hoặc đang ở pha nào.
 *
 * Số ngày tính bằng đồng hồ máy khách và đó là chấp nhận được ở ĐÂY — nó chỉ là một con số để
 * đọc. Thứ quyết định quyền dùng (`billingPhase`) thì đọc từ server; máy lệch giờ làm con số
 * lệch một ngày, không làm ai mất tính năng.
 */
function TermTile({ endsAt, phase }: { endsAt: string; phase: BillingPhase | null }) {
  const t = useTranslations('Subscription');
  const daysLeft = toAppTz(endsAt).diff(nowInAppTz(), 'day');

  if (phase === BILLING_PHASE.LAPSED) {
    return (
      <div className={styles.tile} data-tone="full">
        <span className={styles.tileLabel}>{t('term.label')}</span>
        <span className={styles.tileValue}>{t('term.lapsed')}</span>
      </div>
    );
  }

  const tone = phase === BILLING_PHASE.GRACE || daysLeft <= 7 ? 'near' : 'ok';
  return (
    <div className={styles.tile} data-tone={tone}>
      <span className={styles.tileLabel}>{t('term.label')}</span>
      <span className={styles.tileValue}>
        {phase === BILLING_PHASE.GRACE
          ? t('term.grace')
          : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </span>
    </div>
  );
}

/**
 * Một dòng cảnh báo khi đã dùng hết chỗ — và chỉ khi đó.
 *
 * Alert full-width chỉ xuất hiện khi có việc phải làm. Còn chỗ trống thì ba ô số ở trên đã nói
 * đủ, và một dải "mọi thứ đều ổn" đứng thường trực chỉ dạy người dùng bỏ qua vùng đó.
 */
function QuotaWarning({
  usage,
  fleetQuota,
}: {
  usage: MySubscription['usage'];
  fleetQuota: MySubscription['fleetQuota'];
}) {
  const t = useTranslations('Subscription');

  const full: string[] = [];
  if (fleetQuota.kind === 'total' && fleetQuota.totalLimit != null) {
    if (fleetQuota.totalUsed >= fleetQuota.totalLimit) full.push(t('usage.fleetTotal'));
  } else {
    if (atLimit(usage.car)) full.push(t('usage.car'));
    if (atLimit(usage.motorbike)) full.push(t('usage.motorbike'));
  }
  if (full.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
      className={styles.warning}
      title={t('usage.atLimit', { kinds: full.join(', ') })}
    />
  );
}

function atLimit(slot: SlotUsage): boolean {
  return slot.limit != null && slot.limit > 0 && slot.used >= slot.limit;
}
