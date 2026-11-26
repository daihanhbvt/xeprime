import { useState } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { yupResolver } from '@hookform/resolvers/yup';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  HANDOVER_CONDITION,
  HANDOVER_TYPE,
  PERMISSION,
  isHandoverEditable,
  HANDOVER_STATUS,
  ODOMETER_MAX_KM,
  type HandoverCondition,
  type HandoverStatus,
  type HandoverType,
} from '@xeprime/types';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RadioOption } from '@/components/ui/RadioOption';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { TextField } from '@/components/ui/TextField';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { Ionicons } from '@/components/icons/Ionicons';
import { HandoverPhotoGrid } from './components/HandoverPhotoGrid';
import { ResolveOdometerSheet } from './components/ResolveOdometerSheet';
import { ReturnHandoverForm } from './components/ReturnHandoverForm';
import {
  useConfirmHandover,
  useHandoverContext,
  useSaveHandoverDraft,
} from './hooks/use-handovers';
import type { Handover, HandoverContext, HandoverBelowPickupDetails } from './api';
import { useErrorMessage } from '@/i18n/use-error-message';

const NOTE_MAX = 2000;
/** Vòng icon đầu khối "Sẵn sàng giao xe" - 56px như web `ConfirmHandoverDialog.module.css`. */
const PICKUP_ICON = 56;
const PICKUP_ICON_GLYPH = 24;

interface HandoverFormValues {
  odometerKm: number | null;
  condition: string | null;
  notes: string;
}

/**
 * Xác nhận giao / nhận xe (BKG-09) — bản native của `ConfirmHandoverDialog`.
 *
 * **Luồng nhanh là mặc định**: một chuyến bình thường xong bằng đúng hai lần bấm — mở màn, bấm
 * xác nhận. Odo đứng đầu vì đó là thứ DUY NHẤT phải đọc trên xe ngay lúc bàn giao; bỏ lỡ khoảnh
 * khắc đó thì không lấy lại được, trong khi giờ giấc và ghi chú luôn khai bù được sau. Vẫn tuỳ
 * chọn: bỏ trống thì KM của xe giữ nguyên, không dựng ra `0 km`.
 *
 * Mọi thứ còn lại nằm trong vùng ĐÓNG SẴN và không bao giờ chặn nút chính.
 *
 * `confirmed` là ĐIỂM KHÔNG QUAY LẠI: từ đó biên bản chỉ đọc, sửa KM phải đi đường điều chỉnh
 * có lý do + quyền riêng. Việc xác nhận đổi luôn trạng thái đơn trong cùng transaction ở server
 * (`pickup → active`, `return → completed`) — client không tự gọi thêm `transition`.
 */
export function HandoverScreen({ bookingId, type }: { bookingId: string; type: HandoverType }) {
  const t = useTranslations('Bookings.handover');
  const router = useRouter();
  const query = useHandoverContext(bookingId);

  const back = () => goBackOr(router, ROUTES.manage.bookingDetail(bookingId));
  const refreshing = query.isRefetching;
  const onRefresh = () => void query.refetch();
  const title = type === HANDOVER_TYPE.PICKUP ? t('titlePickup') : t('titleReturn');

  if (query.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack gap={layout.section}>
            <Skeleton height={80} />
            <SkeletonText lines={4} />
            <Skeleton height={120} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('errorTitle')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  const eligible =
    type === HANDOVER_TYPE.PICKUP ? query.data.canStartPickup : query.data.canStartReturn;
  const existing = type === HANDOVER_TYPE.PICKUP ? query.data.pickup : query.data.return;

  // `canStart*` do SERVER quyết. Client KHÔNG tự suy từ `booking.status` — hai bên nói hai luật
  // khác nhau là chỗ màn này mở ra rồi mọi thao tác nhận 409.
  if (!eligible && !existing) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('notEligible')} />
        </Screen>
      </>
    );
  }

  /*
   * Nhận lại xe (PR #278, 06/11/2026): màn riêng gom biên bản + phụ phí + thu tiền vào CÙNG lượt
   * xác nhận như web `ConfirmReturnDialog`. Biên bản đã chốt (chỉ đọc) vẫn đi màn chung bên dưới.
   */
  if (
    type === HANDOVER_TYPE.RETURN &&
    (existing == null || isHandoverEditable(existing.status as HandoverStatus))
  ) {
    return (
      <ReturnHandoverForm
        context={query.data}
        handover={existing ?? null}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onBack={back}
      />
    );
  }

  return (
    <HandoverForm
      context={query.data}
      handover={existing ?? null}
      type={type}
      title={title}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={back}
    />
  );
}

