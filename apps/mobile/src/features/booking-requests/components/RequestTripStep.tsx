import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { components } from '@xeprime/types';
import {
  DELIVERY_DISTANCE_STATUS,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  type PublicListingDetail,
} from '@xeprime/types';
import {
  dayjs,
  isZeroMoney,
  type BusyDayIndex,
  type Dayjs,
  type RentalMode,
} from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldMessage } from '@/components/ui/Field';
import { FieldBox } from '@/components/ui/FieldBox';
import { RangeFieldBox } from '@/components/ui/RangeFieldBox';
import { FormSection } from '@/components/ui/FormSection';
import { TextField } from '@/components/ui/TextField';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { ServiceSelector } from '@/features/marketplace/components/ServiceSelector';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

import { useDeliveryDistance } from '../hooks/use-booking-request-flow';
import type { RequestForm } from '../RequestBookingScreen';

/** Một gói dài hạn kèm giá và mốc ưu đãi — server tính, shape từ OpenAPI (ADR 0007). */
type LongTermPackageOption = components['schemas']['LongTermPackageOptionDto'];

/**
 * Bước "Chuyến đi" — gộp thời gian, lộ trình, nơi nhận và liên hệ vào MỘT bước.
 *
 * Web cũng gộp: tách thành hai bước làm khách phải bấm "Tiếp tục" cho một màn chỉ có hai ô.
 * Điều kiện hiện/ẩn thì y hệt web và đến từ chính DỮ LIỆU XE:
 *   - giao tận nơi chỉ hỏi khi `deliveryEnabled` của xe đang bật;
 *   - lộ trình + địa chỉ đón chỉ hỏi với dịch vụ có tài xế;
 *   - gói tháng + nguyện vọng nhận xe chỉ hỏi với thuê dài hạn (ADR 0011).
 */
