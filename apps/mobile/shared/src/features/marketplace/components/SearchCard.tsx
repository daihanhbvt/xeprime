import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
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
 *   - **Tự lái / Có tài xế**: Địa điểm · Thời gian thuê (có tài xế: LỘ TRÌNH thay chỗ nhóm loại xe).
 *   - **Dài hạn**: Địa điểm thôi — không hỏi ngày (ADR 0011).
 *
 * Luật "dịch vụ nào có ô lịch" đọc từ `serviceUsesRentalRange` của package dùng chung.
 */
const RADIUS_CARD = toPx(XP_TOKENS['border-radius-card']);
const RADIUS_CONTROL = toPx(XP_TOKENS['border-radius-control']);
/** `.listTabs .icon` 22px · `.listSegment .tab` cao 44 · `.fields` khe 12 (≤640) · `space-2`. */
const TAB_ICON = 22;
const SEGMENT_HEIGHT = 44;
const FIELDS_GAP = toPx(XP_TOKENS['space-12']);
const SPACE_2 = toPx(XP_TOKENS['space-2']);
const tabStyles = StyleSheet.create({ tab: { flex: 1, height: 46 }, segment: { flex: 1 },
  // Ô lộ trình: rộng theo nhãn rồi chia phần dư — nhãn dài được ô rộng hơn, không co chữ.
  routeSegment: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
});

/**
 * `variant="sheet"`: CHỈ phần chọn (dịch vụ · loại xe/lộ trình · địa điểm · thời gian), không khung
 * thẻ, không nút "Tìm kiếm" — thân của tấm "Tìm xe" ở màn Tìm xe (người dùng chốt 29/10/2026), cùng
 * MỘT bộ chọn với trang chủ. Tấm là `Modal` nên hai bộ chọn con mở qua `onPickLocation` /
 * `onPickRange` của nơi gọi (đóng tấm trước, iOS không lồng `Modal`).
 */
export function SearchCard({
  onSearch,
  variant = 'card',
  onPickLocation,
  onPickRange,
}: {
  onSearch?: () => void;
  variant?: 'card' | 'sheet';
  onPickLocation?: () => void;
  onPickRange?: () => void;
}) {
  const sheet = variant === 'sheet';
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
  /** Ô đầu thẻ: loại xe, hoặc LỘ TRÌNH khi có tài xế (không icon — như web). */
  const segmentItems: {
    value: string;
    label: string;
    icon?: (typeof vehicleItems)[number]['icon'];
    selected: boolean;
    onPress: () => void;
  }[] = withDriver
    ? ROUTE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('routeType', value, ROUTE_TYPE_LABEL[value]),
        selected: draft.routeType === value,
        onPress: () => setRouteType(value),
      }))
    : vehicleItems.map((item) => ({
        ...item,
        selected: draft.vehicleType === item.value,
        onPress: () => setVehicleType(item.value),
      }));
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
        // Trong tấm: dải tab là một khối bo đủ bốn góc, tách khỏi các ô bên dưới.
        {...(sheet ? { br: RADIUS_CONTROL, overflow: 'hidden' as const } : null)}
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
                  {/* `.listTabs .icon` — 22px. */}
                  <Ionicons
                    name={item.icon}
                    size={TAB_ICON}
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
        bg={sheet ? 'transparent' : colors.surface}
        borderBottomLeftRadius={RADIUS_CARD}
        borderBottomRightRadius={RADIUS_CARD}
        p={sheet ? 0 : space.md}
        pt={sheet ? space.md : space.md}
        gap={space.md}
        style={sheet ? undefined : elevation.panel}
      >
        {/*
          `.panel` ≤640px — nền `bg-container`, bo dưới `radius-card`, đệm md, khe md, bóng
          `elevation-panel`. Các ô nhập nằm trong `.fields` (khe 12 ở ≤640px).
        */}
        <YStack gap={FIELDS_GAP}>
        {/*
          Có tài xế chỉ phục vụ ô tô, nên nhóm "Loại xe" chỉ còn một lựa chọn — ô đầu nhường chỗ
          cho LỘ TRÌNH, cùng kiểu đoạn chọn (web #235, Figma `21902:31701`).
        */}
        <Field label={withDriver ? t('route.label') : t('card.vehicleTypeLabel')}>
          {/*
            `.listSegment` — viền `color-border` 1px, bo control, nền `color-bg`, bóng xs, khe 2,
            KHÔNG đệm; mỗi mục cao 44.
          */}
          <XStack
            gap={SPACE_2}
            ai="stretch"
            br={RADIUS_CONTROL}
            bw={1}
            bc={colors.border}
            bg={colors.background}
            style={elevation.xs}
            accessibilityRole="radiogroup"
          >
            {segmentItems.map((item) => {
              const selected = item.selected;
              return (
                <Pressable
                  key={item.value}
                  style={withDriver ? tabStyles.routeSegment : tabStyles.segment}
                  onPress={item.onPress}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  {/*
                    `.listSegment .tab` — cao 44, đệm sm/md, viền trong suốt; đang chọn
                    (`.tabActive`): viền `border-strong`, nền `bg-container`, bóng xs, chữ `primary-hover`.
                  */}
                  <XStack
                    f={1}
                    h={SEGMENT_HEIGHT}
                    ai="center"
                    jc="center"
                    gap={space.sm}
                    // Ba ô lộ trình chia một hàng: đệm hẹp hơn để nhãn dài vẫn đủ chỗ.
                    px={withDriver ? space.xs : space.md}
                    br={RADIUS_CONTROL}
                    bw={1}
                    bc={selected ? colors.borderInput : 'transparent'}
                    bg={selected ? colors.surface : 'transparent'}
                    style={selected ? elevation.xs : undefined}
                  >
                    {item.icon ? (
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={selected ? colors.primaryHover : colors.textMuted}
                      />
                    ) : null}
                    {/*
                      MỘT dòng, CÙNG cỡ chữ với ô Ô tô / Xe máy — không co chữ (người dùng chốt 29/10/2026). Ba ô lộ trình chia
                      bề ngang THEO ĐỘ DÀI nhãn (flexBasis auto + flexGrow) nên "Liên tỉnh (1 chiều)" được ô rộng hơn.
                    */}
                    <Text
                      col={selected ? colors.primaryHover : colors.textMuted}
                      fos={fontSize.bodyLg}
                      fow={fontWeight.medium}
                      numberOfLines={1}
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
            onPress={() => (onPickLocation ? onPickLocation() : setPickerOpen(true))}
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
              style={elevation.xs}
            >
              {/*
                `LocationPicker .field` — cao 44, đệm 10/14, viền `border-strong` 1px, bo control,
                nền `bg-container`, bóng xs, chữ body-lg.
              */}
              {/*
                Như web `LocationPicker` (`selectedLabel`): chưa chọn tỉnh = GIÁ TRỊ "Toàn quốc" (chữ
                `text`, không phải placeholder) — tìm toàn quốc là một lựa chọn thật. Icon ở CUỐI ô.
              */}
              <Text f={1} col={colors.text} fos={fontSize.bodyLg} numberOfLines={1}>
                {draft.provinceCode ? locationValue : t('location.nationwide')}
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
              {...(onPickRange ? { onOpen: onPickRange } : {})}
            />
          </Field>
        ) : null}

        {/* `CtaButton` gradient của web, bo `border-radius-control`, nhãn `card.searchAction`. */}
        {onSearch && !sheet ? (
          <GradientButton
            label={t('card.searchAction')}
            iconStart="search"
            radius={RADIUS_CONTROL}
            onPress={onSearch}
          />
        ) : null}
        </YStack>

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
