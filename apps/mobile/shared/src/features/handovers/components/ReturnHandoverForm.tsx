import { useMemo, useRef, useState, type ReactNode } from 'react';
import { DataRow } from '@/components/ui/DataRow';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { Ionicons } from '@/components/icons/Ionicons';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  HANDOVER_CONDITION,
  HANDOVER_TYPE,
  ODOMETER_MAX_KM,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  RETURN_SURCHARGE_DRAFT_MAX,
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_LABEL,
  SURCHARGE_CATEGORY_VALUES,
  handoverPhotoSlotsFor,
  isEarlyReturn,
  isSingleEntrySurchargeCategory,
  surchargeCategoryBlock,
  type HandoverCondition,
  type MoneyString,
  type PaymentMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import {
  appWallClockToIso,
  isPositiveMoney,
  isZeroMoney,
  nowInAppTz,
  toAppTz,
  type Dayjs,
} from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CheckMark } from '@/components/ui/CheckMark';
import { IconButton } from '@/components/ui/IconButton';
import { InfoHint } from '@/components/ui/InfoHint';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { MoneyControl } from '@/components/ui/MoneyControl';
import { RadioOption } from '@/components/ui/RadioOption';
import { SelectControl } from '@/components/ui/SelectControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextControl } from '@/components/ui/TextControl';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useBooking } from '@/features/bookings/hooks/use-bookings';
import {
  invalidateMoneyBranches,
  useReturnSettlementPreview,
} from '@/features/settlement/hooks/use-settlement';
import type { ReturnSurchargeDraft } from '@/features/settlement/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type {
  ConfirmHandoverInput,
  Handover,
  HandoverBelowPickupDetails,
  HandoverContext,
  HandoverSuspicionDetails,
} from '../api';
import { useConfirmHandover, useSaveHandoverDraft } from '../hooks/use-handovers';
import { HandoverPhotoGrid } from './HandoverPhotoGrid';

const NOTE_MAX = 2000;
/** Ảnh xe ở thẻ đầu màn nhận xe. */

interface SurchargeRow {
  key: number;
  category: SurchargeCategory;
  /** Chuỗi tiền (ADR 0007) — web `ConfirmReturnDialog` còn giữ `number`, follow-up phía web. */
  amount: MoneyString | null;
  /** Câu gửi khách khi dòng đến từ một gợi ý của server; sửa số / loại là bỏ câu đó. */
  reason?: string;
}

/**
 * Mốc mặc định — cùng luật web `ConfirmReturnDialog` (06/11/2026): lúc khách BÁO đã trả xe
 * (ADR 0081) → giờ hẹn trả nếu đã qua → bây giờ. `now` đóng băng lúc mở màn.
 */
function defaultOccurredAt(
  customerReturnedAt: string | null | undefined,
  scheduledReturnAt: string | null | undefined,
  now: Dayjs,
): Dayjs {
  const reported = customerReturnedAt ? toAppTz(customerReturnedAt) : null;
  if (reported?.isValid() && reported.isBefore(now)) return reported;
  const scheduled = scheduledReturnAt ? toAppTz(scheduledReturnAt) : null;
  if (scheduled?.isValid() && scheduled.isBefore(now)) return scheduled;
  return now;
}

/**
 * "Xác nhận đã nhận lại xe" — bản native của web `ConfirmReturnDialog` (PR #278).
 *
 * Một lần bấm làm trọn việc cuối chuyến trong MỘT transaction ở server: biên bản trả xe (giờ thực
 * tế, Odo, tình trạng, ghi chú, ảnh), các khoản phụ phí gõ ở đây, và — ô "Đã thu tiền" BẬT SẴN —
 * một phiếu thu cho số khách còn phải trả. Mọi con số tiền là của SERVER (`return-preview`); màn
 * chỉ hiển thị và nộp lại đúng số đang hiển thị — lệch là 409 kèm số mới.
 */