export function RequestTripStep({
  form,
  listing,
  services,
  busyDays,
  rentalMode,
  onRentalModeChange,
  contactKnown,
}: {
  form: RequestForm;
  listing: PublicListingDetail;
  services: readonly string[];
  busyDays: BusyDayIndex;
  rentalMode: RentalMode;
  onRentalModeChange: (mode: RentalMode) => void;
  /** Tài khoản đã có SĐT đã xác thực — không hỏi lại thứ hệ thống đã biết. */
  contactKnown: boolean;
}) {
  const t = useTranslations('BookingRequests.flow');
  const domainLabel = useDomainLabel();

  // `useWatch` chứ không phải `form.watch()` — xem ghi chú ở `RequestBookingScreen`.
  const serviceType = useWatch({ control: form.control, name: 'serviceType' });
  const routeType = useWatch({ control: form.control, name: 'routeType' });
  const deliveryRequested = useWatch({ control: form.control, name: 'deliveryRequested' });

  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  const interCity =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  return (
    <YStack gap={space.lg}>
      {/* Viên dịch vụ đã tự mang màu nhận diện — bọc thêm mặt phẳng là dựng khung cho thứ không cần khung. */}
      {services.length > 1 ? (
        <FormSection title={t('service.label')} icon="car-sport-outline" boxed={false}>
          <Controller
            control={form.control}
            name="serviceType"
            render={({ field }) => (
              <ServiceSelector
                services={services}
                active={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  // Đổi dịch vụ là đổi MÔ HÌNH thời gian — giữ lại giá trị cũ sẽ gửi lên một
                  // khoảng ngày cho gói tháng, hoặc ngược lại.
                  form.setValue('pickupAt', '');
                  form.setValue('returnAt', '');
                  form.setValue('longTermPackageMonths', null);
                  form.setValue('pickupPreference', null);
                  form.setValue('requestedPickupDate', '');
                  form.setValue('routeType', null);
                }}
              />
            )}
          />
        </FormSection>
      ) : null}

      {longTerm ? (
        <LongTermFields form={form} packages={listing.longTermPackages ?? []} />
      ) : (
        <TimeField
          form={form}
          busyDays={busyDays}
          rentalMode={rentalMode}
          onRentalModeChange={onRentalModeChange}
        />
      )}

      {withDriver ? (
        <FormSection title={t('service.routeLabel')} icon="navigate-outline">
          <Controller
            control={form.control}
            name="routeType"
            render={({ field, fieldState }) => (
              <YStack gap={space.xs}>
                <XStack gap={space.xs} flexWrap="wrap">
                  {ROUTE_TYPE_VALUES.map((value) => (
                    <RouteChip
                      key={value}
                      value={value}
                      selected={field.value === value}
                      onPress={() => field.onChange(value)}
                    />
                  ))}
                </XStack>
                <FieldMessage error={fieldState.error?.message} />
              </YStack>
            )}
          />
          <TextField
            control={form.control}
            name="pickupAddress"
            label={t('driver.pickupAddressLabel')}
            placeholder={t('driver.pickupAddressPlaceholder')}
            required
          />
          {interCity ? (
            <TextField
              control={form.control}
              name="destination"
              label={t('driver.destinationLabel')}
              placeholder={t('driver.destinationPlaceholder')}
              required
            />
          ) : null}
          {/*
            MỘT dòng duy nhất: `driver.note` đã gói cả tên lộ trình lẫn mô tả vào trong nó, và nó
            BẮT BUỘC có `{route}`/`{description}` — gọi thiếu thì `use-intl` in thẳng khoá lên màn.
          */}
          {routeType ? (
            <XStack
              ai="flex-start"
              gap={space.xs}
              p={space.sm}
              br={radius.md}
              bg={colors.infoSurface}
            >
              <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.info} />
              <Text f={1} col={colors.textMuted} fos={fontSize.label}>
                {t('driver.note', {
                  route: domainLabel('routeType', routeType),
                  description: routeDescription(t, routeType),
                })}
              </Text>
            </XStack>
          ) : null}
        </FormSection>
      ) : null}

      {/*
        Giao tận nơi chỉ hỏi khi chính sách giao nhận của xe ĐANG BẬT — server từ chối
        `deliveryRequested` với xe không bật, nên bày ra ở đây là hứa một thứ sẽ bị từ chối.
      */}
      {!withDriver && listing.deliveryEnabled ? (
        /*
          `boxed={false}`: hai thẻ lựa chọn bên dưới ĐÃ là mặt phẳng có viền, lồng chúng vào một
          thẻ nữa là viền trong viền. Web chia đúng như vậy — nhóm lựa chọn để trần
          (`.pickupGroup` là `fieldset` không viền), phần khai địa chỉ mới có khối riêng
          (`.deliveryBlock`).
        */
        <FormSection title={t('pickup.groupLabel')} icon="location-outline" boxed={false}>
          {/* THẺ chứ không phải chip: mỗi lựa chọn cần một dòng giải thích riêng. */}
          <Controller
            control={form.control}
            name="deliveryRequested"
            render={({ field }) => (
              <YStack gap={space.xs}>
                <PickupOption
                  icon="business-outline"
                  title={t('pickup.self')}
                  subtitle={pickupPointLabel(listing) ?? t('pickup.selfHint')}
                  selected={!field.value}
                  onPress={() => field.onChange(false)}
                />
                <PickupOption
                  icon="location-outline"
                  title={t('pickup.delivery')}
                  subtitle={t('pickup.deliveryHint')}
                  selected={field.value}
                  onPress={() => field.onChange(true)}
                />
              </YStack>
            )}
          />
          {deliveryRequested ? (
            <Card>
              <YStack gap={space.sm}>
                <TextField
                  control={form.control}
                  name="deliveryAddress"
                  label={t('pickup.addressLabel')}
                  placeholder={t('pickup.addressPlaceholder')}
                  required
                />
                <DeliveryEstimate form={form} vehicleId={listing.id} />
              </YStack>
            </Card>
          ) : null}
        </FormSection>
      ) : null}

      {/*
        Xe TẮT giao nhận ⇒ chỉ còn một cách nhận xe. Vẫn hiện ra, nhưng là THÔNG TIN chứ không
        phải câu hỏi — ẩn hẳn thì khách không biết phải tới đâu lấy xe cho tới bước Xác nhận.
      */}
      {!withDriver && !listing.deliveryEnabled ? (
        <FormSection title={t('pickup.groupLabel')} icon="location-outline" boxed={false}>
          <XStack
            ai="center"
            gap={space.sm}
            px={space.md}
            py={space.sm}
            br={radius.md}
            bw={1}
            bg={colors.surfaceMuted}
            bc={colors.border}
            minHeight={sizing.touchTarget}
          >
            <YStack
              w={space.xl}
              h={space.xl}
              br={radius.pill}
              bg={colors.primaryLight}
              ai="center"
              jc="center"
            >
              <Ionicons name="business-outline" size={iconSize.md} color={colors.primaryActive} />
            </YStack>
            <YStack f={1} gap={1}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('pickup.self')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {pickupPointLabel(listing) ?? t('pickup.selfOnly')}
              </Text>
            </YStack>
          </XStack>
        </FormSection>
      ) : null}

      {/*
        Liên hệ chỉ hỏi khi hệ thống CHƯA biết. Người đã xác thực SĐT không thấy ô nào ở đây —
        thông tin của họ hiện thành MỘT DÒNG ở bước Xác nhận, kèm nút "Đổi".
      */}
      {contactKnown ? null : (
        <FormSection title={t('contact.heading')} icon="person-outline">
          <TextField
            control={form.control}
            name="customerName"
            label={t('contact.nameLabel')}
            placeholder={t('contact.namePlaceholder')}
            required
          />
          <TextField
            control={form.control}
            name="customerPhone"
            label={t('contact.phoneLabel')}
            placeholder={t('contact.phonePlaceholder')}
            keyboardType="phone-pad"
            required
          />
        </FormSection>
      )}
    </YStack>
  );
}

