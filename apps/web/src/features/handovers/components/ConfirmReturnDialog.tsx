'use client';

import { CarOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  App,
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Select,
  Skeleton,
} from 'antd';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useRef, useState } from 'react';
import {
  API_ERROR_CODE,
  HANDOVER_CONDITION,
  HANDOVER_TYPE,
  handoverPhotoSlotsFor,
  isSingleEntrySurchargeCategory,
  ODOMETER_MAX_KM,
  PAYMENT_METHOD,
  PERMISSION,
  PLAN_FEATURE,
  RETURN_SURCHARGE_DRAFT_MAX,
  surchargeCategoryBlock,
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_LABEL,
  SURCHARGE_CATEGORY_VALUES,
  type HandoverCondition,
  type PaymentMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { MoneyInput, parseMoneyInput } from '@/components/form/MoneyInput';
import { LineIcon } from '@/components/icons/LineIcon';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useFinanceOptions } from '@/features/finance/hooks/use-finance-options';
import { invalidateAfterPayment } from '@/features/payments/hooks/use-payments';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { useReturnSettlementPreview } from '@/features/settlement/hooks';
import type { ReturnSurchargeDraft } from '@/features/settlement/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { getErrorCode, getErrorDetails } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { confirmHandover, saveHandoverDraft } from '../api';
import { useHandoverContext, useInvalidateHandovers } from '../hooks';
import type {
  ConfirmHandoverInput,
  HandoverBelowPickupDetails,
  HandoverContext,
  HandoverSuspicionDetails,
} from '../types';
import { HandoverPhotoGrid } from './HandoverPhotoGrid';
import styles from './ConfirmReturnDialog.module.css';

/** Đơn đang nhận lại — những gì nơi mở hộp đã có sẵn (thẻ danh sách / trang chi tiết). */
export interface ConfirmReturnBooking {
  id: string;
  code: string;
  serviceType: string;
  /** Ảnh xe — ngữ cảnh bàn giao không mang ảnh. */
  vehicleImageUrl?: string | null;
  /** Lúc khách báo "Đã trả xe" (ADR 0081) — mốc mặc định của giờ nhận thực tế. */
  customerReturnedAt?: string | null;
}

interface SurchargeRow {
  key: number;
  category: SurchargeCategory;
  /** VND nguyên — `MoneyInput` trả number; lên dây đổi lại thành chuỗi. */
  amount: number | null;
  /** Câu gửi khách khi dòng đến từ một gợi ý của server; sửa số / loại là bỏ câu đó. */
  reason?: string;
}

/** Bị từ chối vì số tiền thu lệch số server tính — kèm số mới. */
interface CollectChangedDetails {
  collectableAmount: string;
}

/**
 * Mốc mặc định = lúc khách BÁO đã trả xe (ADR 0081) nếu có, không thì BÂY GIỜ — hộp mở đúng lúc xe
 * về, ngay từ thẻ. Khác chiều giao (mặc định giờ hẹn): lấy giờ hẹn ở đây làm mọi lượt nhận xe trễ
 * hiện "Đúng giờ" và giấu luôn gợi ý phí quá giờ. Ghi muộn thì người nhận xe sửa ô giờ.
 */
function defaultOccurredAt(customerReturnedAt: string | null | undefined): Dayjs {
  const now = nowInAppTz();
  if (!customerReturnedAt) return now;
  const reported = toAppTz(customerReturnedAt);
  return reported.isValid() && reported.isBefore(now) ? reported : now;
}

