import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { serviceTypesFor, serviceUsesRentalRange } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { SERVICE_ICON, SERVICE_LABEL_KEY, VEHICLE_ICON } from '../search-items';
import { useSearchExperience } from '../search-context';
import { LocationPicker } from './LocationPicker';
import { RentalRangeField } from './RentalRangeField';

/**
 * Thẻ tìm kiếm của trang chủ. Ba tầng quyết định, đúng thứ tự của web:
 * loại xe → dịch vụ → tiêu chí của riêng dịch vụ đó.
 *
 * Form theo TỪNG dịch vụ chứ không phải một form gộp rồi ẩn bớt:
 *   - **Tự lái / Có tài xế**: Địa điểm · Thời gian thuê (có tài xế thêm hàng lộ trình).
 *   - **Dài hạn**: Địa điểm thôi — không hỏi ngày (ADR 0011).
 *
 * Luật "dịch vụ nào có ô lịch" đọc từ `serviceUsesRentalRange` của package dùng chung.
 */
export function SearchCard({ onSearch }: { onSearch: () => void }) {
  const t = useTranslations('HomeSearch');
  const tService = useTranslations('HomeSearch.service');
  const domainLabel = useDomainLabel();
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    draft,
    setVehicleType,
    setServiceType,
    setProvinceCode,
    setRouteType,
    setRentalRange,
    setRentalMode,
    provinceLabel,
  } = useSearchExperience();

  const vehicleItems = useMemo(
    () =>
      VEHICLE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
        icon: VEHICLE_ICON[value],
      })),
    [domainLabel],
  );

  // Thứ tự + luật "xe máy không có tài xế" đến từ package dùng chung, không chép lại ở đây.
  const serviceItems = useMemo(
    () =>
      serviceTypesFor(draft.vehicleType).map((value) => ({
        value,
        label: tService(SERVICE_LABEL_KEY[value] as never),
        icon: SERVICE_ICON[value],
      })),
    [draft.vehicleType, tService],
  );

  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = draft.serviceType === SERVICE_TYPE.LONG_TERM;
  const usesRange = serviceUsesRentalRange(draft.serviceType);
  const locationValue = provinceLabel(draft.provinceCode);

  return (
    <Card lift="raised" padded={false} accessibilityLabel={t('card.searchLabel')}>
      <YStack px={space.md} py={space.sm + space.xs} gap={space.sm + space.xs}>
        {/*
          Hai TẦNG lựa chọn, không có nền hay kẻ ngang bọc quanh: chỉ viên đang chọn nổi lên
          màu thương hiệu, phần còn lại chìm vào mặt thẻ — đúng cách web trình bày.
        */}
        <XStack gap={space.xs}>
          {vehicleItems.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              icon={item.icon}
              selected={draft.vehicleType === item.value}
              onPress={() => setVehicleType(item.value)}
              variant="segmented"
              grow
            />
          ))}
        </XStack>

        {/*
          Kẻ ngang tách TẦNG loại xe khỏi phần còn lại: chọn Ô tô hay Xe máy là quyết định
          đứng trên, nó đổi cả tập dịch vụ và tiêu chí bên dưới. Kẻ chạy hết bề ngang thẻ
          (bù lại lề bằng `mx` âm) — dừng giữa chừng trông như một nét thừa.
        */}
        <YStack h={1} bg={colors.borderSubtle} mx={-space.md} />

        <XStack gap={space.xs}>
          {serviceItems.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              icon={item.icon}
              selected={draft.serviceType === item.value}
              onPress={() => setServiceType(item.value)}
              variant="segmented"
              size="sm"
              grow
            />
          ))}
        </XStack>

        {withDriver ? (
          <Field label={t('route.label')}>
            <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
              {ROUTE_TYPE_VALUES.map((value) => (
                <Chip
                  key={value}
                  label={domainLabel('routeType', value, ROUTE_TYPE_LABEL[value])}
                  selected={draft.routeType === value}
                  onPress={() => setRouteType(value)}
                  size="sm"
                />
              ))}
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {domainLabel(
                'routeTypeDescription',
                draft.routeType,
                ROUTE_TYPE_DESCRIPTION[draft.routeType],
              )}
            </Text>
          </Field>
        ) : null}

        <Field label={t('location.label')}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('location.triggerLabel', { value: locationValue })}
          >
            <XStack
              ai="center"
              gap={space.sm}
              bg={colors.surfaceMuted}
              br={radius.md}
              bw={1}
              bc={colors.borderSubtle}
              px={space.md}
              minHeight={sizing.touchTarget}
            >
              <Ionicons name="location-outline" size={17} color={colors.textMuted} />
              <Text f={1} col={colors.text} fos={fontSize.body} numberOfLines={1}>
                {locationValue}
              </Text>
            </XStack>
          </Pressable>
        </Field>

        {usesRange ? (
          <Field label={t('rental.label')}>
            <RentalRangeField
              value={draft.rental}
              mode={draft.rental.mode}
              onChange={setRentalRange}
              onModeChange={setRentalMode}
              /*
               * "Áp dụng" chỉ ĐÓNG tấm trượt — KHÔNG điều hướng, đúng như web.
               *
               * Khoảng thuê đã có hiệu lực ngay lúc chọn (`setRentalRange` đi qua `edit`), nên
               * "Xe khả dụng" ngay dưới đã đổi rồi; sang màn kết quả là việc của nút "Tìm xe".
               * Trước đây chỗ này gọi `onSearch` nên bấm Áp dụng là văng thẳng sang màn khác.
               */
            />
          </Field>
        ) : null}

        <Button label={t('card.submit')} icon="search" size="lg" onPress={onSearch} />

        {longTerm ? (
          // ADR 0011: khách nêu NGUYỆN VỌNG ngày nhận sau khi chọn xe, gian hàng chốt lịch khi
          // duyệt — nói trước để không ai đi tìm ô chọn ngày trả.
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('card.longTermHint')}
          </Text>
        ) : null}
      </YStack>

      <LocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setProvinceCode}
      />
    </Card>
  );
}

/** Nhãn viết HOA nhỏ phía trên ô nhập — cùng cách web đặt nhãn ô trong thẻ tìm kiếm. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <YStack gap={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {label.toLocaleUpperCase()}
      </Text>
      {children}
    </YStack>
  );
}