/**
 * Một hình thức nhận xe.
 *
 * Phụ đề của "Nhận tại điểm hẹn" là ĐỊA CHỈ THẬT khi xe có điểm nhận — khách cần biết phải đi
 * tới đâu trước khi chọn, không phải sau khi gửi yêu cầu.
 */
function PickupOption({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {/* Đệm dọc `space.sm` chứ không `space.md`: hai dòng chữ mà đệm 16 thì khối cao gần bằng cả phần liên hệ. */}
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        br={radius.md}
        bw={1}
        bg={selected ? colors.primaryLight : colors.surface}
        bc={selected ? colors.primary : colors.border}
        minHeight={sizing.touchTarget}
      >
        <YStack
          w={space.xl}
          h={space.xl}
          br={radius.pill}
          bg={selected ? colors.primaryLight : colors.surfaceMuted}
          ai="center"
          jc="center"
        >
          <Ionicons
            name={icon}
            size={iconSize.md}
            color={selected ? colors.primaryActive : colors.textMuted}
          />
        </YStack>
        <YStack f={1} gap={1}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
            {subtitle}
          </Text>
        </YStack>
        {selected ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}

/** Địa chỉ điểm nhận xe, gộp tên chi nhánh + địa chỉ + tỉnh. `null` = xe chưa khai điểm nhận. */
function pickupPointLabel(listing: PublicListingDetail): string | null {
  const point = listing.pickupPoint;
  if (!point) return null;
  return [point.address, point.provinceName].filter(Boolean).join(', ');
}

/** Chờ khách gõ xong địa chỉ rồi mới tra — mỗi phím một lượt gọi bản đồ là đốt hạn mức. */
const ADDRESS_DEBOUNCE_MS = 600;

/**
 * Ước lượng khoảng cách và phí giao xe.
 *
 * Đọc theo **MÃ trạng thái**, không bắt lỗi: "không tra được" là một câu trả lời hợp lệ của
 * endpoint (ADR 0018), và mỗi mã cần một câu khác nhau — địa chỉ không định vị được là việc
 * NGƯỜI DÙNG sửa được, còn chưa cấu hình bản đồ thì họ không làm gì được.
 *
 * Con số là **ƯỚC LƯỢNG một chiều theo đường bộ**; chủ xe vẫn chốt phí trên đơn (ADR 0014). Vì
 * thế nó nằm ở dòng ghi chú, không cộng vào tổng tiền nào.
 */
function DeliveryEstimate({ form, vehicleId }: { form: RequestForm; vehicleId: string }) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();

  const address = useWatch({ control: form.control, name: 'deliveryAddress' });
  const debounced = useDebouncedValue(address ?? '', ADDRESS_DEBOUNCE_MS);
  const query = useDeliveryDistance(vehicleId, debounced.trim());

  if (query.isFetching) {
    return (
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('pickup.estimating')}
      </Text>
    );
  }

  const delivery = query.data;
  if (!delivery) {
    return (
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('pickup.feeNote')}
      </Text>
    );
  }

  return (
    <YStack gap={space.xs}>
      {delivery.status === DELIVERY_DISTANCE_STATUS.AUTO ? (
        <>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('pickup.feeLabel')}
            </Text>
            <Text
              col={isZeroMoney(delivery.fee ?? '0') ? colors.success : colors.price}
              fos={fontSize.body}
              fow={fontWeight.semibold}
            >
              {isZeroMoney(delivery.fee ?? '0')
                ? t('pickup.feeFree')
                : fmt.money(delivery.fee ?? '0')}
            </Text>
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('pickup.estimatedDistance', { distance: fmt.distanceKm(delivery.distanceKm) })}
          </Text>
        </>
      ) : delivery.status === DELIVERY_DISTANCE_STATUS.MANUAL ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {delivery.distanceKm != null
            ? t('pickup.manualWithDistance', { distance: fmt.distanceKm(delivery.distanceKm) })
            : t('pickup.feeNote')}
        </Text>
      ) : delivery.status === DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND ? (
        <Text col={colors.warning} fos={fontSize.label}>
          {t('pickup.addressNotFound')}
        </Text>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('pickup.feeNote')}
        </Text>
      )}

      {/* Địa chỉ bản đồ hiểu ra — hiện lại để khách xác nhận đúng chỗ trước khi gửi. */}
      {delivery.formattedAddress ? (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('pickup.resolvedAddress', { address: delivery.formattedAddress })}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * Ô chọn thời gian — mở chính `RentalRangeSheet` dùng chung, lần này CÓ lịch bận của xe.
 *
 * Giá trị đi trong form là chuỗi ISO (nó vào thẳng body API); tấm trượt làm việc bằng `Dayjs`,
 * nên phép đổi nằm gọn ở đây thay vì rải hai định dạng khắp form.
 */
function TimeField({
  form,
  busyDays,
  rentalMode,
  onRentalModeChange,
}: {
  form: RequestForm;
  busyDays: BusyDayIndex;
  rentalMode: RentalMode;
  onRentalModeChange: (mode: RentalMode) => void;
}) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const [open, setOpen] = useState(false);

  const pickupAt = useWatch({ control: form.control, name: 'pickupAt' });
  const returnAt = useWatch({ control: form.control, name: 'returnAt' });
  const error = form.formState.errors.pickupAt ?? form.formState.errors.returnAt;

  const [draft, setDraft] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>({
    pickupAt: pickupAt ? dayjs(pickupAt) : null,
    returnAt: returnAt ? dayjs(returnAt) : null,
  });

  function apply() {
    if (!draft.pickupAt || !draft.returnAt) return;
    form.setValue('pickupAt', draft.pickupAt.toISOString(), { shouldValidate: true });
    form.setValue('returnAt', draft.returnAt.toISOString(), { shouldValidate: true });
    setOpen(false);
  }

  return (
    <FormSection title={t('time.label')} icon="calendar-outline">
      <RangeFieldBox
        label={t('time.fieldLabel')}
        startValue={pickupAt ? fmt.rentalPoint(dayjs(pickupAt)) : ''}
        endValue={returnAt ? fmt.rentalPoint(dayjs(returnAt)) : ''}
        {...(pickupAt && returnAt
          ? { durationText: fmt.rentalDuration(dayjs(pickupAt), dayjs(returnAt)) }
          : {})}
        hint={t('time.changeHint')}
        required
        {...(error?.message ? { error: error.message } : {})}
        onPress={() => setOpen(true)}
      />

      <RentalRangeSheet
        open={open}
        value={draft}
        mode={rentalMode}
        busyDays={busyDays}
        onChange={setDraft}
        onModeChange={onRentalModeChange}
        onApply={apply}
        onCancel={() => setOpen(false)}
      />
    </FormSection>
  );
}

