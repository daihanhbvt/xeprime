'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { App, Alert, Button, Radio } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ALLOCATION_TARGET,
  BOOKING_HOLD_STATUS_META,
  FEE_LINE,
  adminSettleOutcomes,
  allocationTotals,
  holdSettlementKindFor,
  resolveHoldAllocation,
  type AllocationTarget,
  type BookingHoldOutcome,
  type BookingHoldPurpose,
  type BookingHoldStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
} from '@/components/overlay/WorkDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useSettleHold } from '../hooks/use-platform-money';
import type { PlatformHold } from '../types';
import styles from './SettleHoldDrawer.module.css';

const NOTE_MIN = 5;
const NOTE_MAX = 1000;

/** Thứ tự đọc của bảng "ai nhận bao nhiêu": khách → chủ xe → nền tảng → bên thứ ba. */
const TARGET_ORDER: readonly AllocationTarget[] = [
  ALLOCATION_TARGET.CUSTOMER_BALANCE,
  ALLOCATION_TARGET.OWNER_BALANCE,
  ALLOCATION_TARGET.PLATFORM_REVENUE,
  ALLOCATION_TARGET.INSURER_PAYABLE,
  ALLOCATION_TARGET.TAX_LEDGER,
];

/**
 * Chốt TAY kết cục một khoản giữ chỗ — thường sau khi một tranh chấp đã có kết luận.
 *
 * Cùng khuôn PANEL LÀM VIỆC với màn "Kiểm duyệt xe" (`components/overlay/WorkDrawer`): hồ sơ khoản
 * giữ chỗ bên trái, cột chọn kết cục bên phải, nút "Chốt" ở chân panel mở hộp thoại LÝ DO.
 *
 *  - Chỉ mời những kết cục admin được CHỐT TAY (`adminSettleOutcomes` — cùng hàm server dùng để
 *    chặn): khoản có bốn dòng tiền không bao giờ được mời `kept`/`forfeited`, vốn không phân bổ
 *    gì và để nền tảng giữ trọn cọc của chủ xe lẫn phí bảo hiểm.
 *  - KHÔNG chọn sẵn kết cục nào — một quyết định về tiền phải là một cú chọn có chủ đích.
 *  - XEM TRƯỚC ai nhận bao nhiêu bằng ĐÚNG `resolveHoldAllocation` mà server chạy lúc chốt.
 *
 * Lý do BẮT BUỘC: đây là quyết định về tiền của người khác, và mỗi lần chốt tay là một dòng
 * `audit_logs`. Kết luận tranh chấp (bước phán xét) nằm ở màn hỗ trợ — đây chỉ là phần kế toán.
 */