/**
 * "Xác nhận đã nhận lại xe" — Figma Partner-XePrime `23941:64008` (thu gọn) / `23941:65305` (mở rộng),
 * 06/11/2026. Mở thẳng từ nút "Nhận xe" ở thẻ (List + Kanban) và từ nút xác nhận ở trang chi tiết.
 *
 * Một lần bấm làm trọn việc cuối chuyến, trong MỘT transaction ở server: biên bản trả xe (giờ thực
 * tế, Odo, tình trạng, ghi chú; ảnh tải ngay trong hộp như ở trang đơn), các khoản phụ phí gõ ở đây,
 * và — ô "Đã thu tiền" BẬT SẴN — một phiếu thu cho số khách còn phải trả, nên không phải bấm thêm
 * "Thu tiền" ở đầu trang. Bỏ tick ⇒ đơn hoàn thành với khoản còn nợ.
 *
 * Mọi con số tiền là của SERVER (`return-preview`, ADR 0007): hộp chỉ hiển thị, và nộp lại đúng số
 * đang hiển thị — server tính lại, lệch là 409 kèm số mới. Phụ phí và ô thu tiền cần
 * `payments.record`; ô thu tiền còn cần năng lực Thu chi của gói (tuyến hoa hồng không có).
 */
export function ConfirmReturnDialog({
  booking,
  onClose,
}: {
  booking: ConfirmReturnBooking;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.handover.returnDialog');
  const tHandover = useTranslations('Bookings.handover');
  const tSettlement = useTranslations('Bookings.settlement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const datePattern = useDatePickerPattern();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const financeOptions = useFinanceOptions();
  const sectionId = useId();

  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  // Ô thu tiền ghi phiếu thu — cùng cổng với nút "Thu tiền" (quyền + năng lực Thu chi của gói).
  const canCollect = canRecord && financeFeature.isVisible;
  const canManagePhotos = has(PERMISSION.HANDOVER_MANAGE);

  const contextQuery = useHandoverContext(booking.id);
  const ctx: HandoverContext | undefined = contextQuery.data;
  const invalidateAll = useInvalidateHandovers(booking.id, ctx?.vehicleId);

  // ── Biểu mẫu ────────────────────────────────────────────────────────────
  // Giá trị người dùng ĐÃ CHỌN; `undefined` = chưa đụng tới, đọc mặc định từ ngữ cảnh.
  const [pickedAt, setPickedAt] = useState<Dayjs | undefined>(undefined);
  const [odometerInput, setOdometerInput] = useState<number | null | undefined>(undefined);
  const [condition, setCondition] = useState<HandoverCondition | null>(null);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<SurchargeRow[]>([]);
  const [rowsInvalid, setRowsInvalid] = useState(false);
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const [collect, setCollect] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHOD.CASH);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [suspicion, setSuspicion] = useState<HandoverSuspicionDetails | null>(null);
  const rowSeq = useRef(0);

  /*
   * Đóng băng MỘT lần khi mở hộp: tính lại mỗi lượt render thì "bây giờ" nhích từng mili-giây,
   * bản xem trước đổi khoá liên tục và gọi server không dứt.
   */
  const [defaultAt] = useState(() => defaultOccurredAt(booking.customerReturnedAt));
  const occurredAt = pickedAt ?? defaultAt;
  const draftOdometer = ctx?.return?.odometerKm ?? null;
  const odometerKm = odometerInput === undefined ? draftOdometer : odometerInput;

  const validRows = rows.filter((row) => row.amount != null && row.amount > 0);
  const drafts: ReturnSurchargeDraft[] = validRows.map((row) => ({
    category: row.category,
    amount: String(row.amount),
    ...(row.reason ? { reason: row.reason } : {}),
  }));

  // ── Quyết toán xem trước (server tính) ──────────────────────────────────
  /*
   * Khoá bằng CHUỖI: một object mới mỗi lượt render sẽ làm bộ debounce đặt lại mãi, còn chuỗi so
   * bằng giá trị. Lý do của dòng không vào khoá — nó không đổi con số nào.
   */
  const inputKey = ctx
    ? JSON.stringify({
        occurredAt: appWallClockToIso(occurredAt),
        odometerKm,
        surcharges: drafts.map(({ category, amount }) => ({ category, amount })),
      })
    : '';
  const debouncedKey = useDebouncedValue(inputKey, 300);
  const previewInput = useMemo(
    () => (debouncedKey ? (JSON.parse(debouncedKey) as Record<string, unknown>) : {}),
    [debouncedKey],
  );
  const preview = useReturnSettlementPreview(booking.id, previewInput, debouncedKey !== '');
  const settled = preview.data;
  const previewFresh =
    Boolean(settled) &&
    !preview.isFetching &&
    !preview.isPlaceholderData &&
    debouncedKey === inputKey;

  const existing = settled?.surcharges ?? [];
  const recordedCategories = new Set<string>(existing.map((row) => row.category));

  const collectable = settled?.collectableAmount ?? null;
  const owes = collectable != null && !isZeroMoney(collectable);
  const collectActive = canCollect && collect && owes;
  // Ô thu tiền phải nộp ĐÚNG số đang hiện — chờ câu trả lời của bộ số đang gõ.
  const waitingForMoney = canCollect && !previewFresh;

  // ── Phụ phí: danh mục chọn được + gợi ý ─────────────────────────────────
  const categoryAllowed = (value: SurchargeCategory) =>
    surchargeCategoryBlock(value, booking.serviceType) === null;
  const categoryLabel = (value: SurchargeCategory) =>
    domainLabel('surchargeCategory', value, SURCHARGE_CATEGORY_LABEL[value]);
  /** Danh mục một-khoản đã có (đã ghi, hoặc ở dòng KHÁC) thì không chọn lại được — server cũng chặn. */
  function optionsFor(rowKey: number | null) {
    const takenByOthers = new Set(rows.filter((r) => r.key !== rowKey).map((r) => r.category));
    return SURCHARGE_CATEGORY_VALUES.filter(
      (value) =>
        categoryAllowed(value) &&
        !(
          isSingleEntrySurchargeCategory(value) &&
          (recordedCategories.has(value) || takenByOthers.has(value))
        ),
    ).map((value) => ({ value, label: categoryLabel(value) }));
  }
  const hasCategory = (value: SurchargeCategory) =>
    recordedCategories.has(value) || rows.some((row) => row.category === value);

  const overtime = settled?.overtime;
  const overtimeSuggestion =
    canRecord &&
    overtime?.available &&
    overtime.amount != null &&
    !isZeroMoney(overtime.amount) &&
    categoryAllowed(SURCHARGE_CATEGORY.OVERTIME) &&
    !hasCategory(SURCHARGE_CATEGORY.OVERTIME)
      ? overtime
      : null;
  const mileage = settled?.excessMileage;
  const mileageSuggestion =
    canRecord &&
    mileage?.available &&
    mileage.amount != null &&
    !isZeroMoney(mileage.amount) &&
    categoryAllowed(SURCHARGE_CATEGORY.EXCESS_MILEAGE) &&
    !hasCategory(SURCHARGE_CATEGORY.EXCESS_MILEAGE)
      ? mileage
      : null;
  /*
   * Chưa ai mở/đóng tay: có gợi ý (trả trễ / vượt km) hoặc đã có dòng phụ phí thì mở sẵn, để người
   * nhận xe thấy ngay. Bấm tiêu đề một lần là lựa chọn của họ thắng.
   */
  const expanded =
    expandedChoice ?? Boolean(overtimeSuggestion || mileageSuggestion || rows.length > 0);

  function addRow(row: Omit<SurchargeRow, 'key'>) {
    rowSeq.current += 1;
    const key = rowSeq.current;
    setRows((current) => [...current, { ...row, key }]);
    setRowsInvalid(false);
    // Thêm từ gợi ý làm gợi ý biến mất — giữ vùng mở, đừng để nó tự gập dưới tay người dùng.
    setExpandedChoice(true);
  }

  function addEmptyRow() {
    const first = optionsFor(null)[0]?.value;
    if (first) addRow({ category: first, amount: null });
  }

  function updateRow(key: number, patch: Partial<Omit<SurchargeRow, 'key'>>) {
    // Sửa số hoặc loại là câu lý do điền sẵn không còn đúng nữa.
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch, reason: undefined } : row)),
    );
    setRowsInvalid(false);
  }

  // ── Hiển thị ────────────────────────────────────────────────────────────
  const scheduled = ctx ? toAppTz(ctx.bookingReturnAt) : null;
  const lateMinutes = occurredAt && scheduled ? occurredAt.diff(scheduled, 'minute') : 0;
  const late = lateMinutes > 0;
  // Viên đọc lướt: một đơn vị như câu "Quá giờ trả xe 7 ngày" của thẻ. Câu dưới ô giờ thì chính xác
  // tới phút khi còn dưới một ngày — đó là thứ tính phí quá giờ.
  const timeliness = late ? t('late', { duration: fmt.roughDuration(lateMinutes) }) : t('onTime');
  const lateDetail =
    lateMinutes < 24 * 60 ? fmt.minutesDuration(lateMinutes) : fmt.roughDuration(lateMinutes);

  const slots = ctx ? handoverPhotoSlotsFor(ctx.vehicleType) : [];
  const returnPhotos = ctx?.return?.photos ?? [];
  const photosDone = returnPhotos.filter((photo) =>
    (slots as readonly string[]).includes(photo.slot),
  ).length;

  const pickupKm = ctx?.pickupOdometerKm ?? null;
  const odometerHint =
    pickupKm != null && odometerKm != null && odometerKm < pickupKm
      ? { tone: 'danger' as const, text: t('odoBelow', { pickup: fmt.km(pickupKm) }) }
      : pickupKm != null && odometerKm != null
        ? {
            tone: 'muted' as const,
            text: t.rich('odoDriven', {
              pickup: fmt.km(pickupKm),
              driven: fmt.km(odometerKm - pickupKm),
              b: (chunks) => <b>{chunks}</b>,
            }),
          }
        : pickupKm != null
          ? { tone: 'muted' as const, text: t('odoPickup', { pickup: fmt.km(pickupKm) }) }
          : ctx?.vehicleOdometerKm != null
            ? {
                tone: 'muted' as const,
                text: t('odoCurrent', { km: fmt.km(ctx.vehicleOdometerKm) }),
              }
            : { tone: 'muted' as const, text: t('odoOptional') };

  // ── Gửi ─────────────────────────────────────────────────────────────────
  async function submit(acknowledgeSuspicious = false) {
    if (submitting || !ctx) return;
    if (rows.some((row) => row.amount == null || row.amount <= 0)) {
      setRowsInvalid(true);
      setExpandedChoice(true);
      return;
    }
    setError(null);
    setOdometerError(null);
    if (!acknowledgeSuspicious) setSuspicion(null);
    setSubmitting(true);

    const body: ConfirmHandoverInput = {
      occurredAt: appWallClockToIso(occurredAt),
      // Ô trống: không gửi (giữ số của bản nháp, nếu có) — trừ khi người dùng vừa XOÁ số nháp.
      ...(odometerKm != null ? { odometerKm } : draftOdometer != null ? { odometerKm: null } : {}),
      ...(condition ? { condition } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      // Ảnh tải trong hộp làm `rowVersion` nhảy — ngữ cảnh được làm mới sau mỗi ảnh.
      ...(ctx.return?.rowVersion ? { expectedRowVersion: ctx.return.rowVersion } : {}),
      ...(acknowledgeSuspicious ? { acknowledgeSuspicious: true } : {}),
      ...(canRecord && drafts.length > 0 ? { surcharges: drafts } : {}),
      ...(collectActive && collectable ? { collectPayment: { amount: collectable, method } } : {}),
    };

    try {
      await confirmHandover(booking.id, HANDOVER_TYPE.RETURN, body);
      invalidateAll();
      // Phụ phí / phiếu thu đổi công nợ, sổ Thu chi, lịch sử thu tiền — cùng bộ làm mới với "Thu tiền".
      if (body.surcharges || body.collectPayment) invalidateAfterPayment(queryClient, booking.id);
      message.success(tHandover('confirmDialog.successReturn'));
      onClose();
    } catch (err) {
      const code = getErrorCode(err);
      const details = getErrorDetails(err);
      if (code === API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP) {
        const below = details as HandoverBelowPickupDetails | null;
        setOdometerError(
          typeof below?.pickupKm === 'number' && typeof below.odometerKm === 'number'
            ? tHandover('odometerBelowPickup', {
                entered: fmt.kmNumber(below.odometerKm),
                pickup: fmt.kmNumber(below.pickupKm),
              })
            : errorMessage(err),
        );
      } else if (
        code === API_ERROR_CODE.HANDOVER_ODOMETER_SUSPICIOUS &&
        typeof details?.deltaKm === 'number'
      ) {
        setSuspicion(details as unknown as HandoverSuspicionDetails);
      } else if (code === API_ERROR_CODE.HANDOVER_COLLECT_AMOUNT_CHANGED) {
        const amount = (details as Partial<CollectChangedDetails> | null)?.collectableAmount;
        setError(
          typeof amount === 'string'
            ? t('collectChanged', { amount: fmt.money(amount) })
            : errorMessage(err),
        );
        // Lấy số mới cho bộ số đang gõ — người dùng nhìn thấy rồi mới bấm lại.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookings.returnPreview(booking.id, previewInput).slice(0, 3),
        });
      } else {
        setError(errorMessage(err));
        // Biên bản / đơn có thể vừa đổi ở nơi khác — đọc lại cho lượt sau.
        void contextQuery.refetch();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const title = t('title', { code: booking.code });

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="lg"
      title={
        <span className={styles.titleBlock}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{t('subtitle')}</span>
        </span>
      }
      ariaLabel={title}
      confirmLoading={submitting}
      footer={
        <div className={styles.footer}>
          <Button size="large" onClick={onClose} disabled={submitting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            size="large"
            type="primary"
            loading={submitting}
            disabled={!ctx || waitingForMoney}
            onClick={() => void submit()}
          >
            {t('confirm')}
          </Button>
        </div>
      }
    >
      {contextQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void contextQuery.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : !ctx ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div className={styles.body}>
          {/* Thẻ xe: ảnh · tên + biển số · giờ hẹn trả · viên đúng giờ / trễ. */}
          <section className={styles.vehicleCard}>
            {booking.vehicleImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.vehicleImage} src={booking.vehicleImageUrl} alt="" />
            ) : (
              <span
                className={cx(styles.vehicleImage, styles.vehicleImageEmpty)}
                aria-hidden="true"
              >
                <CarOutlined />
              </span>
            )}
            <div className={styles.vehicleInfo}>
              <div className={styles.vehicleNameRow}>
                <span className={styles.vehicleName}>{ctx.vehicleName}</span>
                {ctx.plateNumber ? <span className={styles.plate}>{ctx.plateNumber}</span> : null}
              </div>
              <span className={styles.scheduled}>
                {t.rich('scheduledReturn', {
                  time: fmt.rentalPoint(toAppTz(ctx.bookingReturnAt)),
                  b: (chunks) => <b>{chunks}</b>,
                })}
              </span>
            </div>
            <span className={cx(styles.badge, late ? styles.badgeLate : styles.badgeOnTime)}>
              {timeliness}
            </span>
          </section>

          {/* Giờ nhận thực tế · Odo. */}
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>{t('timeLabel')}</span>
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format={datePattern.dateTime}
                value={occurredAt}
                onChange={(next) => next && setPickedAt(next)}
                allowClear={false}
                className={styles.control}
                suffixIcon={<LineIcon name="calendar-2" />}
                // Ghi cho tương lai là vô nghĩa — server cũng từ chối, chặn sớm cho đỡ mất công.
                disabledDate={(current) => current.isAfter(nowInAppTz().endOf('day'))}
              />
              <span className={cx(styles.timeHint, late ? styles.hintDanger : styles.hintSuccess)}>
                {late ? t('lateHint', { duration: lateDetail }) : t('onTime')}
              </span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('odoLabel')}</span>
              <InputNumber<number>
                className={styles.control}
                controls={false}
                precision={0}
                min={0}
                max={ODOMETER_MAX_KM}
                inputMode="numeric"
                value={odometerKm}
                placeholder={t('odoPlaceholder')}
                suffix={<span className={styles.unit}>{t('odoUnit')}</span>}
                // Lúc đang gõ AntD đưa vào CHUỖI (có thể rỗng) — rỗng phải hiện rỗng, không phải "0".
                formatter={(value) => {
                  const digits = String(value ?? '').replace(/\D/g, '');
                  return digits ? fmt.kmNumber(Number(digits)) : '';
                }}
                // Ô trống là "chưa đọc", không phải 0 km — `parseMoneyInput` chỉ là bộ đọc chữ số.
                parser={(value) => parseMoneyInput(value) as number}
                status={odometerError || odometerHint.tone === 'danger' ? 'error' : undefined}
                onChange={(value) => {
                  setOdometerInput(value ?? null);
                  setOdometerError(null);
                  setSuspicion(null);
                }}
              />
              <span
                className={cx(
                  styles.hint,
                  (odometerError || odometerHint.tone === 'danger') && styles.hintDanger,
                )}
                role={odometerError ? 'alert' : undefined}
              >
                {odometerError ?? odometerHint.text}
              </span>
            </label>
          </div>

          {/* Tình trạng, ảnh & ghi chú — THU GỌN sẵn (Figma 23941:64008); không bắt buộc. */}
          <section className={styles.details}>
            <button
              type="button"
              className={styles.detailsHeader}
              aria-expanded={expanded}
              aria-controls={sectionId}
              onClick={() => setExpandedChoice(!expanded)}
            >
              <span className={styles.detailsHeading}>
                <LineIcon
                  name="chevron-down"
                  className={cx(styles.chevron, !expanded && styles.chevronCollapsed)}
                />
                <span className={styles.detailsTitle}>{t('detailsTitle')}</span>
                <span className={styles.optional}>{t('optional')}</span>
              </span>
              <span className={styles.photoCount}>
                {t('photoCount', { done: photosDone, total: slots.length })}
              </span>
            </button>

            {/* `hidden` chứ không gỡ: ảnh đang tải dở không mất khi người dùng thu gọn. */}
            <div id={sectionId} className={styles.detailsBody} hidden={!expanded}>
              <div className={styles.group}>
                <span className={styles.groupTitle}>{tHandover('condition.label')}</span>
                <div
                  className={styles.choices}
                  role="radiogroup"
                  aria-label={tHandover('condition.label')}
                >
                  {(
                    [
                      [HANDOVER_CONDITION.NORMAL, t('conditionNormal')],
                      [HANDOVER_CONDITION.ATTENTION, tHandover('condition.attentionOption')],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={condition === value}
                      className={cx(styles.choice, condition === value && styles.choiceActive)}
                      // Bấm lại lựa chọn đang chọn là bỏ chọn — mục này tuỳ chọn.
                      onClick={() => setCondition(condition === value ? null : value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.group}>
                <span className={styles.groupTitle}>{t('photosLabel')}</span>
                <HandoverPhotoGrid
                  variant="row"
                  bookingId={booking.id}
                  type={HANDOVER_TYPE.RETURN}
                  vehicleType={ctx.vehicleType}
                  photos={returnPhotos}
                  canViewFiles={has(PERMISSION.HANDOVER_FILE_VIEW)}
                  disabled={!canManagePhotos}
                  ensureHandover={
                    ctx.return
                      ? undefined
                      : async () => {
                          await saveHandoverDraft(booking.id, HANDOVER_TYPE.RETURN, {});
                          await contextQuery.refetch();
                        }
                  }
                  // Chỉ ngữ cảnh bàn giao đổi (ảnh + rowVersion) — chưa có gì khác để làm mới.
                  onChanged={() =>
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.bookings.handovers(booking.id),
                    })
                  }
                />
              </div>

              <label className={styles.group}>
                <span className={styles.groupTitle}>{tHandover('notes.label')}</span>
                <Input.TextArea
                  value={notes}
                  maxLength={2000}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder={t('notesPlaceholder')}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              {canRecord ? (
                <div className={styles.group}>
                  <span className={styles.groupTitle}>{t('surchargeLabel')}</span>

                  {existing.length > 0 ? (
                    <ul className={styles.recorded} aria-label={t('surchargeRecorded')}>
                      {existing.map((row) => (
                        <li key={row.id} className={styles.recordedRow}>
                          <span>
                            {categoryLabel(row.category as SurchargeCategory)}
                            <span className={styles.recordedTag}>{t('surchargeRecorded')}</span>
                          </span>
                          <span className={styles.recordedAmount}>{fmt.money(row.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {rows.map((row, index) => {
                    const invalid = rowsInvalid && (row.amount == null || row.amount <= 0);
                    return (
                      <div key={row.key} className={styles.surchargeRow}>
                        <Select<SurchargeCategory>
                          className={styles.surchargeCategory}
                          value={row.category}
                          options={optionsFor(row.key)}
                          aria-label={t('surchargeCategory')}
                          onChange={(value) => updateRow(row.key, { category: value })}
                        />
                        <MoneyInput
                          className={styles.surchargeAmount}
                          value={row.amount}
                          min={0}
                          placeholder={t('surchargeAmountPlaceholder')}
                          status={invalid ? 'error' : undefined}
                          aria-label={categoryLabel(row.category)}
                          onChange={(value) => updateRow(row.key, { amount: value ?? null })}
                        />
                        <button
                          type="button"
                          className={styles.removeRow}
                          aria-label={t('surchargeRemove', { index: index + 1 })}
                          onClick={() => {
                            setRows((current) => current.filter((r) => r.key !== row.key));
                            setRowsInvalid(false);
                          }}
                        >
                          <LineIcon name="close" />
                        </button>
                      </div>
                    );
                  })}

                  {rowsInvalid ? (
                    <span className={cx(styles.hint, styles.hintDanger)} role="alert">
                      {t('surchargeIncomplete')}
                    </span>
                  ) : null}

                  {overtimeSuggestion ? (
                    <div className={styles.suggestion}>
                      <span>
                        {t('overtimeSuggestion', { amount: fmt.money(overtimeSuggestion.amount) })}
                      </span>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() =>
                          addRow({
                            category: SURCHARGE_CATEGORY.OVERTIME,
                            amount: Number(overtimeSuggestion.amount),
                            reason: t('overtimeReason', {
                              late: fmt.minutesDuration(overtimeSuggestion.lateMinutes),
                              hours: overtimeSuggestion.chargedHours,
                              fee: fmt.money(overtimeSuggestion.feePerHour ?? '0'),
                            }),
                          })
                        }
                      >
                        {t('suggestionApply')}
                      </button>
                    </div>
                  ) : null}
                  {mileageSuggestion ? (
                    <div className={styles.suggestion}>
                      <span>
                        {t('mileageSuggestion', {
                          excess: fmt.km(mileageSuggestion.excessKm),
                          amount: fmt.money(mileageSuggestion.amount),
                        })}
                      </span>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() =>
                          addRow({
                            category: SURCHARGE_CATEGORY.EXCESS_MILEAGE,
                            amount: Number(mileageSuggestion.amount),
                            reason: tSettlement('excessMileage.defaultReason', {
                              actual: fmt.km(mileageSuggestion.actualKm),
                              allowed: fmt.km(mileageSuggestion.allowedKm),
                              excess: fmt.km(mileageSuggestion.excessKm),
                              fee: fmt.money(mileageSuggestion.feePerKm ?? '0'),
                            }),
                          })
                        }
                      >
                        {t('suggestionApply')}
                      </button>
                    </div>
                  ) : null}

                  {rows.length < RETURN_SURCHARGE_DRAFT_MAX && optionsFor(null).length > 0 ? (
                    <button type="button" className={styles.addRow} onClick={addEmptyRow}>
                      <LineIcon name="plus" />
                      {t('surchargeAdd')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {/* Khối tiền — số của server; ô "Đã thu" ghi phiếu thu cùng lượt xác nhận. */}
          {settled ? (
            <section className={styles.money} aria-busy={preview.isFetching}>
              <div className={styles.moneyRow}>
                <span>{t('depositReceived')}</span>
                <span className={styles.moneyValue}>{fmt.money(settled.depositReceived)}</span>
              </div>
              <div className={styles.moneyRow}>
                <span>{t('surchargeTotal')}</span>
                <span className={cx(styles.moneyValue, styles.moneyDanger)}>
                  {fmt.money(settled.surchargeTotal)}
                </span>
              </div>
              <div className={cx(styles.moneyRow, styles.moneyRowTotal)}>
                <span className={styles.moneyLabelWithInfo}>
                  {t('proposedRefund')}
                  <PolicyInfoTip label={t('refundInfoLabel')}>{t('refundInfo')}</PolicyInfoTip>
                </span>
                <span className={styles.moneyTotal}>{fmt.money(settled.proposedRefund)}</span>
              </div>

              {canCollect && owes && collectable ? (
                <div className={styles.collect}>
                  <div className={styles.collectRow}>
                    <Checkbox
                      checked={collect}
                      onChange={(event) => setCollect(event.target.checked)}
                    >
                      <span className={styles.collectLabel}>
                        {t('collectLabel', { amount: fmt.money(collectable) })}
                      </span>
                    </Checkbox>
                    {collect ? (
                      <Select<string>
                        className={styles.collectMethod}
                        value={method}
                        options={financeOptions.paymentMethod}
                        aria-label={t('collectMethod')}
                        onChange={(value) => setMethod(value as PaymentMethod)}
                      />
                    ) : null}
                  </div>
                  <span className={styles.hint}>
                    {collect
                      ? t('collectHint')
                      : t('collectOffHint', { amount: fmt.money(collectable) })}
                  </span>
                </div>
              ) : null}
            </section>
          ) : preview.isError ? null : (
            <Skeleton active title={false} paragraph={{ rows: 3 }} />
          )}

          {/*
            Lỗi tính quyết toán — kể cả khi còn số của lượt trước: ô thu tiền không được nộp một số
            cũ, nên nút xác nhận chờ, và người dùng cần biết vì sao.
          */}
          {preview.isError && canCollect ? (
            <Alert
              type="warning"
              showIcon
              title={t('previewError')}
              action={
                <Button size="small" onClick={() => void preview.refetch()}>
                  {tCommon('actions.retry')}
                </Button>
              }
            />
          ) : null}

          {suspicion ? (
            <Alert
              type="warning"
              showIcon
              role="alert"
              title={t('suspicious', {
                delta: fmt.km(suspicion.deltaKm),
                days: suspicion.rentalDays,
                threshold: fmt.km(suspicion.thresholdKmPerDay),
              })}
              action={
                <Button size="small" loading={submitting} onClick={() => void submit(true)}>
                  {t('suspiciousConfirm')}
                </Button>
              }
            />
          ) : null}

          {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}
        </div>
      )}
    </ResponsiveDialog>
  );
}
