import { useCallback, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { appWallClockToIso, defaultRentalRange, toAppTz, type RentalMode } from '@xeprime/domain';
import {
  RENTAL_MODE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { STALE_TIME } from '@xeprime/api-client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { RangeFieldBox } from '@/components/ui/RangeFieldBox';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BranchFilterField } from '@/features/branches/components/BranchFilterField';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import {
  RentalRangeSheet,
  type RentalRangeDraft,
} from '@/features/marketplace/components/RentalRangeSheet';
import { useBookingPickerVehicles } from '@/features/vehicles/hooks/use-booking-picker-vehicles';
import type { VehicleBookingPickerItem } from '@/api/vehicles/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { bookingsApi } from '../api';
import { StaffVehicleCard } from './StaffVehicleCard';

const SEARCH_DEBOUNCE_MS = 350;

/** Khung giờ đã chọn — ISO UTC, đúng dạng luồng đặt hộ nhận làm giá trị mở đầu. */
export interface PickedRange {
  pickupAt: string;
  returnAt: string;
}

function initialRangeOf(initial?: PickedRange | null): RentalRangeDraft {
  if (initial) return { pickupAt: toAppTz(initial.pickupAt), returnAt: toAppTz(initial.returnAt) };
  return defaultRentalRange();
}

/** Dịch vụ để TẠM TÍNH ở chân màn: tự lái nếu xe có, không thì có tài xế (nội thành). */
function estimateServiceOf(vehicle: VehicleBookingPickerItem) {
  if (vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)) {
    return { serviceType: SERVICE_TYPE.SELF_DRIVE };
  }
  if (vehicle.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER)) {
    return { serviceType: SERVICE_TYPE.WITH_DRIVER, routeType: ROUTE_TYPE.IN_CITY };
  }
  // Chỉ thuê dài hạn: giá theo GÓI, chọn ở bước sau — chưa có gì để tạm tính theo khung giờ.
  return null;
}

/**
 * Bước CHỌN XE của luồng "Tạo đơn thuê xe cho khách" — native port of web `StaffVehiclePicker`
 * (Figma Partner `24565:59738`), chỉ có ở lối vào chưa biết xe (danh sách đơn, hồ sơ khách).
 *
 * Bộ lọc: Chi nhánh · Loại (ô tô/xe máy) · Tìm kiếm · Thời gian nhận/trả (BẮT BUỘC). Server đẩy xe
 * TRỐNG lên đầu, xe đã có lịch hiện mờ và không chọn được — `busy` chỉ là gợi ý, lượt tạo đơn vẫn đi
 * qua constraint chống trùng lịch (ADR 0006). Khung giờ chọn ở đây thành giá trị mở đầu của bước
 * Chuyến đi.
 *
 * Chọn một thẻ rồi bấm "Tiếp tục" để chân màn kịp hiện TẠM TÍNH (báo giá nội bộ `/calendar/quote`).
 * Danh sách tải dần theo cuộn. Chi nhánh là GỢI Ý (ADR 0052).
 */