/**
 * Thuê dài hạn: chọn GÓI + nêu nguyện vọng ngày nhận.
 *
 * KHÔNG có ô chọn ngày trả: ngày trả = ngày nhận + N THÁNG LỊCH và do SERVER tính (ADR 0011).
 * Client không cộng, và cũng không nhân `số tháng × 30`.
 */
function LongTermFields({
  form,
  packages,
}: {
  form: RequestForm;
  /** Sáu gói kèm giá và mốc ưu đãi — SERVER tính, client chỉ bày ra. */
  packages: readonly LongTermPackageOption[];
}) {
  const t = useTranslations('BookingRequests.flow');
  const preference = useWatch({ control: form.control, name: 'pickupPreference' });

  return (
    <>
      {/*
        `boxed={false}` bắt buộc, không phải lựa chọn thẩm mỹ: huy hiệu `-X%` của mỗi gói nằm
        TRÀN ra ngoài viên chip (`top: -6`), mà `Card` cắt phần tràn (`overflow: hidden`) — bọc
        thêm thẻ là mất luôn mốc ưu đãi.
      */}
      <FormSection title={t('longTerm.chooseTitle')} icon="pricetags-outline" boxed={false}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('longTerm.chooseLabel')}
        </Text>
        <Controller
          control={form.control}
          name="longTermPackageMonths"
          render={({ field, fieldState }) => (
            <YStack gap={space.xs}>
              {/* Giá gói do SERVER tính — client KHÔNG nhân giá tháng với số tháng (ADR 0011). */}
              {packages.length === 0 ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('longTerm.noPrice')}
                </Text>
              ) : (
                <XStack gap={space.xs} flexWrap="wrap">
                  {packages.map((pkg) => (
                    <PackageChip
                      key={pkg.packageMonths}
                      months={pkg.packageMonths}
                      discountPercent={pkg.durationDiscountPercent ?? null}
                      selected={field.value === pkg.packageMonths}
                      onPress={() => field.onChange(pkg.packageMonths)}
                    />
                  ))}
                </XStack>
              )}
              <FieldMessage error={fieldState.error?.message} />
            </YStack>
          )}
        />
      </FormSection>

      <FormSection title={t('longTerm.wishTitle')} icon="calendar-outline">
        <Controller
          control={form.control}
          name="pickupPreference"
          render={({ field, fieldState }) => (
            <YStack gap={space.xs}>
              <XStack gap={space.xs}>
                {PICKUP_PREFERENCE_VALUES.map((value) => (
                  <PreferenceChip
                    key={value}
                    value={value}
                    selected={field.value === value}
                    onPress={() => field.onChange(value)}
                  />
                ))}
              </XStack>
              {field.value ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {pickupWishHint(t, field.value)}
                </Text>
              ) : null}
              <FieldMessage error={fieldState.error?.message} />
            </YStack>
          )}
        />

        {/* Lịch thật, không phải ô gõ `YYYY-MM-DD`: gõ định dạng máy trên điện thoại là chắc chắn nhận ngày sai. */}
        {preference === PICKUP_PREFERENCE.SPECIFIC_DATE ? (
          <Controller
            control={form.control}
            name="requestedPickupDate"
            render={({ field, fieldState }) => (
              <PickupDateField
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        ) : null}
      </FormSection>

      <TrustPoints />
    </>
  );
}