export function SettleHoldDrawer({
  hold,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: {
  hold: PlatformHold | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('PlatformMoney');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const settle = useSettleHold();

  const outcomes = useMemo(
    () =>
      hold
        ? adminSettleOutcomes(hold.purpose as BookingHoldPurpose, {
            deposit: hold.depositAmount,
            serviceFee: hold.serviceFeeAmount,
            vehicleInsurance: hold.vehicleInsuranceAmount,
            personalInsurance: hold.personalInsuranceAmount,
          })
        : [],
    [hold],
  );

  /* Lựa chọn GẮN VỚI KHOẢN đang mở: mở khoản khác thì lựa chọn cũ tự không còn. */
  const [choice, setChoice] = useState<{ holdId: string; outcome: BookingHoldOutcome } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const outcome = hold && choice?.holdId === hold.id ? choice.outcome : undefined;

  function submit(note: string) {
    // Enter trong hộp thoại lý do gửi lại kể cả khi nút đang quay — chặn lượt thứ hai ở đây.
    if (!hold || !outcome || settle.isPending) return;
    /*
     * Chốt xong thì sang khoản KẾ (hoặc khoản trước nếu đây là khoản cuối) — chốt id đó NGAY lúc
     * gửi: chốt xong, khoản này rời danh sách và trước/sau không còn vị trí để tính.
     */
    const goTo = nextId ?? previousId;
    settle.mutate(
      { id: hold.id, outcome, note },
      {
        onSuccess: () => {
          message.success(t('settle.success'));
          setConfirming(false);
          if (goTo) onNavigate(goTo);
          else onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(hold)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={t('settle.drawerTitle')}
        title={
          <WorkDrawerTitle
            label={t('settle.drawerTitle')}
            code={hold?.code}
            status={
              hold ? (
                <StatusTag
                  value={hold.status as BookingHoldStatus}
                  meta={BOOKING_HOLD_STATUS_META}
                  group="bookingHoldStatus"
                />
              ) : null
            }
          />
        }
        extra={
          <WorkDrawerPager
            previousId={previousId}
            nextId={nextId}
            onNavigate={onNavigate}
            previousLabel={t('settle.previous')}
            nextLabel={t('settle.next')}
          />
        }
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={
          hold ? (
            <WorkDrawerFooter
              hint={
                <span className={styles.hint}>
                  <InfoCircleOutlined aria-hidden />
                  {outcome ? t('settle.auditHint') : t('settle.chooseHint')}
                </span>
              }
              actions={
                <Button
                  type="primary"
                  disabled={!outcome}
                  loading={settle.isPending}
                  onClick={() => setConfirming(true)}
                >
                  {outcome
                    ? t('settle.submitFor', { outcome: domainLabel('bookingHoldOutcome', outcome) })
                    : t('settle.submit')}
                </Button>
              }
            />
          ) : null
        }
      >
        {hold ? (
          <WorkDrawerLayout
            key={hold.id}
            sideLabel={t('settle.sideLabel')}
            main={<HoldFile hold={hold} />}
            side={
              <OutcomePicker
                hold={hold}
                outcomes={outcomes}
                outcome={outcome}
                onChange={(next) => setChoice({ holdId: hold.id, outcome: next })}
              />
            }
          />
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        open={confirming && Boolean(hold)}
        title={t('settle.title', { code: hold?.code ?? '' })}
        audienceHint={t('settle.confirmHint', {
          outcome: outcome ? domainLabel('bookingHoldOutcome', outcome) : '',
        })}
        label={t('settle.note')}
        placeholder={t('settle.notePlaceholder')}
        requiredMessage={t('settle.noteRequired')}
        minLength={NOTE_MIN}
        maxLength={NOTE_MAX}
        submitText={t('settle.submit')}
        destructive={false}
        loading={settle.isPending}
        onSubmit={submit}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

/** Hồ sơ khoản giữ chỗ — ai, chuyến nào, khoản đã nhận gồm những dòng gì. */
function HoldFile({ hold }: { hold: PlatformHold }) {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const lines = [
    { key: FEE_LINE.DEPOSIT, amount: hold.depositAmount },
    { key: FEE_LINE.SERVICE_FEE, amount: hold.serviceFeeAmount },
    { key: FEE_LINE.VEHICLE_PROTECTION, amount: hold.vehicleInsuranceAmount },
    { key: FEE_LINE.TRIP_INSURANCE, amount: hold.personalInsuranceAmount },
  ].filter((line) => Number(line.amount) > 0);

  return (
    <>
      {hold.disputeOpen ? <Alert type="warning" showIcon title={t('settle.disputeOpen')} /> : null}

      <WorkDrawerFacts
        items={[
          {
            key: 'booking',
            label: t('columns.booking'),
            value: hold.bookingCode ?? tCommon('labels.emptyValue'),
          },
          { key: 'vehicle', label: t('settle.vehicle'), value: hold.vehicleName },
          { key: 'tenant', label: t('columns.tenant'), value: hold.tenantName },
          { key: 'customer', label: t('columns.customer'), value: hold.customerName },
          {
            key: 'paidAt',
            label: t('settle.paidAt'),
            value: hold.paidAt ? fmt.dateTime(hold.paidAt) : tCommon('labels.emptyValue'),
          },
          { key: 'createdAt', label: t('columns.createdAt'), value: fmt.dateTime(hold.createdAt) },
        ]}
      />

      <section className={styles.card} aria-labelledby="xp-settle-received">
        <h3 id="xp-settle-received" className={styles.cardTitle}>
          {t('settle.received')}
        </h3>
        <dl className={styles.lines}>
          {lines.map((line) => (
            <div key={line.key} className={styles.line}>
              <dt>{domainLabel('feeLine', line.key)}</dt>
              <dd>{fmt.money(line.amount)}</dd>
            </div>
          ))}
          {Number(hold.promoDiscountAmount) > 0 ? (
            <div className={styles.line}>
              <dt>{domainLabel('feeLine', FEE_LINE.PROMO)}</dt>
              <dd>−{fmt.money(hold.promoDiscountAmount)}</dd>
            </div>
          ) : null}
          <div className={styles.totalLine}>
            <dt>{t('settle.paidTotal')}</dt>
            <dd>{fmt.money(hold.paidAmount)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

/**
 * Cột phải: chọn kết cục hợp lệ + xem trước ai nhận bao nhiêu.
 *
 * Mỗi kết cục là một THẺ chọn (tên + một dòng nói tiền đi đâu) — người chốt hiểu hệ quả trước khi
 * bấm, không phải bấm thử từng nút. Phần xem trước là một thẻ riêng bên dưới, có dòng tổng để
 * thấy phân bổ khớp đúng số đã nhận.
 */
function OutcomePicker({
  hold,
  outcomes,
  outcome,
  onChange,
}: {
  hold: PlatformHold;
  outcomes: readonly BookingHoldOutcome[];
  outcome: BookingHoldOutcome | undefined;
  onChange: (outcome: BookingHoldOutcome) => void;
}) {
  const t = useTranslations('PlatformMoney');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const preview = useMemo(() => {
    if (!outcome) return null;
    const kind = holdSettlementKindFor(outcome);
    if (!kind || Number(hold.paidAmount) <= 0) return null;
    const totals = allocationTotals(
      resolveHoldAllocation(
        {
          deposit: hold.depositAmount,
          serviceFee: hold.serviceFeeAmount,
          vehicleInsurance: hold.vehicleInsuranceAmount,
          personalInsurance: hold.personalInsuranceAmount,
          promoDiscount: hold.promoDiscountAmount,
        },
        kind,
        hold.taxAmount,
      ),
    );
    const rows = TARGET_ORDER.filter((target) => Number(totals[target]) !== 0).map((target) => ({
      target,
      amount: totals[target],
    }));
    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    return { rows, total: String(total) };
  }, [hold, outcome]);

  return (
    <>
      <section className={styles.card} aria-labelledby="xp-settle-outcome">
        <h3 id="xp-settle-outcome" className={styles.cardTitle}>
          {t('settle.outcome')}
        </h3>
        <Radio.Group
          value={outcome}
          onChange={(e) => onChange(e.target.value as BookingHoldOutcome)}
          className={styles.options}
          aria-labelledby="xp-settle-outcome"
        >
          {outcomes.map((value) => {
            const label = domainLabel('bookingHoldOutcome', value);
            const helpId = `xp-settle-outcome-help-${value}`;
            return (
              <Radio
                key={value}
                value={value}
                className={cx(styles.option, outcome === value && styles.optionSelected)}
                aria-label={label}
                aria-describedby={helpId}
              >
                <span className={styles.optionText}>
                  <span className={styles.optionLabel}>{label}</span>
                  <span id={helpId} className={styles.optionHelp}>
                    {t(`settle.outcomeHelp.${value}`)}
                  </span>
                </span>
              </Radio>
            );
          })}
        </Radio.Group>
      </section>

      <div aria-live="polite">
        {preview ? (
          <section className={styles.card} aria-labelledby="xp-settle-preview">
            <h3 id="xp-settle-preview" className={styles.cardTitle}>
              {t('settle.preview')}
            </h3>
            <dl className={styles.lines}>
              {preview.rows.map((row) => (
                <div key={row.target} className={styles.line}>
                  <dt>{domainLabel('allocationTarget', row.target)}</dt>
                  <dd>{fmt.money(row.amount)}</dd>
                </div>
              ))}
              <div className={styles.totalLine}>
                <dt>{t('settle.previewTotal')}</dt>
                <dd>{fmt.money(preview.total)}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <p className={styles.previewEmpty}>
            {outcome ? t('settle.noAllocation') : t('settle.previewEmpty')}
          </p>
        )}
      </div>
    </>
  );
}