export function StaffVehiclePicker({
  defaultBranchId,
  initialRange,
  onCancel,
  onContinue,
}: {
  defaultBranchId?: string | undefined;
  initialRange?: PickedRange | null;
  onCancel: () => void;
  onContinue: (vehicle: VehicleBookingPickerItem, range: PickedRange) => void;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const t = useTranslations('BookingRequests.vehiclePicker');
  const tFlow = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();

  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);
  const [branchId, setBranchId] = useState<string | undefined>(defaultBranchId);
  const branch = useBranchFilter({ value: branchId, onChange: setBranchId, local: true });
  const [range, setRange] = useState<RentalRangeDraft>(() => initialRangeOf(initialRange));
  const [rangeDraft, setRangeDraft] = useState<RentalRangeDraft>(range);
  const [scheduling, setScheduling] = useState(false);
  const [rentalMode, setRentalMode] = useState<RentalMode>(RENTAL_MODE.DAILY);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pickedRange: PickedRange | null =
    range.pickupAt && range.returnAt && range.returnAt.isAfter(range.pickupAt)
      ? {
          pickupAt: appWallClockToIso(range.pickupAt),
          returnAt: appWallClockToIso(range.returnAt),
        }
      : null;

  const picker = useBookingPickerVehicles({
    q,
    branchId,
    vehicleType,
    pickupAt: pickedRange?.pickupAt ?? null,
    returnAt: pickedRange?.returnAt ?? null,
  });

  /*
   * Xe đang chọn phải còn CHỌN ĐƯỢC theo bộ lọc hiện tại: đổi khung giờ làm nó bận, hay đổi loại /
   * chi nhánh làm nó rời danh sách ⇒ bỏ chọn, để "Tiếp tục" không mang một chiếc xe đã khuất.
   */
  const current = selectedId ? (picker.vehicles.find((v) => v.id === selectedId) ?? null) : null;
  const selectable = current && !current.busy ? current : null;

  const estimateService = selectable ? estimateServiceOf(selectable) : null;
  const quoteParams =
    selectable && estimateService && pickedRange
      ? { vehicleId: selectable.id, ...pickedRange, ...estimateService }
      : null;
  const quoteQ = useQuery({
    queryKey: queryKeys.calendar.quote(quoteParams ?? {}),
    queryFn: () => bookingsApi.quote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: STALE_TIME.STANDARD,
    retry: false,
  });

  const select = useCallback((vehicle: VehicleBookingPickerItem) => setSelectedId(vehicle.id), []);

  function renderEstimate() {
    const hint = (text: string) => (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {text}
      </Text>
    );
    if (!selectable) return hint(t('pickHint'));
    if (!quoteParams) return null;
    if (quoteQ.isLoading) return hint(t('estimateLoading'));
    if (quoteQ.isError || !quoteQ.data) return hint(t('estimateUnavailable'));
    const value = fmt.money(quoteQ.data.totalAmount);
    const amount = (chunks: ReactNode) => (
      <Text col={colors.price} fos={fontSize.bodyLg} fow={fontWeight.bold}>
        {chunks}
      </Text>
    );
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {quoteQ.data.days
          ? t.rich('estimateDays', { days: quoteQ.data.days, value, amount })
          : t.rich('estimate', { value, amount })}
      </Text>
    );
  }

  const footer = (
    <YStack gap={space.sm}>
      {renderEstimate()}
      <XStack gap={space.sm}>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
          <Button label={tCommon('back')} variant="secondary" onPress={onCancel} />
        </YStack>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
          <Button
            label={tCommon('next')}
            disabled={!selectable || !pickedRange}
            onPress={() => {
              if (selectable && pickedRange) onContinue(selectable, pickedRange);
            }}
          />
        </YStack>
      </XStack>
    </YStack>
  );

  const showList = pickedRange != null && !picker.isInitialLoading && !picker.initialError;

  return (
    <>
      <AppHeader title={t('title')} subtitle={t('subtitle')} onBack={onCancel} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={footer}
        hideFooterWhileTyping
        refreshing={picker.isRefetching}
        onRefresh={picker.refetch}
        onNearEnd={picker.fetchNextPage}
      >
        <YStack gap={space.md}>
          <BranchFilterField filter={branch} value={branchId} block />
          {branchId && branch.selectedLabel ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('branchHint', { branch: branch.selectedLabel })}
            </Text>
          ) : null}

          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('typeLabel')}
            </Text>
            <XStack gap={space.xs} accessibilityRole="radiogroup" accessibilityLabel={t('typeLabel')}>
              {VEHICLE_TYPE_VALUES.map((type) => (
                <Chip
                  key={type}
                  size="sm"
                  label={dl('vehicleType', type)}
                  selected={vehicleType === type}
                  onPress={() => setVehicleType(type)}
                />
              ))}
            </XStack>
          </YStack>

          <SearchInput
            value={search}
            onChange={setSearch}
            label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            variant="field"
          />

          <RangeFieldBox
            label={t('timeLabel')}
            startValue={range.pickupAt ? fmt.rentalPoint(range.pickupAt) : ''}
            endValue={range.returnAt ? fmt.rentalPoint(range.returnAt) : ''}
            {...(range.pickupAt && range.returnAt && pickedRange
              ? { durationText: fmt.rentalDuration(range.pickupAt, range.returnAt) }
              : {})}
            hint={pickedRange ? tFlow('time.changeHint') : t('timePlaceholder')}
            required
            onPress={() => {
              setRangeDraft(range);
              setScheduling(true);
            }}
          />

          {!pickedRange ? <Callout tone="info" title={t('timeRequired')} /> : null}

          {picker.isInitialLoading ? (
            <YStack gap={space.md}>
              <Skeleton height={260} />
              <Skeleton height={260} />
            </YStack>
          ) : null}

          {picker.initialError ? (
            <Callout tone="danger" title={t('loadFailed')}>
              <YStack gap={space.xs}>
                <Text col={colors.danger} fos={fontSize.bodySm}>
                  {errorMessage(picker.initialError)}
                </Text>
                <XStack>
                  <Button
                    label={t('retry')}
                    variant="secondary"
                    size="sm"
                    block={false}
                    onPress={picker.refetch}
                  />
                </XStack>
              </YStack>
            </Callout>
          ) : null}

          {showList && picker.vehicles.length === 0 ? (
            /*
             * Câu nói đúng lý do: "chưa có xe máy nào" khi thật ra chỉ là chi nhánh đang lọc chưa có
             * xe sẽ khiến người dùng đi tìm một lỗi không tồn tại.
             */
            <ScreenMessage
              icon="car-outline"
              title={
                q
                  ? t('emptySearch')
                  : branchId
                    ? t('emptyBranch')
                    : t('emptyType', { type: vehicleType })
              }
            />
          ) : null}

          {showList && picker.vehicles.length > 0 ? (
            <YStack gap={space.md} accessibilityLabel={t('gridLabel')}>
              {picker.vehicles.map((vehicle) => (
                <StaffVehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={selectable?.id === vehicle.id}
                  onSelect={select}
                />
              ))}
              {/* Đáy danh sách: trạng thái của TRANG KẾ (không đụng tới xe đã hiện). */}
              {picker.isFetchingNextPage ? (
                <Skeleton height={120} />
              ) : picker.appendError ? (
                <XStack ai="center" jc="center" gap={space.sm}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('appendFailed')}
                  </Text>
                  <Button
                    label={t('retry')}
                    variant="ghost"
                    size="sm"
                    block={false}
                    onPress={picker.retryNextPage}
                  />
                </XStack>
              ) : !picker.hasNextPage ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('allShown', { count: picker.total })}
                </Text>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      </Screen>

      <RentalRangeSheet
        open={scheduling}
        value={rangeDraft}
        mode={rentalMode}
        onChange={setRangeDraft}
        onModeChange={setRentalMode}
        onApply={() => {
          setRange(rangeDraft);
          setScheduling(false);
        }}
        onCancel={() => setScheduling(false)}
      />
    </>
  );
}