/**
 * Ba điểm trấn an của luồng thuê dài hạn — cùng ba khoá `longTerm.trust.*` với web.
 *
 * Xếp DỌC chứ không lưới hai cột: ở bề ngang điện thoại, hai cột làm mỗi ô còn ~150px và cả sáu
 * dòng chữ đều gãy giữa từ.
 */
function TrustPoints() {
  const t = useTranslations('BookingRequests.flow.longTerm.trust');

  const points = [
    { key: 'process', icon: 'shield-checkmark-outline' },
    { key: 'payment', icon: 'card-outline' },
    { key: 'support', icon: 'headset-outline' },
  ] as const;

  return (
    <Card tone="accent" lift="flat">
      <YStack gap={space.md}>
        {points.map((point) => (
          <XStack key={point.key} ai="flex-start" gap={space.sm}>
            <YStack
              w={space.xl}
              h={space.xl}
              br={radius.pill}
              bg={colors.surface}
              ai="center"
              jc="center"
            >
              <Ionicons name={point.icon} size={iconSize.md} color={colors.primaryActive} />
            </YStack>
            <YStack f={1} gap={2}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {trustText(t, point.key, 'Title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {trustText(t, point.key, 'Desc')}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </Card>
  );
}

/**
 * Khoá i18n ghép động LỌT qua typecheck của `use-intl` — nó chỉ kiểm được chuỗi hằng. Liệt kê
 * tường minh để trình biên dịch chỉ ra ngay chỗ thiếu khi thêm điểm thứ tư.
 */
function trustText(
  t: ReturnType<typeof useTranslations<'BookingRequests.flow.longTerm.trust'>>,
  key: 'process' | 'payment' | 'support',
  part: 'Title' | 'Desc',
): string {
  if (key === 'process') return part === 'Title' ? t('processTitle') : t('processDesc');
  if (key === 'payment') return part === 'Title' ? t('paymentTitle') : t('paymentDesc');
  return part === 'Title' ? t('supportTitle') : t('supportDesc');
}

/**
 * Khoá i18n ghép động LỌT qua typecheck của `use-intl` — nó chỉ kiểm được chuỗi hằng, và
 * `i18n:check` chỉ so parity vi↔en. Liệt kê tường minh để `tsc` chỉ ra chỗ thiếu.
 */
function pickupWishHint(
  t: ReturnType<typeof useTranslations<'BookingRequests.flow'>>,
  preference: string,
): string {
  return preference === PICKUP_PREFERENCE.SPECIFIC_DATE
    ? t('longTerm.hint.specific_date')
    : t('longTerm.hint.within_7_days');
}

function routeDescription(
  t: ReturnType<typeof useTranslations<'BookingRequests.flow'>>,
  routeType: string,
): string {
  switch (routeType) {
    case ROUTE_TYPE.INTER_CITY:
      return t('route.description.inter_city');
    case ROUTE_TYPE.INTER_CITY_ONE_WAY:
      return t('route.description.inter_city_one_way');
    default:
      return t('route.description.in_city');
  }
}

/**
 * Một gói thuê dài hạn.
 *
 * Badge `-X%` là **ưu đãi cam kết thời hạn** của chính gói đó (ADR 0011), không phải khuyến mãi
 * của xe — và tuyệt đối không phải `discountPercent` của TỰ LÁI, thứ ADR cấm hiện khi khách
 * đang chọn dài hạn. `durationDiscountPercent === null` nghĩa là không mốc nào áp cho gói này.
 */
function PackageChip({
  months,
  discountPercent,
  selected,
  onPress,
}: {
  months: number;
  discountPercent: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const fmt = useAppFormat();
  const label = fmt.packageLabel(months) ?? String(months);

  return (
    <YStack>
      <Chip label={label} selected={selected} size="sm" onPress={onPress} />
      {discountPercent ? (
        <XStack pos="absolute" top={-6} right={-4} bg={colors.discount} br={radius.sm} px={4}>
          <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
            -{discountPercent}%
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );
}

/** Ô chọn ngày nhận xe của thuê dài hạn — bấm mở lịch, không gõ tay. */
function PickupDateField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const [open, setOpen] = useState(false);

  return (
    <YStack gap={space.xs}>
      <FieldBox
        label={t('longTerm.dateLabel')}
        icon="calendar-outline"
        value={value ? fmt.dateKey(value) : ''}
        placeholder={t('longTerm.datePlaceholder')}
        required
        {...(error ? { error } : {})}
        onPress={() => setOpen(true)}
      />

      <DatePickerSheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onChange={onChange}
        title={t('longTerm.dateLabel')}
      />
    </YStack>
  );
}

function RouteChip({
  value,
  selected,
  onPress,
}: {
  value: string;
  selected: boolean;
  onPress: () => void;
}) {
  const domainLabel = useDomainLabel();
  return (
    <Chip label={domainLabel('routeType', value)} selected={selected} size="sm" onPress={onPress} />
  );
}

function PreferenceChip({
  value,
  selected,
  onPress,
}: {
  value: string;
  selected: boolean;
  onPress: () => void;
}) {
  const domainLabel = useDomainLabel();
  return (
    <Chip
      label={domainLabel('pickupPreference', value)}
      selected={selected}
      size="sm"
      grow
      onPress={onPress}
    />
  );
}
