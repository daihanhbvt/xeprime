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
  vehicleServiceTypesFor,
} from '@xeprime/types';
import { serviceTypesFor, serviceUsesRentalRange } from '@xeprime/domain';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { GradientButton } from './home/GradientButton';
import { elevation } from '@/theme/elevation';
import { Chip } from '@/components/ui/Chip';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, space } from '@/theme/tokens';
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
const RADIUS_CARD = toPx(XP_TOKENS['border-radius-card']);
const RADIUS_CONTROL = toPx(XP_TOKENS['border-radius-control']);
const tabStyles = StyleSheet.create({ tab: { flex: 1, height: 46 }, segment: { flex: 1 } });

export function SearchCard({ onSearch }: { onSearch: () => void }) {
  const colors = useColors();
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
      VEHICLE_TYPE_VALUES.filter((value) =>
        vehicleServiceTypesFor(value).includes(draft.serviceType),
      ).map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
        icon: VEHICLE_ICON[value],
      })),
    [domainLabel, draft.serviceType],
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
    /*
     * Bản native của `SearchCard` web v2 (ADR 0062): dải tab dịch vụ phía trên (chỉ rộng bằng các
     * tab, rãnh `bg-muted`), bảng ô nhập trắng bên dưới: Loại xe · Địa điểm · Thời gian nhận/trả ·
     * nút gradient "Tìm kiếm". Dài hạn không hỏi ngày (ADR 0011).
     */
    <YStack accessibilityLabel={t('card.searchLabel')}>
      <XStack
        bg={colors.surfaceMuted}
        borderTopLeftRadius={RADIUS_CARD}
        borderTopRightRadius={RADIUS_CARD}
        accessibilityRole="tablist"
        accessibilityLabel={t('card.serviceTypeLabel')}
      >
        {serviceItems.map((item) => {
          const selected = draft.serviceType === item.value;
          return (
            <Pressable
              key={item.value}
              style={tabStyles.tab}
              onPress={() => setServiceType(item.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <YStack
                f={1}
                ai="center"
                jc="center"
                bg={selected ? colors.surface : 'transparent'}
                borderTopLeftRadius={RADIUS_CONTROL}
                borderTopRightRadius={RADIUS_CONTROL}
                px={space.sm}
              >
                <XStack
                  h="100%"
                  ai="center"
                  gap={space.sm}
                  borderBottomWidth={2}
                  borderBottomColor={selected ? market.accent : 'transparent'}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={selected ? colors.primaryHover : colors.textMuted}
                  />
                  <Text
                    col={selected ? colors.primaryHover : colors.textMuted}
                    fos={fontSize.body}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </XStack>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>

      <YStack
        bg={colors.surface}
        borderBottomLeftRadius={RADIUS_CARD}
        borderBottomRightRadius={RADIUS_CARD}
        px={space.md + space.xs}
        py={space.lg}
        gap={space.md}
        style={elevation.raised}
      >
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

        <Field label={t('card.vehicleTypeLabel')}>
          <XStack
            h={46}
            p={3}
            gap={3}
            ai="stretch"
            br={RADIUS_CONTROL}
            bw={1}
            bc={colors.border}
            bg={colors.background}
            accessibilityRole="radiogroup"
          >
            {vehicleItems.map((item) => {
              const selected = draft.vehicleType === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={tabStyles.segment}
                  onPress={() => setVehicleType(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <XStack
                    f={1}
                    ai="center"
                    jc="center"
                    gap={space.sm}
                    br={RADIUS_CONTROL}
                    bw={1}
                    bc={selected ? colors.borderInput : 'transparent'}
                    bg={selected ? colors.surface : 'transparent'}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={selected ? colors.primaryHover : colors.textMuted}
                    />
                    <Text
                      col={selected ? colors.primaryHover : colors.textMuted}
                      fos={fontSize.bodyLg}
                      fow={fontWeight.medium}
                    >
                      {item.label}
                    </Text>
                  </XStack>
                </Pressable>
              );
            })}
          </XStack>
        </Field>

        <Field label={t('location.label')}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('location.triggerLabel', { value: locationValue })}
          >
            <XStack
              h={44}
              ai="center"
              gap={space.sm}
              bg={colors.surface}
              br={RADIUS_CONTROL}
              bw={1}
              bc={colors.borderInput}
              px={14}
            >
              {/* Như web: chưa chọn tỉnh thì hiện lời mời, icon địa điểm ở CUỐI ô. */}
              <Text
                f={1}
                col={draft.provinceCode ? colors.text : colors.placeholder}
                fos={fontSize.bodyLg}
                numberOfLines={1}
              >
                {draft.provinceCode ? locationValue : t('location.placeholder')}
              </Text>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
            </XStack>
          </Pressable>
        </Field>

        {usesRange ? (
          <Field label={t('rental.pickupReturnLabel')}>
            <RentalRangeField
              value={draft.rental}
              mode={draft.rental.mode}
              onChange={setRentalRange}
              onModeChange={setRentalMode}
              placeholder={t('rental.placeholder')}
            />
          </Field>
        ) : null}

        {/* `CtaButton` gradient của web, bo `border-radius-control`, nhãn `card.searchAction`. */}
        <GradientButton
          label={t('card.searchAction')}
          iconStart="search"
          radius={RADIUS_CONTROL}
          onPress={onSearch}
        />

        {longTerm ? (
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
    </YStack>
  );
}

/** Nhãn ô — chữ thường `text-secondary` 14/medium như `.cellLabel` web. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={6}>
      <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
        {label}
      </Text>
      {children}
    </YStack>
  );
}
