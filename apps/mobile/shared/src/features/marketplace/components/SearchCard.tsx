import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
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
    // Bo góc rộng hơn mặc định (`radius.lg` = 10px, dùng chung cho input/modal): thẻ này đè lên
    // banner trang chủ và là điểm nhìn đầu tiên của màn, bo sâu hơn cho cảm giác nổi hẳn lên.
    <Card
      lift="raised"
      padded={false}
      radius={radius.lg * 2}
      accessibilityLabel={t('card.searchLabel')}
    >
      {/* `py`/`gap` giữa hai bậc thang (`sm` 8px hụt, `md` 16px hơi rộng) — 12px là trung điểm. */}
      <YStack px={space.md} py={space.sm + space.xs} gap={space.sm + space.xs}>
        {/*
          Hai TẦNG lựa chọn, ngăn nhau bằng một ĐƯỜNG KẺ — không phải một dải nền chìm.

          Bản trước bọc cả hai hàng trong một khối `surfaceMuted`. Nó cho ra ba lớp màu chồng
          lên nhau trên cùng một chỗ: mặt thẻ trắng → dải xám → viên đang chọn màu vàng đặc.
          Trên màn hẹp, ba lớp đó đọc ra như một mảng màu loang chứ không như hai câu hỏi nối
          tiếp ("xe gì" rồi "thuê kiểu nào").

          Một hairline làm đúng việc ngăn cách mà không thêm lớp màu nào, và trả lại cho viên
          đang chọn quyền là thứ DUY NHẤT có màu trong khu vực này.

          Cả hai hàng giữ cỡ `sm` — bản trước hàng loại xe cao hơn hẳn hàng dịch vụ, trông lệch.

          Gap của khối này bằng ĐÚNG `py` của khối cha: khoảng từ mép thẻ xuống hàng "Ô tô/Xe
          máy" và khoảng từ hàng đó xuống đường kẻ phải bằng nhau.
        */}
        <YStack gap={space.sm + space.xs}>
          <XStack gap={space.xs}>
            {vehicleItems.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                icon={item.icon}
                selected={draft.vehicleType === item.value}
                onPress={() => setVehicleType(item.value)}
                variant="segmented"
                size="sm"
                grow
              />
            ))}
          </XStack>

          {/*
            Màu thương hiệu (`primary`), không phải xám trung tính — `primaryLight` (#fdf6e3)
            gần như biến mất trên nền trắng, còn `primary` đủ đậm để đọc ra là một đường NGĂN
            có chủ đích, không phải viền lỗi hay hairline mặc định của hệ thống.

            Chạy HẾT bề ngang thẻ (`mx` âm bù lại `px` của khối cha): dừng giữa chừng ở đúng lề
            hai viên chip nhìn như một nét thừa bị cắt cụt, không như một đường NGĂN TẦNG thật.
          */}
          <YStack h={StyleSheet.hairlineWidth * 2} bg={colors.primary} mx={-space.md} />

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
        </YStack>

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

        {/*
          Nền TRẮNG + viền `borderInput`, không phải `surfaceMuted` như bản trước: dải chọn loại
          xe/dịch vụ ở trên đã chiếm phần nền chìm rồi, ô địa điểm và ô thời gian dùng lại đúng
          màu đó thì cả thẻ chỉ còn một sắc be duy nhất, mắt không tách được đâu là điều khiển.
          Icon tô màu thương hiệu (`primaryActive`) thay vì xám — chấm phá màu duy nhất còn lại
          ngoài viên chip đang chọn, và cũng là cách web tô icon field của thẻ tìm kiếm.
        */}
        <Field label={t('location.label')}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('location.triggerLabel', { value: locationValue })}
          >
            <XStack
              ai="center"
              gap={space.sm}
              bg={colors.surface}
              br={radius.md}
              bw={1.5}
              bc={colors.borderInput}
              px={space.sm}
              minHeight={sizing.touchTarget - space.xs}
            >
              <Ionicons name="location-outline" size={17} color={colors.primaryActive} />
              <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
                {locationValue}
              </Text>
              <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
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

        {/*
          `size="md"`, không `"lg"`: nút này chỉ là hành động chính của MỘT thẻ trong dòng cuộn,
          không phải hành động chính toàn màn — cỡ `lg` (56pt) làm nó nặng hơn hẳn mọi ô phía
          trên và ăn đứt cảm giác "gọn" của cả thẻ.
        */}
        <Button label={t('card.submit')} icon="search" size="md" onPress={onSearch} />

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