export function ReturnHandoverForm({
  context,
  handover,
  refreshing,
  onRefresh,
  onBack,
}: {
  context: HandoverContext;
  handover: Handover | null;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.handover.returnDialog');
  const tHandover = useTranslations('Bookings.handover');
  const tSettlement = useTranslations('Bookings.settlement');
  const tCommon = useTranslations('Common');
  const tActionBar = useTranslations('Bookings.actionBar');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const bookingId = context.bookingId;
  const booking = useBooking(bookingId).data;

  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);
  // Ô thu tiền ghi phiếu thu — cùng cổng với nút "Thu tiền" (quyền + năng lực Thu chi của gói).
  const canCollect = canRecord && financeFeature.isVisible;
  const canManagePhotos = permissions.has(PERMISSION.HANDOVER_MANAGE);
  const canConfirm = permissions.has(PERMISSION.HANDOVER_CONFIRM);

  const confirm = useConfirmHandover(bookingId, HANDOVER_TYPE.RETURN);
  const saveDraft = useSaveHandoverDraft(bookingId, HANDOVER_TYPE.RETURN);

  const [pickedAt, setPickedAt] = useState<Dayjs | undefined>(undefined);
  const [pickingMoment, setPickingMoment] = useState(false);
  const [odometerText, setOdometerText] = useState<string | undefined>(undefined);
  const [condition, setCondition] = useState<HandoverCondition | null>(
    (handover?.condition as HandoverCondition | null | undefined) ?? null,
  );
  const [notes, setNotes] = useState(handover?.notes ?? '');
  const [rows, setRows] = useState<SurchargeRow[]>([]);
  const [rowsInvalid, setRowsInvalid] = useState(false);
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const [collect, setCollect] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHOD.CASH);
  const [error, setError] = useState<string | null>(null);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [suspicion, setSuspicion] = useState<HandoverSuspicionDetails | null>(null);
  const rowSeq = useRef(0);

  const [openedAt] = useState(nowInAppTz);
  const customerReturnedAt = booking?.customerReturnedAt ?? null;
  const defaultAt = useMemo(
    () => defaultOccurredAt(customerReturnedAt, context.bookingReturnAt, openedAt),
    [customerReturnedAt, context.bookingReturnAt, openedAt],
  );
  const occurredAt = pickedAt ?? defaultAt;

  const draftOdometer = handover?.odometerKm ?? null;
  const parsedOdo = odometerText === undefined ? undefined : odometerText.replace(/\D/g, '');
  const odometerKm =
    parsedOdo === undefined ? draftOdometer : parsedOdo === '' ? null : Number(parsedOdo);
  const odometerTooLarge = odometerKm != null && odometerKm > ODOMETER_MAX_KM;

  const validRows = rows.filter((row) => isPositiveMoney(row.amount));
  const drafts: ReturnSurchargeDraft[] = validRows.map((row) => ({
    category: row.category,
    amount: row.amount ?? '0',
    ...(row.reason ? { reason: row.reason } : {}),
  }));

  // ── Quyết toán xem trước (server tính) — khoá bằng CHUỖI để debounce so bằng giá trị.
  const inputKey = JSON.stringify({
    occurredAt: appWallClockToIso(occurredAt),
    odometerKm: odometerTooLarge ? null : odometerKm,
    surcharges: drafts.map(({ category, amount }) => ({ category, amount })),
  });
  const debouncedKey = useDebouncedValue(inputKey, 300);
  const previewInput = useMemo(
    () => JSON.parse(debouncedKey) as Record<string, unknown>,
    [debouncedKey],
  );
  const preview = useReturnSettlementPreview(bookingId, previewInput);
  const settled = preview.data;
  const previewFresh =
    Boolean(settled) && !preview.isFetching && !preview.isPlaceholderData && debouncedKey === inputKey;

  const existing = settled?.surcharges ?? [];
  const recordedCategories = new Set<string>(existing.map((row) => row.category));
  const collectable = settled?.collectableAmount ?? null;
  const owes = collectable != null && !isZeroMoney(collectable);
  const collectActive = canCollect && collect && owes;
  const waitingForMoney = canCollect && !previewFresh;

  // Chưa có đơn thì chưa biết loại dịch vụ - chưa mở danh mục nào (đơn có tài xế không thoáng thấy
  // danh mục bị chặn như web `ConfirmReturnDialog`, nơi đơn có sẵn trước khi hộp mở).
  const categoryAllowed = (value: SurchargeCategory) =>
    booking ? surchargeCategoryBlock(value, booking.serviceType) === null : false;
  const categoryLabel = (value: SurchargeCategory) =>
    domainLabel('surchargeCategory', value, SURCHARGE_CATEGORY_LABEL[value]);
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
  const expanded =
    expandedChoice ?? Boolean(overtimeSuggestion || mileageSuggestion || rows.length > 0);

  function addRow(row: Omit<SurchargeRow, 'key'>) {
    rowSeq.current += 1;
    const key = rowSeq.current;
    setRows((current) => [...current, { ...row, key }]);
    setRowsInvalid(false);
    setExpandedChoice(true);
  }
  function pickTime(next: Dayjs) {
    setExpandedChoice((choice) => choice ?? expanded);
    setPickedAt(next);
  }
  function addEmptyRow() {
    const first = optionsFor(null)[0]?.value;
    if (first) addRow({ category: first, amount: null });
  }
  function updateRow(key: number, patch: Partial<Omit<SurchargeRow, 'key'>>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch, reason: undefined } : row)),
    );
    setRowsInvalid(false);
  }

  // ── Hiển thị
  const scheduled = toAppTz(context.bookingReturnAt);
  const lateMinutes = scheduled.isValid() ? occurredAt.diff(scheduled, 'minute') : 0;
  const late = lateMinutes > 0;
  const backToScheduled =
    scheduled.isValid() && scheduled.isBefore(openedAt) && !occurredAt.isSame(scheduled, 'minute')
      ? scheduled
      : null;
  /*
   * Trả SỚM (ADR 0105, web `ConfirmReturnDialog`): đo bằng lúc MỞ màn - mốc bấm xác nhận server dùng -
   * không bằng giờ trả thực tế ở ô dưới (chủ xe được lùi ô đó). Cùng ngưỡng với "Tôi chưa trả xe".
   */
  const earlyMinutes =
    scheduled.isValid() && isEarlyReturn(scheduled.toDate(), openedAt.toDate())
      ? scheduled.diff(openedAt, 'minute')
      : 0;
  const earlyDuration = earlyMinutes > 0 ? fmt.roughDuration(earlyMinutes) : null;
  const offSchedule = late || earlyDuration !== null;
  const timeliness = late
    ? t('late', { duration: fmt.roughDuration(lateMinutes) })
    : earlyDuration
      ? t('early', { duration: earlyDuration })
      : t('onTime');
  const lateDetail =
    lateMinutes < 24 * 60 ? fmt.minutesDuration(lateMinutes) : fmt.roughDuration(lateMinutes);

  const slots = handoverPhotoSlotsFor(context.vehicleType);
  const photosDone = (handover?.photos ?? []).filter((photo) =>
    (slots as readonly string[]).includes(photo.slot),
  ).length;

  const pickupKm = context.pickupOdometerKm ?? null;
  const odoBelow = pickupKm != null && odometerKm != null && odometerKm < pickupKm;
  const bold = (chunks: ReactNode) => <Text fow={fontWeight.semibold}>{chunks}</Text>;
  const odometerHint: ReactNode = odoBelow
    ? t('odoBelow', { pickup: fmt.km(pickupKm) })
    : pickupKm != null && odometerKm != null
      ? t.rich('odoDriven', {
          pickup: fmt.km(pickupKm),
          driven: fmt.km(odometerKm - pickupKm),
          b: bold,
        })
      : pickupKm != null
        ? t('odoPickup', { pickup: fmt.km(pickupKm) })
        : context.vehicleOdometerKm != null
          ? t('odoCurrent', { km: fmt.km(context.vehicleOdometerKm) })
          : t('odoOptional');

  // ── Gửi
  function submit(acknowledgeSuspicious = false) {
    if (confirm.isPending) return;
    if (odometerTooLarge) {
      setOdometerError(tHandover('odometerError.tooLarge', { max: ODOMETER_MAX_KM }));
      return;
    }
    if (rows.some((row) => !isPositiveMoney(row.amount))) {
      setRowsInvalid(true);
      setExpandedChoice(true);
      return;
    }
    setError(null);
    setOdometerError(null);
    if (!acknowledgeSuspicious) setSuspicion(null);

    const body: ConfirmHandoverInput = {
      occurredAt: appWallClockToIso(occurredAt),
      ...(odometerKm != null ? { odometerKm } : draftOdometer != null ? { odometerKm: null } : {}),
      ...(condition ? { condition } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(handover?.rowVersion ? { expectedRowVersion: handover.rowVersion } : {}),
      ...(acknowledgeSuspicious ? { acknowledgeSuspicious: true } : {}),
      ...(canRecord && drafts.length > 0 ? { surcharges: drafts } : {}),
      ...(collectActive && collectable ? { collectPayment: { amount: collectable, method } } : {}),
    } as ConfirmHandoverInput;

    confirm.mutate(body, {
      onSuccess: () => {
        if (body.surcharges || body.collectPayment) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.payments.history(bookingId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.settlement(bookingId) });
          invalidateMoneyBranches(queryClient);
        }
        toast.showSuccess(tHandover('confirmDialog.successReturn'));
        onBack();
      },
      onError: (err) => {
        const code = getErrorCode(err);
        const details = (err as { details?: Record<string, unknown> }).details ?? null;
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
          const amount = details?.collectableAmount;
          setError(
            typeof amount === 'string'
              ? t('collectChanged', { amount: fmt.money(amount) })
              : errorMessage(err),
          );
          void queryClient.invalidateQueries({
            queryKey: queryKeys.bookings.returnPreviewAll(bookingId),
          });
        } else {
          setError(errorMessage(err));
          onRefresh();
        }
      },
    });
  }

  const sectionTitle = (label: string) => (
    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
      {label}
    </Text>
  );

  return (
    <>
      <AppHeader
        title={t('title', { code: context.bookingCode })}
        subtitle={t('subtitle')}
        onBack={onBack}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={refreshing}
        onRefresh={onRefresh}
        // Nút xác nhận DÍNH ĐÁY như thanh CTA của app khách - form dài, không bắt cuộn xuống cuối mới bấm được.
        {...(canConfirm
          ? {
              footer: (
                <StickyActionBar
                  primary={
                    <Button
                      label={t('confirm')}
                      icon="checkmark-circle-outline"
                      size="lg"
                      loading={confirm.isPending}
                      disabled={waitingForMoney}
                      onPress={() => submit()}
                    />
                  }
                />
              ),
            }
          : {})}
      >
        <YStack gap={layout.section}>
          {/* Thẻ xe: tên + biển số · giờ hẹn trả · viên đúng giờ / trễ. */}
          <Card>
            <XStack ai="flex-start" gap={space.sm}>
              {/* Web `ConfirmReturnDialog`: ảnh xe đầu thẻ (không có thì icon xe). */}
              <VehicleThumb uri={booking?.vehicleImageUrl ?? null} accessibilityLabel={booking?.vehicleName ?? ''} />
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                  {context.vehicleName}
                </Text>
                {context.plateNumber ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {context.plateNumber}
                  </Text>
                ) : null}
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t.rich('scheduledReturn', { time: fmt.rentalPoint(scheduled), b: bold })}
                </Text>
              </YStack>
              <XStack
                px={space.sm}
                py={2}
                br={radius.pill}
                bw={1}
                bc={offSchedule ? colors.danger : colors.success}
                bg={offSchedule ? colors.dangerSurface : colors.successSurface}
              >
                <Text col={offSchedule ? colors.danger : colors.success} fos={fontSize.label} fow={fontWeight.medium}>
                  {timeliness}
                </Text>
              </XStack>
            </XStack>
          </Card>

          {earlyDuration ? (
            <Callout tone="warning" title={t('earlyTitle', { duration: earlyDuration })}>
              {t('earlyBody')}
            </Callout>
          ) : null}

          <Card>
            <YStack gap={space.md}>
              {/* Giờ nhận thực tế — "Hiện tại" / "Đúng giờ" bật qua lại như web. */}
              <YStack gap={space.xs}>
                <XStack ai="center" jc="space-between">
                  {sectionTitle(t('timeLabel'))}
                  <Text
                    col={colors.primaryActive}
                    fos={fontSize.bodySm}
                    fow={fontWeight.medium}
                    accessibilityRole="button"
                    accessibilityLabel={
                      backToScheduled
                        ? t('useScheduledAria', { time: fmt.shortDateTime(backToScheduled.toISOString()) })
                        : t('useNowAria')
                    }
                    onPress={() => pickTime(backToScheduled ?? nowInAppTz())}
                  >
                    {backToScheduled ? t('useScheduled') : t('useNow')}
                  </Text>
                </XStack>
                <Card tone="muted" lift="flat" onPress={() => setPickingMoment(true)} accessibilityLabel={t('timeLabel')}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                    {fmt.rentalPoint(occurredAt)}
                  </Text>
                </Card>
                <Text col={late ? colors.danger : colors.success} fos={fontSize.label}>
                  {late ? t('lateHint', { duration: lateDetail }) : t('onTime')}
                </Text>
              </YStack>

              <TextControl
                label={t('odoLabel')}
                value={
                  odometerText !== undefined
                    ? odometerText === ''
                      ? ''
                      : fmt.kmNumber(Number(odometerText))
                    : draftOdometer != null
                      ? fmt.kmNumber(draftOdometer)
                      : ''
                }
                onChangeText={(next) => {
                  setOdometerText(next.replace(/\D/g, ''));
                  setOdometerError(null);
                  setSuspicion(null);
                }}
                placeholder={t('odoPlaceholder')}
                keyboardType="number-pad"
                error={odometerError ?? undefined}
              />
              {odometerError ? null : (
                <Text col={odoBelow ? colors.danger : colors.textMuted} fos={fontSize.label}>
                  {odometerHint}
                </Text>
              )}
            </YStack>
          </Card>

          {/* Tình trạng, ảnh & ghi chú — THU GỌN sẵn; không bắt buộc. */}
          <Card>
            <YStack gap={space.md}>
              <XStack
                ai="center"
                gap={space.xs}
                onPress={() => setExpandedChoice(!expanded)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={t('detailsTitle')}
              >
                <Ionicons
                  name={expanded ? 'chevron-down' : 'chevron-forward'}
                  size={iconSize.sm}
                  color={colors.text}
                />
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('detailsTitle')}{' '}
                  <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.regular}>
                    {t('optional')}
                  </Text>
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('photoCount', { done: photosDone, total: slots.length })}
                </Text>
              </XStack>

              {/* Giữ trong cây (ẩn bằng display) để ảnh đang tải dở không mất khi thu gọn. */}
              <YStack gap={space.md} display={expanded ? 'flex' : 'none'}>
                <YStack gap={space.xs}>
                  {sectionTitle(tHandover('condition.label'))}
                  <RadioOption
                    label={t('conditionNormal')}
                    checked={condition === HANDOVER_CONDITION.NORMAL}
                    onPress={() =>
                      setCondition(condition === HANDOVER_CONDITION.NORMAL ? null : HANDOVER_CONDITION.NORMAL)
                    }
                  />
                  <RadioOption
                    label={tHandover('condition.attentionOption')}
                    checked={condition === HANDOVER_CONDITION.ATTENTION}
                    onPress={() =>
                      setCondition(
                        condition === HANDOVER_CONDITION.ATTENTION ? null : HANDOVER_CONDITION.ATTENTION,
                      )
                    }
                  />
                </YStack>

                <YStack gap={space.xs}>
                  {sectionTitle(t('photosLabel'))}
                  {/*
                    Luôn dựng lưới ảnh như web (`HandoverPhotoGrid disabled={!canManagePhotos}`): lưới
                    tự gác thêm/gỡ theo `HANDOVER_MANAGE` và xem tệp theo `HANDOVER_FILE_VIEW`, nên
                    người chỉ có quyền xem vẫn thấy ảnh đã chụp.
                  */}
                  <HandoverPhotoGrid
                    bookingId={bookingId}
                    type={HANDOVER_TYPE.RETURN}
                    vehicleType={context.vehicleType}
                    handover={handover}
                    {...(canManagePhotos
                      ? {
                          ensureHandover: async () => {
                            if (handover) return;
                            await saveDraft.mutateAsync({});
                          },
                        }
                      : {})}
                  />
                </YStack>

                <TextControl
                  label={tHandover('notes.label')}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t('notesPlaceholder')}
                  multiline
                  rows={3}
                  maxLength={NOTE_MAX}
                />

                {canRecord ? (
                  <YStack gap={space.sm}>
                    {sectionTitle(t('surchargeLabel'))}
                    {existing.map((row) => (
                      <XStack key={row.id} ai="center" jc="space-between" gap={space.sm}>
                        <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                          {categoryLabel(row.category as SurchargeCategory)}{' '}
                          <Text col={colors.textMuted} fos={fontSize.label}>
                            {t('surchargeRecorded')}
                          </Text>
                        </Text>
                        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                          {fmt.money(row.amount)}
                        </Text>
                      </XStack>
                    ))}

                    {rows.map((row, index) => {
                      const invalid = rowsInvalid && !isPositiveMoney(row.amount);
                      return (
                        <YStack
                          key={row.key}
                          gap={space.sm}
                          p={space.md}
                          bg={colors.surfaceMuted}
                          br={radius.md}
                        >
                          <XStack ai="center" jc="space-between">
                            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                              {t('surchargeItem', { index: index + 1 })}
                            </Text>
                            <IconButton
                              icon="trash-outline"
                              label={t('surchargeRemove', { index: index + 1 })}
                              onPress={() => {
                                setRows((current) => current.filter((r) => r.key !== row.key));
                                setRowsInvalid(false);
                              }}
                            />
                          </XStack>
                          <SelectControl
                            label={t('surchargeCategory')}
                            value={row.category}
                            options={optionsFor(row.key)}
                            onChange={(value) =>
                              updateRow(row.key, { category: value as SurchargeCategory })
                            }
                          />
                          <MoneyControl
                            label={categoryLabel(row.category)}
                            value={row.amount == null ? null : Number(row.amount)}
                            placeholder={t('surchargeAmountPlaceholder')}
                            error={invalid ? t('surchargeIncomplete') : undefined}
                            onChange={(value) =>
                              updateRow(row.key, { amount: value == null ? null : String(value) })
                            }
                          />
                        </YStack>
                      );
                    })}

                    {rowsInvalid ? (
                      <Text col={colors.danger} fos={fontSize.label} accessibilityRole="alert">
                        {t('surchargeIncomplete')}
                      </Text>
                    ) : null}

                    {overtimeSuggestion ? (
                      <Suggestion
                        text={t('overtimeSuggestion', { amount: fmt.money(overtimeSuggestion.amount) })}
                        action={t('suggestionApply')}
                        onPress={() =>
                          addRow({
                            category: SURCHARGE_CATEGORY.OVERTIME,
                            amount: overtimeSuggestion.amount ?? null,
                            reason: t('overtimeReason', {
                              late: fmt.minutesDuration(overtimeSuggestion.lateMinutes),
                              hours: overtimeSuggestion.chargedHours,
                              fee: fmt.money(overtimeSuggestion.feePerHour ?? '0'),
                            }),
                          })
                        }
                      />
                    ) : null}
                    {mileageSuggestion ? (
                      <Suggestion
                        text={t('mileageSuggestion', {
                          excess: fmt.km(mileageSuggestion.excessKm),
                          amount: fmt.money(mileageSuggestion.amount),
                        })}
                        action={t('suggestionApply')}
                        onPress={() =>
                          addRow({
                            category: SURCHARGE_CATEGORY.EXCESS_MILEAGE,
                            amount: mileageSuggestion.amount ?? null,
                            reason: tSettlement('excessMileage.defaultReason', {
                              actual: fmt.km(mileageSuggestion.actualKm),
                              allowed: fmt.km(mileageSuggestion.allowedKm),
                              excess: fmt.km(mileageSuggestion.excessKm),
                              fee: fmt.money(mileageSuggestion.feePerKm ?? '0'),
                            }),
                          })
                        }
                      />
                    ) : null}

                    {rows.length < RETURN_SURCHARGE_DRAFT_MAX && optionsFor(null).length > 0 ? (
                      <Button
                        label={t('surchargeAdd')}
                        icon="add"
                        variant="outline"
                        onPress={addEmptyRow}
                      />
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>
            </YStack>
          </Card>

          {/* Khối tiền — số của server; ô "Đã thu" ghi phiếu thu cùng lượt xác nhận. */}
          {settled ? (
            <Card>
              <YStack gap={space.sm} opacity={preview.isFetching ? 0.7 : 1}>
                <DataRow label={t('depositReceived')} value={fmt.money(settled.depositReceived)} />
                <DataRow
                  label={t('surchargeTotal')}
                  value={fmt.money(settled.surchargeTotal)}
                  // Đỏ chỉ khi THẬT có phụ phí - "0 đ" đỏ đọc như một khoản nợ.
                  {...(isZeroMoney(settled.surchargeTotal) ? {} : { tone: 'danger' as const })}
                />
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <XStack ai="center" gap={space.xs} f={1}>
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                      {t('proposedRefund')}
                    </Text>
                    <InfoHint label={t('refundInfoLabel')} content={t('refundInfo')} />
                  </XStack>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                    {fmt.money(settled.proposedRefund)}
                  </Text>
                </XStack>

                {canCollect && owes && collectable ? (
                  <YStack gap={space.xs} pt={space.sm} borderTopWidth={1} borderTopColor={colors.border}>
                    <XStack
                      ai="center"
                      gap={space.sm}
                      onPress={() => setCollect((v) => !v)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: collect }}
                    >
                      <CheckMark checked={collect} />
                      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                        {t('collectLabel', { amount: fmt.money(collectable) })}
                      </Text>
                    </XStack>
                    {collect ? (
                      <SelectControl
                        label={t('collectMethod')}
                        value={method}
                        options={PAYMENT_METHOD_VALUES.map((value) => ({
                          value,
                          label: domainLabel('paymentMethod', value),
                        }))}
                        onChange={(value) => setMethod(value as PaymentMethod)}
                      />
                    ) : null}
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {collect
                        ? t('collectHint')
                        : t('collectOffHint', { amount: fmt.money(collectable) })}
                    </Text>
                  </YStack>
                ) : null}
              </YStack>
            </Card>
          ) : preview.isError ? null : (
            <Skeleton height={120} />
          )}

          {preview.isError && canCollect ? (
            <Callout tone="warning">{t('previewError')}</Callout>
          ) : null}
          {preview.isError && canCollect ? (
            <Button
              label={tCommon('actions.retry')}
              variant="secondary"
              onPress={() => void preview.refetch()}
            />
          ) : null}

          {suspicion ? (
            <YStack gap={space.sm}>
              <Callout tone="warning">
                {t('suspicious', {
                  delta: fmt.km(suspicion.deltaKm),
                  days: suspicion.rentalDays,
                  threshold: fmt.km(suspicion.thresholdKmPerDay),
                })}
              </Callout>
              <Button
                label={t('suspiciousConfirm')}
                variant="secondary"
                loading={confirm.isPending}
                onPress={() => submit(true)}
              />
            </YStack>
          ) : null}

          {error ? <Callout tone="danger">{error}</Callout> : null}

          {canConfirm ? null : (
            <Callout tone="info">{tActionBar('confirmPermissionHint')}</Callout>
          )}

        </YStack>
      </Screen>

      {pickingMoment ? (
        <MomentPickerSheet
          open
          onClose={() => setPickingMoment(false)}
          value={occurredAt}
          onChange={pickTime}
          notAfter={nowInAppTz()}
          title={t('timeLabel')}
        />
      ) : null}
    </>
  );
}


function Suggestion({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <XStack
      ai="center"
      gap={space.sm}
      p={space.sm}
      br={radius.md}
      bg={colors.warningSurface}
      bw={1}
      bc={colors.warningBorder}
    >
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {text}
      </Text>
      <Text
        col={colors.primaryActive}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        accessibilityRole="button"
        onPress={onPress}
      >
        {action}
      </Text>
    </XStack>
  );
}