/**
 * Mốc mặc định = **giờ đã hẹn trên đơn**, không phải "bây giờ": chuyến chạy đúng lịch thì đó mới
 * là giờ thật, còn lúc nhân viên rảnh tay mở máy chỉ là chuyện tình cờ.
 *
 * Kẹp về hiện tại khi giờ hẹn còn ở tương lai (giao sớm) — biên bản cho một việc "sẽ xảy ra" là
 * vô nghĩa và server cũng từ chối, nên không đưa người dùng một biểu mẫu sai sẵn từ lúc mở.
 */
function defaultOccurredAt(scheduledIso: string): Dayjs {
  /*
   * Mặt đồng hồ neo vào GIỜ VIỆT NAM, không vào giờ máy (CLAUDE.md §9).
   *
   * Thiết bị đặt lệch múi giờ mà dùng `dayjs()` sẽ hiện một giờ ở thẻ chọn và một giờ khác ở
   * dòng gợi ý ngay dưới (dòng đó vốn đã in giờ VN) — rồi ghi đúng cái giờ sai ấy vào biên bản.
   */
  const now = nowInAppTz();
  const scheduled = toAppTz(scheduledIso);
  return scheduled.isValid() && scheduled.isBefore(now) ? scheduled : now;
}

function HandoverForm({
  context,
  handover,
  type,
  title,
  refreshing,
  onRefresh,
  onBack,
}: {
  context: HandoverContext;
  handover: Handover | null;
  type: HandoverType;
  title: string;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.handover');
  const tOdoError = useTranslations('Bookings.handover.odometerError');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const isPickup = type === HANDOVER_TYPE.PICKUP;
  const isReturn = !isPickup;

  const [confirming, setConfirming] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [pickingMoment, setPickingMoment] = useState(false);
  const [fixingOdometer, setFixingOdometer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState<Dayjs>(() =>
    defaultOccurredAt(isPickup ? context.bookingPickupAt : context.bookingReturnAt),
  );

  const confirm = useConfirmHandover(context.bookingId, type);
  const saveDraft = useSaveHandoverDraft(context.bookingId, type);

  /*
   * Ảnh cần một biên bản để gắn vào; luồng nhanh chưa tạo cái nào cho tới lúc xác nhận. Tạo TRỄ,
   * đúng lúc người dùng chọn tấm ảnh đầu tiên — mở vùng nâng cao ra ngó rồi đóng lại thì không
   * để lại bản nháp rỗng nào trong DB. Cùng cách `ensureHandover` của web.
   */
  const ensureHandover = async () => {
    if (handover) return;
    await saveDraft.mutateAsync({});
  };

  const status = (handover?.status ?? HANDOVER_STATUS.DRAFT) as HandoverStatus;
  const readOnly = handover != null && !isHandoverEditable(status);

  const schema = yup.object({
    /*
     * `null` = CHƯA NHẬP, tuyệt đối không phải 0 km. Server có cờ `odometerMissing` riêng đúng
     * vì phân biệt này — ép về 0 là bịa một số đo và làm hỏng mọi phép so hao mòn.
     */
    /*
     * BỐN câu báo lỗi khác nhau, không phải bốn lần in ra cái nhãn của chính ô. Bản trước dùng
     * `odometer.labelPickup` cho cả bốn, nên gõ "12a" vào ô KM thì lỗi hiện ra là "Chỉ số Odo khi
     * giao (km)" — một cái nhãn, không nói người dùng đã sai chỗ nào. Cùng bốn câu với web.
     */
    odometerKm: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? null : v))
      .typeError(tOdoError('notNumber'))
      .integer(tOdoError('notInteger'))
      .min(0, tOdoError('negative'))
      .max(ODOMETER_MAX_KM, tOdoError('tooLarge', { max: ODOMETER_MAX_KM }))
      .nullable()
      .default(null),
    condition: yup.string().nullable().default(null),
    notes: yup.string().trim().max(NOTE_MAX).default(''),
  });

  const { control, handleSubmit } = useForm<HandoverFormValues>({
    resolver: yupResolver(schema) as never,
    defaultValues: {
      odometerKm: handover?.odometerKm ?? null,
      condition: handover?.condition ?? null,
      notes: handover?.notes ?? '',
    },
  });

  /*
   * Qua `handleSubmit`, KHÔNG `getValues()`.
   *
   * react-hook-form chỉ chạy resolver bên trong `handleSubmit`/`trigger`; đọc thẳng `getValues()`
   * là bỏ qua toàn bộ schema. Hệ quả không hiện ra ở đây mà hiện ở DB: `TextField` ghi chuỗi thô,
   * nên gõ rồi xoá số KM để lại `""`, DTO backend có `@Type(() => Number)` ép nó thành `0`, và
   * một biên bản ĐÃ XÁC NHẬN ghi 0 km làm số KM có thẩm quyền của xe.
   */
  const doConfirm = handleSubmit((values) => {
    setError(null);
    confirm.mutate(
      {
        // Mặt đồng hồ là giờ VN ⇒ đổi về UTC bằng đúng phép của domain, không `toISOString` trần.
        occurredAt: appWallClockToIso(occurredAt),
        odometerKm: values.odometerKm,
        ...(values.condition ? { condition: values.condition as HandoverCondition } : {}),
        notes: values.notes || null,
        ...(handover ? { expectedRowVersion: handover.rowVersion } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(isPickup ? t('confirm.successPickup') : t('confirm.successReturn'));
          setConfirming(false);
          onBack();
        },
        onError: (err) => {
          setConfirming(false);
          const code = getErrorCode(err);
          if (code === API_ERROR_CODE.CONFLICT) {
            setError(t('conflict.body'));
            return;
          }
          /*
           * Odo khi nhận thấp hơn lúc giao: nói ra CẢ HAI con số. Câu lỗi trần của server không
           * mang chúng, mà đó chính là thứ người đứng cạnh xe cần để biết mình đọc nhầm chỗ nào.
           */
          if (code === API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP) {
            const details = (err as { details?: HandoverBelowPickupDetails }).details;
            setError(
              details
                ? t('odometerBelowPickup', {
                    entered: fmt.kmNumber(details.odometerKm),
                    pickup: fmt.kmNumber(details.pickupKm),
                  })
                : errorMessage(err),
            );
            return;
          }
          // Ánh xạ theo MÃ lỗi như web `ConfirmHandoverDialog` (ADR 0012) — không hiện câu tiếng Việt của server.
          setError(errorMessage(err));
        },
      },
    );
  });

  const canConfirm = permissions.has(PERMISSION.HANDOVER_CONFIRM);
  const canManage = permissions.has(PERMISSION.HANDOVER_MANAGE);

  return (
    <>
      <ManagePageHeader
        title={title}
        onBack={onBack}
        subtitle={
          <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
            {[context.bookingCode, context.vehicleName, context.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
          </Text>
        }
      />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          {/* Bỏ thẻ xe + nhãn "Bản nháp" như hộp bàn giao của web (16/11/2026) - xe đã nằm ở dòng phụ thanh đầu. */}

          {readOnly ? (
            <Notice>{t('readOnly')}</Notice>
          ) : (
            <Card>
              <YStack gap={space.md}>
                {/*
                  "Sẵn sàng giao xe" - đầu hộp xác nhận của web (`ConfirmHandoverDialog`, Figma
                  `23845:54382`): icon xe nền xanh, tiêu đề, lời dặn và câu nói trạng thái kế tiếp.
                */}
                {isPickup ? (
                  <YStack gap={space.sm}>
                    <YStack
                      w={PICKUP_ICON}
                      h={PICKUP_ICON}
                      br={radius.pill}
                      ai="center"
                      jc="center"
                      bg={colors.successSurface}
                    >
                      <Ionicons name="car-outline" size={PICKUP_ICON_GLYPH} color={colors.success} />
                    </YStack>
                    <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold}>
                      {t('confirmDialog.readyTitlePickup')}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('confirmDialog.readyBodyPickup')}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t.rich('confirmDialog.nextPickup', {
                        b: (chunks) => (
                          <Text col={colors.text} fow={fontWeight.semibold}>
                            {chunks}
                          </Text>
                        ),
                      })}
                    </Text>
                  </YStack>
                ) : null}

                {/*
                  Odo ĐỨNG ĐẦU và ở ngoài vùng nâng cao — xem docblock màn hình. Nhãn nói rõ đây
                  là chỉ số lúc GIAO hay lúc NHẬN, vì hai con số đó đứng cạnh nhau trong hồ sơ xe.
                */}
                <TextField
                  control={control}
                  name="odometerKm"
                  label={isPickup ? t('odometer.labelPickup') : t('odometer.labelReturn')}
                  placeholder={t('odometer.placeholder')}
                  hint={
                    context.vehicleOdometerKm == null
                      ? t('odometer.hintPlain')
                      : t('odometer.hintWithCurrent', {
                          km: fmt.km(context.vehicleOdometerKm),
                        })
                  }
                  keyboardType="number-pad"
                />

                {/*
                  Lời khuyên chụp ảnh + công tơ mét (ADR 0066) đứng NGOÀI vùng nâng cao, như web:
                  ảnh vẫn tuỳ chọn, nhưng người bàn giao phải thấy lý do nên chụp mà không cần mở gì.
                */}
                <Notice>{t('evidenceAdvisory')}</Notice>

                {/*
                  Vùng nâng cao ĐÓNG SẴN: một chuyến bình thường không cần mở. Mọi thứ trong đây
                  là tuỳ chọn — nút xác nhận không bao giờ chờ nó.
                */}
                <AdvancedToggle
                  open={advanced}
                  label={isPickup ? t('advancedPickup') : t('advancedReturn')}
                  onToggle={() => setAdvanced((v) => !v)}
                />

                {advanced ? (
                  <YStack gap={space.md}>
                    <Card
                      tone="muted"
                      lift="flat"
                      onPress={() => setPickingMoment(true)}
                      accessibilityLabel={
                        isPickup ? t('occurredAt.labelPickup') : t('occurredAt.labelReturn')
                      }
                    >
                      <YStack gap={2}>
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {isPickup ? t('occurredAt.labelPickup') : t('occurredAt.labelReturn')}
                        </Text>
                        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                          {fmt.rentalPoint(occurredAt)}
                        </Text>
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {t('occurredAt.hint', { time: fmt.rentalPoint(occurredAt) })}
                        </Text>
                      </YStack>
                    </Card>

                    <Controller
                      control={control}
                      name="condition"
                      render={({ field }) => (
                        <YStack gap={space.xs}>
                          <Text
                            col={colors.textMuted}
                            fos={fontSize.bodySm}
                            fow={fontWeight.medium}
                          >
                            {t('condition.label')}
                          </Text>
                          {/*
                            Đúng HAI lựa chọn ⇒ radio bày ra hết, không giấu sau menu: người
                            dùng đọc được cả hai vế trước khi quyết định. Từ ba lựa chọn trở lên
                            mới là chỗ của menu.

                            Cũng không dùng `Chip`: viên chip cắt nhãn ở một dòng, mà nhãn ở đây
                            là cả một câu — "Bình thường — xe không có dấu hiệu hư hại mới" —
                            nên phần bị cắt chính là phần giải thích.

                            Loại trừ nhau như `Radio.Group` của web: chọn cái này là bỏ cái kia,
                            và đã chọn thì không xoá trắng lại được — đúng luật web.
                          */}
                          <YStack gap={space.xs}>
                            <RadioOption
                              label={t('condition.normalOption')}
                              checked={field.value === HANDOVER_CONDITION.NORMAL}
                              onPress={() => field.onChange(HANDOVER_CONDITION.NORMAL)}
                            />
                            <RadioOption
                              label={t('condition.attentionOption')}
                              checked={field.value === HANDOVER_CONDITION.ATTENTION}
                              onPress={() => field.onChange(HANDOVER_CONDITION.ATTENTION)}
                            />
                          </YStack>
                        </YStack>
                      )}
                    />

                    <TextField
                      control={control}
                      name="notes"
                      label={t('notes.label')}
                      placeholder={t('notes.placeholder')}
                      multiline scrollable
                      rows={3}
                      maxLength={NOTE_MAX}
                    />

                    {/*
                      Ảnh hiện trạng nằm NGAY ĐÂY chứ không sau một link mở màn khác: đây là
                      khoảnh khắc duy nhất người bàn giao đang đứng cạnh xe.
                    */}
                    {canManage ? (
                      <YStack gap={space.xs}>
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {t('photosOptional')}
                        </Text>
                        <HandoverPhotoGrid
                          bookingId={context.bookingId}
                          type={type}
                          vehicleType={context.vehicleType}
                          handover={handover}
                          ensureHandover={ensureHandover}
                        />
                      </YStack>
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>
            </Card>
          )}

          {isReturn ? <Notice>{t('returnDepositNotice')}</Notice> : null}

          {error ? (
            <YStack bg={colors.dangerSurface} p={space.md} br={radius.md}>
              <Text col={colors.danger} fos={fontSize.bodySm} accessibilityRole="alert">
                {error}
              </Text>
            </YStack>
          ) : null}

          {readOnly ? (
            /*
                Biên bản đã xác nhận: số KM chỉ đổi qua đường điều chỉnh có lý do + quyền riêng.
                `odometerMissing` là ca thường gặp nhất — biên bản chốt xong mới phát hiện quên
                đọc đồng hồ, và không có nút này thì cái lỗ đó nằm lại vĩnh viễn trong hồ sơ xe.
              */
            handover && permissions.has(PERMISSION.VEHICLE_ODOMETER_CORRECT) ? (
              <Button
                label={
                  handover.odometerMissing
                    ? t('odometerFix.openMissing')
                    : t('odometerFix.openCorrect')
                }
                variant="secondary"
                icon="create-outline"
                onPress={() => setFixingOdometer(true)}
              />
            ) : null
          ) : canConfirm ? (
            <Button
              label={isPickup ? t('actions.confirmPickup') : t('actions.confirmReturn')}
              icon="checkmark-circle-outline"
              size="lg"
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </YStack>
      </Screen>

      {pickingMoment ? (
        <MomentPickerSheet
          open
          onClose={() => setPickingMoment(false)}
          value={occurredAt}
          onChange={setOccurredAt}
          notAfter={nowInAppTz()}
          title={isPickup ? t('occurredAt.labelPickup') : t('occurredAt.labelReturn')}
        />
      ) : null}

      {fixingOdometer && handover ? (
        <ResolveOdometerSheet
          bookingId={context.bookingId}
          type={type}
          context={context}
          handover={handover}
          onClose={() => setFixingOdometer(false)}
        />
      ) : null}

      <BottomSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('confirm.title')}
        footer={
          <XStack gap={space.sm}>
            {/*
            Hai hành động NGẮN nằm một hàng: lối thoát bên trái, hành động chính bên phải —
            xếp dọc thì hàng dưới đọc ra là một bước tiếp theo chứ không phải một lựa chọn thay
            thế. "Quay lại" co vừa chữ, "Xác nhận" lấy phần còn lại — xem luật ở `Button.tsx`.
          */}
            <YStack flexShrink={0}>
              <Button
                label={t('confirm.keep')}
                variant="ghost"
                onPress={() => setConfirming(false)}
              />
            </YStack>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button
                label={t('confirm.ok')}
                icon="checkmark-outline"
                loading={confirm.isPending}
                onPress={() => void doConfirm()}
              />
            </YStack>
          </XStack>
        }
      >
        <Text col={colors.text} fos={fontSize.bodySm}>
          {isPickup ? t('confirm.pickupLead') : t('confirm.returnLead')}
        </Text>
      </BottomSheet>
    </>
  );
}

function AdvancedToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <XStack
      ai="center"
      gap={space.xs}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
    >
      <Ionicons
        name={open ? 'chevron-down' : 'chevron-forward'}
        size={iconSize.sm}
        color={colors.primaryActive}
      />
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {label}
      </Text>
    </XStack>
  );
}

function Notice({ children }: { children: string }) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" gap={space.sm} bg={colors.infoSurface} p={space.md} br={radius.md}>
      <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.info} />
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}
