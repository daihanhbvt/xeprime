import { Ionicons } from '@/components/icons/Ionicons';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RowDivider, SwitchRow } from '@/components/ui/SwitchRow';
import { ChoiceRow } from '@/components/ui/ChoiceRow';
import { CheckMark } from '@/components/ui/CheckMark';
import { LineIcon } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import {
  Controller,
  useController,
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldError,
} from 'react-hook-form';
import {
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_COMBINATION,
  COLLATERAL_COMBINATION_VALUES,
  COLLATERAL_MODE,
  type CollateralCombination,
  type CollateralMode,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  MILEAGE_LIMIT,
  type VehicleType,
} from '@xeprime/types';
import { deliverySummaryText, isFreeDeliveryFee, LIST_SEPARATOR } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { InfoCard } from '@/components/ui/InfoCard';
import { InfoHint } from '@/components/ui/InfoHint';
import type { IconName } from '@/components/ui/Chip';
import { MoneyField } from '@/components/ui/MoneyField';
import { FieldLabel, FieldMessage } from '@/components/ui/Field';
import { IconDisc } from '@/components/ui/IconDisc';
import { IconLine } from '@/components/ui/IconLine';
import { NumberField } from '@/components/ui/NumberField';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextField } from '@/components/ui/TextField';
import { LongTermFormulaNotice } from './LongTermPriceHint';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { themed, useColors } from '@/theme/ThemeProvider';
import {
  fieldFontSize,
  fontSize,
  fontWeight,
  iconSize,
  radius,
  sizing,
  space,
  typeScale,
} from '@/theme/tokens';
import type { PolicyFormValues } from '../schema';

type PolicyControl = Control<PolicyFormValues>;

/**
 * Tông của một khối chính sách — hình dẫn đầu, màu chữ nhấn, nền nhạt của các mảng phụ.
 *
 * Bốn khối có bốn tông chứ không cùng một sắc xám: màn này là bốn quyết định khác nhau xếp dọc
 * trên một màn cuộn dài, và khi mọi thứ cùng nền xám thì người dùng cuộn qua ranh giới giữa hai
 * khối mà không nhận ra mình đã sang khối khác. Màu lấy từ token NGỮ NGHĨA, không phải bảng
 * riêng của màn: cùng bộ mà `Callout`/`StatusBadge` đang dùng.
 */
interface SectionTone {
  fg: string;
  surface: string;
  icon: IconName;
}

const useTone = themed(
  (colors) =>
    ({
      deposit: { fg: colors.info, surface: colors.infoSurface, icon: 'shield-checkmark' },
      delivery: { fg: colors.primaryActive, surface: colors.primaryLight, icon: 'navigate' },
      overtime: { fg: colors.warning, surface: colors.warningSurface, icon: 'time' },
      mileage: { fg: colors.info, surface: colors.infoSurface, icon: 'speedometer' },
      discount: { fg: colors.success, surface: colors.successSurface, icon: 'pricetags' },
    }) as const satisfies Record<string, SectionTone>,
);

/**
 * Đầu một khối: đĩa hình mang tông + tiêu đề + (tuỳ khối) công tắc bật/tắt.
 *
 * Công tắc nằm CÙNG HÀNG với tiêu đề, đúng `cardHeader` bên web: nó bật/tắt cả khối, nên chỗ của
 * nó là cạnh tên khối chứ không phải một hàng riêng lẫn vào nội dung bên dưới.
 */
function SectionHead({
  tone,
  title,
  hint,
  toggle,
}: {
  tone: SectionTone;
  title: string;
  hint: string;
  toggle?: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.sm}>
        <IconDisc icon={tone.icon} tone={tone.fg} filled />
        {/* `flexShrink` mặc định là 0 trong RN — thiếu `f={1}` thì tiêu đề dài đẩy công tắc ra
            khỏi thẻ thay vì tự xuống dòng. */}
        <XStack f={1} minWidth={0} ai="center" gap={space.xs}>
          <Text flexShrink={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {title}
          </Text>
          {/* Mô tả dài gọn vào dấu ⓘ cạnh tiêu đề khối. */}
          <InfoHint content={hint} label={title} size={fontSize.body} />
        </XStack>
        {toggle}
      </XStack>
      <YStack h={1} bg={colors.borderSubtle} />
    </YStack>
  );
}

/**
 * Công tắc một dòng — thay `<Switch>` của AntD.
 *
 * Dùng `Switch` THẬT của React Native, không phải ô vuông có dấu tick.
 *
 * Ô tick nói "chọn một mục trong danh sách"; công tắc nói "bật/tắt cả một khối". Những hàng này
 * là loại thứ hai — bật "Ưu đãi cam kết thời hạn" làm hiện ra nguyên một khối ô nhập bên dưới —
 * nên hình phải nói đúng điều đó. `Switch` của nền tảng còn cho đúng hình iOS/Android mà người
 * dùng đã quen, và tự mang sẵn vai khả truy cập.
 *
 * `accessibilityLabel` vẫn đặt tay vì nhãn nằm ở `<Text>` bên cạnh, không nằm trong công tắc.
 */
export function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  /** Câu giải thích dưới nhãn — `description` của `SwitchField` bên web (có thể chứa link). */
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm} py={space.xs}>
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {label}
        </Text>
        {hint ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {hint}
          </Text>
        ) : null}
      </YStack>
      <PolicySwitch
        label={label}
        checked={checked}
        disabled={disabled ?? false}
        onToggle={onToggle}
      />
    </XStack>
  );
}

/** Màu rãnh công tắc. `false` phải ĐẬM hơn nền thẻ, nếu không công tắc tắt nhìn như không có. */
const useSwitchTrack = themed((colors) => ({ false: colors.borderInput, true: colors.primary }));

function PolicySwitch({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  const SWITCH_TRACK = useSwitchTrack();
  return (
    <Switch
      value={checked}
      onValueChange={onToggle}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={SWITCH_TRACK}
      thumbColor={colors.surface}
      ios_backgroundColor={colors.borderInput}
    />
  );
}

/**
 * Lỗi cấp MẢNG của React Hook Form nằm ở `root` (hoặc `message` với bản cũ), KHÔNG ở phần tử.
 *
 * Đây là chỗ chứa những ràng buộc CHÉO — bậc phải tăng dần, bậc cuối phải chạm bán kính — thứ
 * không quy được về một ô cụ thể nào.
 */
function arrayErrorOf(
  error: { root?: FieldError; message?: string } | undefined,
): string | undefined {
  return error?.root?.message ?? error?.message;
}

/**
 * Dòng KẾT LUẬN dưới một danh sách bậc: lỗi chéo, hoặc xác nhận bộ bậc đã liền mạch.
 *
 * Web có cả hai vế (`tierError` / `tierOk`) và vế XANH mới là vế khó bỏ: người nhập không có
 * cách nào khác để biết mình đã phủ kín từ 0 tới bán kính, vì đó là quan hệ giữa nhiều dòng chứ
 * không phải giá trị của dòng nào.
 */
function TierStatus({ error, ok }: { error?: string; ok?: string }) {
  const colors = useColors();
  if (error) {
    return (
      <IconLine icon="alert-circle" tone={colors.danger}>
        {error}
      </IconLine>
    );
  }
  if (ok) {
    return (
      <IconLine icon="checkmark-circle" tone={colors.success}>
        {ok}
      </IconLine>
    );
  }
  return null;
}

/**
 * Nút thêm một dòng bậc — hàng viền màu chiếm trọn bề ngang, không phải một liên kết chữ.
 *
 * Đây là thao tác chính của cả khối (không có bậc nào thì khối vô nghĩa), nên nó phải là đích
 * chạm cỡ ngón tay đặt ngay dưới dòng cuối, đúng vai `<Button icon={<PlusOutlined/>}>` bên web.
 */
function AddTierButton({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: SectionTone;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack
        ai="center"
        jc="center"
        gap={space.xs}
        minHeight={sizing.touchTarget}
        br={radius.md}
        bw={1}
        bc={tone.fg}
        bg={tone.surface}
        opacity={disabled ? 0.45 : 1}
      >
        <Ionicons name="add" size={iconSize.sm} color={tone.fg} />
        <Text col={tone.fg} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/** Đường kính viên số dẫn đầu một dòng bậc — vừa ôm một chữ số mà không cao hơn hàng chữ. */
const TIER_BADGE = 22;

/**
 * Một dòng bậc = một thẻ TRẮNG có vạch màu ở mép trái, không phải một mảng xám.
 *
 * Bản trước tô `surfaceMuted` cho từng dòng bậc, đặt bên trong một thẻ vốn đã trắng ngà: cả khối
 * đọc ra như xám-trên-xám, ranh giới giữa hai bậc mờ đi, và ô nhập bên trong (cũng có nền riêng)
 * mất luôn độ nổi. Trắng + viền + một vạch tông ở mép trái tách các dòng bằng ĐƯỜNG chứ không
 * bằng mảng màu — cùng cách `FieldShell` và `CardAccent` đã chọn.
 */
function TierCard({
  tone,
  index,
  title,
  badge,
  removeLabel,
  disabled,
  onRemove,
  children,
}: {
  tone: SectionTone;
  index: number;
  title?: string;
  badge?: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack br={radius.md} bw={1} bc={colors.border} bg={colors.surface} ov="hidden">
      {/* Không đặt chiều cao: `alignItems: stretch` mặc định của RN cho vạch cao bằng cả dòng. */}
      <YStack w={3} bg={tone.fg} />
      <YStack f={1} gap={space.sm} p={space.sm}>
        <XStack ai="center" gap={space.xs}>
          <XStack
            w={TIER_BADGE}
            h={TIER_BADGE}
            br={radius.pill}
            bg={tone.surface}
            bw={1}
            bc={tone.fg}
            ai="center"
            jc="center"
          >
            <Text col={tone.fg} fos={fontSize.label} fow={fontWeight.bold}>
              {index + 1}
            </Text>
          </XStack>
          {title ? (
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {title}
            </Text>
          ) : null}
          <YStack f={1} />
          {badge ? (
            <XStack br={radius.pill} bg={tone.surface} bw={1} bc={tone.fg} px={space.xs} py={2}>
              <Text col={tone.fg} fos={fontSize.label} fow={fontWeight.semibold}>
                {badge}
              </Text>
            </XStack>
          ) : null}
          {disabled ? null : (
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={removeLabel}
              hitSlop={space.xs}
            >
              <Ionicons name="trash-outline" size={iconSize.sm} color={colors.danger} />
            </Pressable>
          )}
        </XStack>
        {children}
      </YStack>
    </XStack>
  );
}

/** Nhãn của một NHÓM ô trong khối (bảng bậc), kèm câu giải thích quy tắc của nhóm. */
function GroupLabel({ label, hint }: { label: string; hint?: string }) {
  const colors = useColors();
  return (
    <YStack gap={2}>
      <Text col={colors.text} fos={fieldFontSize.label} fow={fontWeight.semibold}>
        {label}
      </Text>
      {hint ? (
        <Text col={colors.textMuted} fos={fieldFontSize.message}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * Hộp CÔNG THỨC / GHI CHÚ mang tông của khối — bản native của `styles.formulaCard` bên web.
 *
 * Nền TÔNG chứ không phải nền xám: web đặt nó trên `--xp-color-bg-muted` vì ở đó thẻ nằm trên
 * nền trang xám và mảng muted vẫn tách ra; trong app thẻ đã trắng trên nền trắng ngà, nên cùng
 * một mảng xám nhạt đọc ra như một khoảng trống chứ không như một hộp.
 */
function NotePanel({
  tone,
  icon,
  title,
  body,
}: {
  tone: SectionTone;
  icon: IconName;
  title: string;
  body: string;
}) {
  const colors = useColors();
  return (
    <XStack gap={space.sm} p={space.sm} br={radius.md} bw={1} bc={tone.fg} bg={tone.surface}>
      <YStack pt={1}>
        <Ionicons name={icon} size={iconSize.sm} color={tone.fg} />
      </YStack>
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
          {title}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
        </Text>
      </YStack>
    </XStack>
  );
}

/** Năm khối của một bộ chính sách thuê — mã để nơi gọi chọn khối nào hiện (web `POLICY_BLOCK`). */
export const POLICY_BLOCK = {
  COLLATERAL: 'collateral',
  DELIVERY: 'delivery',
  MILEAGE: 'mileage',
  OVERTIME: 'overtime',
  DISCOUNT: 'discount',
} as const;
export type PolicyBlock = (typeof POLICY_BLOCK)[keyof typeof POLICY_BLOCK];

/** Thứ tự cố định của năm khối — cũng là vị trí 1..5 mà từng khối con truyền cho `step`. */
export const ALL_POLICY_BLOCKS: readonly PolicyBlock[] = [
  POLICY_BLOCK.COLLATERAL,
  POLICY_BLOCK.DELIVERY,
  POLICY_BLOCK.MILEAGE,
  POLICY_BLOCK.OVERTIME,
  POLICY_BLOCK.DISCOUNT,
];

/** Mốc ưu đãi CŨ tính theo NGÀY — chỉ để cảnh báo, không còn tham gia tính giá (ADR 0011). */
export interface LegacyTierView {
  minDays: number;
  percent: number;
}

/**
 * Bốn khối chính sách thuê — bảo đảm · giao nhận · quá giờ · ưu đãi dài hạn.
 *
 * Bản native của `PolicySections` bên web: cùng trường, cùng THỨ TỰ, cùng điều kiện hiện/ẩn,
 * cùng schema (`policyFormSchema` ở `../schema.ts`, kể cả ràng buộc chéo). Chỉ đổi cách vẽ —
 * `Switch` thành công tắc nền tảng, `Checkbox.Group` thành hàng ô tick, bảng bậc thành danh sách
 * thẻ dọc.
 *
 * DÙNG CHUNG cho hai màn: chính sách mặc định của gian hàng (SHP-04) và ghi đè theo xe (VEH-05).
 * Ba prop dưới đây chỉ có nghĩa ở màn gian hàng, nên chúng tuỳ chọn:
 *
 * - `numbered` — đánh số 1–4 như màn gian hàng; màn ghi đè theo xe tắt đi vì bốn khối này chỉ là
 *   một phần của một trang dài hơn (web truyền `numbered={false}` ở đúng chỗ đó);
 * - `depositHint` — "N xe đang dùng mức cọc này", phạm vi ảnh hưởng của con số đang sửa;
 * - `legacyDiscountTiers` — mốc cũ theo NGÀY chưa quy được sang gói.
 */
export function PolicySections<T extends PolicyFormValues>({
  control: outerControl,
  disabled,
  numbered = true,
  depositHint,
  legacyDiscountTiers,
  blocks = ALL_POLICY_BLOCKS,
  shopWorkspace,
  afterDelivery,
  afterRules,
  onAnchorLayout,
  compact = false,
  discountWeekdayPrice,
}: {
  /** Giá ngày thường của xe cho khung "Công thức tính giá gói" (`compact`, màn sửa xe). */
  discountWeekdayPrice?: number | string | null | undefined;
  /**
   * Form của nơi gọi có thể RỘNG hơn `PolicyFormValues` (màn gian hàng thêm trường riêng). Generic
   * để nơi gọi khỏi ép kiểu; một lần thu hẹp ở đây, như web `PolicySections`.
   */
  control: Control<T>;
  disabled: boolean;
  numbered?: boolean;
  depositHint?: string;
  legacyDiscountTiers?: readonly LegacyTierView[];
  /**
   * Màn chính sách MẶC ĐỊNH của gian hàng (web 06/11/2026): công tắc quá giờ, ưu đãi dài hạn theo
   * số mốc (không công tắc) + khung xem trước giá gói với giá tháng ví dụ của loại xe này.
   */
  shopWorkspace?: { vehicleType: VehicleType };
  /** Khối đứng ngay sau "Giao nhận xe" — màn gian hàng đặt "Thời gian chết" ở đó, như web. */
  afterDelivery?: ReactNode;
  /** Khối nối vào CUỐI nhóm quy định (web: bảo hiểm Bắt buộc/Tuỳ chọn sau giới hạn - ADR 0091). */
  afterRules?: ReactNode;
  /**
   * Đo vị trí ba đích của mục lục (web `POLICY_NAV`: quy định · giao nhận · dài hạn) — toạ độ tương
   * đối với khung của `PolicySections`. Chỉ màn gian hàng dùng.
   */
  onAnchorLayout?: (anchor: PolicyAnchor, y: number) => void;
  /**
   * Màn sửa xe › Dịch vụ xe (Figma Partner `24237:56980`): hai khối Hạn mức quãng đường + quá giờ
   * thành HÀNG CÔNG TẮC v2 nằm thẳng trong thẻ nơi gọi, cách nhau một đường kẻ - không thẻ con, không
   * khối xem trước/công thức (người dùng chốt 27/11/2026). Áp cho `MILEAGE` + `OVERTIME` + `DISCOUNT`
   * (ưu đãi dài hạn: mốc là dòng tóm tắt, sửa trong tấm trượt - cùng kiểu bậc giao xe).
   */
  compact?: boolean;
  /**
   * Khối nào HIỆN — mặc định đủ năm (web `blocks`). Khối ẩn vẫn nằm trong form (giá trị nạp từ
   * chính sách đang có) và vẫn được gửi đi: ẩn một khối không làm mất nó.
   */
  blocks?: readonly PolicyBlock[];
}) {
  const control = outerControl as unknown as PolicyControl;
  /*
   * Màn gian hàng dùng chữ của `Shop.policies.workspace` cho khối bảo đảm và quãng đường - đúng web
   * `CollateralBlock`/`LimitBlocks` (tiêu đề "Tài sản thế chấp", câu mô tả cọc/miễn của gian hàng).
   */
  const tCollateral = useTranslations('Shop.policies.workspace.collateral');
  const tShopWorkspace = useTranslations('Shop.policies.workspace');
  const shopCollateral = shopWorkspace ? { title: tCollateral('title') } : {};
  // Đánh số theo khối ĐANG HIỆN — ẩn một khối không để lại một con số bị nhảy cóc (như web).
  const shown = ALL_POLICY_BLOCKS.filter((block) => blocks.includes(block));
  /* Khối con gọi `step(vị trí cố định 1..5, …)`; đổi vị trí đó sang số thứ tự trong `shown`. */
  const step = (index: number, title: string) => {
    const block = ALL_POLICY_BLOCKS[index - 1];
    const position = block ? shown.indexOf(block) + 1 : index;
    return numbered && !shopWorkspace ? `${position}. ${title}` : title;
  };

  const collateral = shown.includes(POLICY_BLOCK.COLLATERAL) ? (
    <DepositSection
      control={control}
      disabled={disabled}
      step={step}
      hint={depositHint}
      {...shopCollateral}
    />
  ) : null;
  const delivery = shown.includes(POLICY_BLOCK.DELIVERY) ? (
    <DeliverySection
      control={control}
      disabled={disabled}
      step={step}
      {...(shopWorkspace
        ? {
            title: tShopWorkspace('delivery.serviceTitle'),
            hint: tShopWorkspace('delivery.serviceHint'),
          }
        : {})}
    />
  ) : null;
  const mileage = shown.includes(POLICY_BLOCK.MILEAGE) ? (
    <MileageSection
      control={control}
      disabled={disabled}
      step={step}
      {...(shopWorkspace ? { hint: tShopWorkspace('mileage.hint') } : {})}
    />
  ) : null;
  const overtime = shown.includes(POLICY_BLOCK.OVERTIME) ? (
    <OvertimeSection
      control={control}
      disabled={disabled}
      step={step}
      // Công tắc quá giờ ở MỌI màn (web `LimitBlocks`): form suy `overtimeEnabled` từ dữ liệu.
      withToggle
    />
  ) : null;
  const discount = shown.includes(POLICY_BLOCK.DISCOUNT) ? (
    <LongTermDiscountSection
      control={control}
      disabled={disabled}
      step={step}
      legacyTiers={legacyDiscountTiers}
      byTiers={Boolean(shopWorkspace)}
    />
  ) : null;

  /*
   * Màn chính sách GIAN HÀNG gom như web `ShopPolicyForm` (user chốt 12/11/2026): ba thẻ "Thủ tục &
   * Điều khoản" (bảo đảm + quãng đường + quá giờ) · "Giao nhận xe" (giao xe + thời gian chết) · "Ưu
   * đãi dài hạn". Khối con bỏ thẻ riêng và bỏ số thứ tự. Màn giá theo xe giữ năm khối đánh số.
   */
  if (compact) {
    const parts = [
      shown.includes(POLICY_BLOCK.MILEAGE) ? (
        <CompactMileage key="mileage" control={control} disabled={disabled} />
      ) : null,
      shown.includes(POLICY_BLOCK.OVERTIME) ? (
        <CompactOvertime key="overtime" control={control} disabled={disabled} />
      ) : null,
      shown.includes(POLICY_BLOCK.DISCOUNT) ? (
        <LongTermDiscountSection
          key="discount"
          control={control}
          disabled={disabled}
          step={step}
          legacyTiers={legacyDiscountTiers}
          byTiers={Boolean(shopWorkspace)}
          compact
          weekdayPrice={discountWeekdayPrice}
        />
      ) : null,
    ].filter(Boolean);
    return (
      <YStack gap={COMPACT_GAP}>
        {parts.map((part, index) => (
          <YStack key={index} gap={COMPACT_GAP}>
            {index > 0 ? <RowDivider /> : null}
            {part}
          </YStack>
        ))}
      </YStack>
    );
  }

  if (shopWorkspace) {
    const group = (anchor: PolicyAnchor, title: string, parts: readonly ReactNode[]) => {
      const present = parts.filter(Boolean);
      if (present.length === 0) return null;
      return (
        <InfoCard
          title={title}
          onLayout={(e) => onAnchorLayout?.(anchor, e.nativeEvent.layout.y)}
        >
          <SectionShellContext.Provider value>
            <YStack gap={space.lg}>
              {present.map((part, index) => (
                <YStack key={index} gap={space.lg}>
                  {index > 0 ? <Divider /> : null}
                  {part}
                </YStack>
              ))}
            </YStack>
          </SectionShellContext.Provider>
        </InfoCard>
      );
    };
    return (
      <YStack gap={space.md}>
        {group(POLICY_ANCHOR.RULES, tShopWorkspace('procedures.title'), [
          collateral,
          mileage,
          overtime,
          afterRules,
        ])}
        {group(POLICY_ANCHOR.DELIVERY, tShopWorkspace('delivery.title'), [delivery, afterDelivery])}
        {group(POLICY_ANCHOR.LONG_TERM, tShopWorkspace('longTerm.title'), [discount])}
      </YStack>
    );
  }

  return (
    <YStack gap={space.md}>
      {collateral ? (
        <YStack onLayout={(e) => onAnchorLayout?.(POLICY_ANCHOR.RULES, e.nativeEvent.layout.y)}>
          {collateral}
        </YStack>
      ) : null}
      {delivery ? (
        <YStack onLayout={(e) => onAnchorLayout?.(POLICY_ANCHOR.DELIVERY, e.nativeEvent.layout.y)}>
          {delivery}
        </YStack>
      ) : null}
      {afterDelivery}
      {mileage}
      {overtime}
      {afterRules}
      {discount ? (
        <YStack onLayout={(e) => onAnchorLayout?.(POLICY_ANCHOR.LONG_TERM, e.nativeEvent.layout.y)}>
          {discount}
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Trong thẻ nhóm của màn gian hàng, khối con không dựng thẻ riêng (thẻ trong thẻ) - chỉ là một
 * vùng của thẻ nhóm, như các `PolicyCard` web chứa nhiều khối.
 */
const SectionShellContext = createContext(false);

function SectionShell({ children }: { children: ReactNode }) {
  const bare = useContext(SectionShellContext);
  return bare ? <YStack>{children}</YStack> : <Card>{children}</Card>;
}

/** Ba đích của mục lục trang Chính sách thuê — cùng ba mục với web `POLICY_NAV`. */
export const POLICY_ANCHOR = {
  RULES: 'rules',
  DELIVERY: 'delivery',
  LONG_TERM: 'longTerm',
} as const;
export type PolicyAnchor = (typeof POLICY_ANCHOR)[keyof typeof POLICY_ANCHOR];

type StepTitle = (index: number, title: string) => string;

/** Mốc gợi ý số tiền cọc (Figma, như web) - bấm chỉ ĐIỀN số, không phải một mức nền tảng áp đặt. */
const DEPOSIT_PRESETS = [3_000_000, 5_000_000, 10_000_000, 15_000_000] as const;

/**
 * Cọc kết hợp (ADR 0112 điều 2) - bản native của web `CollateralBlock`: "Có yêu cầu thế chấp" bật cọc
 * tiền, cọc tài sản hoặc cả hai, kèm "Khách chọn 1 trong 2" / "Bắt buộc cả 2"; "Miễn thế chấp" không
 * hỏi gì (khối xanh, không còn +40% hay eKYC). Tắt một hình thức thì ô của nó ẩn - `formToSaveInput`
 * gửi 0 / rỗng cho hình thức đang tắt.
 */
function DepositSection({
  control,
  disabled,
  step,
  hint,
  title,
  headless = false,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Phạm vi ảnh hưởng của mức cọc đang sửa — chỉ màn chính sách gian hàng truyền vào. */
  hint?: string;
  /** Xem docblock ở `CollateralPolicySection`. */
  title?: string;
  /** Giữ chữ ký cũ cho nơi gọi - mô tả lựa chọn nay là câu chung của ADR 0112. */
  optionDescriptions?: Partial<Record<string, string>>;
  /** Thẻ nơi gọi đã có tiêu đề + mô tả (màn sửa xe) - bỏ đầu khối và nhãn lặp. */
  headless?: boolean;
}) {
  const colors = useColors();
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.deposit');
  const tc = useTranslations('Shop.policies.workspace.collateral');
  const tUnits = useTranslations('Common.units');
  const domainLabel = useDomainLabel();
  const { field: modeField } = useController({ control, name: 'collateralMode' });
  const { field: cashField, fieldState: cashState } = useController({
    control,
    name: 'collateralCashEnabled',
  });
  const { field: assetField } = useController({ control, name: 'collateralAssetEnabled' });
  const { field: comboField } = useController({ control, name: 'collateralCombination' });
  const { field: amountField } = useController({ control, name: 'depositAmount' });
  const mode = modeField.value as CollateralMode;
  const cash = cashField.value === true;
  const asset = assetField.value === true;
  const both = cash && asset;

  const selectMode = (next: CollateralMode) => {
    modeField.onChange(next);
    // Chuyển sang "Có yêu cầu" mà chưa bật hình thức nào ⇒ bật cọc tiền (phổ biến nhất) - như web.
    if (next === COLLATERAL_MODE.REQUIRED && !cash && !asset) cashField.onChange(true);
  };
  const toggle = (which: 'cash' | 'asset') => {
    const field = which === 'cash' ? cashField : assetField;
    const next = field.value !== true;
    field.onChange(next);
    // "Bắt buộc cả 2" chỉ có nghĩa khi cả hai bật.
    if (!next) comboField.onChange(COLLATERAL_COMBINATION.ANY_ONE);
  };

  return (
    <SectionShell>
      <YStack gap={COMPACT_GAP}>
        {headless ? null : (
          <SectionHead tone={TONE.deposit} title={step(1, title ?? tc('title'))} hint={tc('subtitle')} />
        )}
        {headless ? null : <FieldLabel label={tc('modeLabel')} required />}
        {/* Figma `24705:45572`: hai hàng radio không khung. */}
        {COLLATERAL_MODE_VALUES.map((value) => (
          <ChoiceRow
            key={value}
            kind="radio"
            label={domainLabel('collateralMode', value)}
            hint={value === COLLATERAL_MODE.REQUIRED ? tc('modeRequired') : tc('modeNone')}
            checked={mode === value}
            disabled={disabled}
            onPress={() => selectMode(value)}
          />
        ))}

        {mode === COLLATERAL_MODE.REQUIRED ? (
          <YStack gap={COMPACT_GAP}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
            >
              {tc('methodTitleApp')}
            </Text>
            {/*
              Chip "Khách chọn 1 trong 2 / Bắt buộc cả 2" (ADR 0112) - Figma màn xe không vẽ, người dùng
              chốt giữ (27/11/2026): luôn hiện, chỉ chọn được khi bật cả hai hình thức.
            */}
            <YStack
              opacity={both && !disabled ? 1 : 0.6}
              pointerEvents={both && !disabled ? 'auto' : 'none'}
              accessibilityState={{ disabled: !both || disabled }}
            >
              <ChipTabs<CollateralCombination>
                label={tc('methodTitleApp')}
                gutter={0}
                items={COLLATERAL_COMBINATION_VALUES.map((value) => ({
                  value,
                  label: domainLabel('collateralCombination', value),
                }))}
                value={
                  both
                    ? (comboField.value as CollateralCombination)
                    : COLLATERAL_COMBINATION.ANY_ONE
                }
                onSelect={(value) => comboField.onChange(value)}
              />
            </YStack>

            <CollateralOptionBox
              title={tc('cashTitle')}
              hint={tc('cashHint')}
              checked={cash}
              disabled={disabled}
              onToggle={() => toggle('cash')}
            >
              {cash ? (
                <YStack gap={space.sm}>
                  <MoneyField
                    control={control}
                    name="depositAmount"
                    label={tc('amountLabel')}
                    hint={t('amountHint')}
                    required
                    editable={!disabled}
                  />
                  {/* Figma "Quick Presets": viên 12/18 đệm 10/2, chọn = nền vàng nhạt viền vàng. */}
                  <XStack gap={PRESET_GAP} flexWrap="wrap" accessibilityLabel={tc('presetsLabel')}>
                    {DEPOSIT_PRESETS.map((amount) => {
                      const active = Number(amountField.value) === amount;
                      return (
                        <Pressable
                          key={amount}
                          disabled={disabled}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active, disabled }}
                          onPress={() => amountField.onChange(amount)}
                        >
                          <YStack
                            px={PRESET_PAD_X}
                            py={2}
                            br={radius.pill}
                            bw={1}
                            bc={active ? colors.brandShape : colors.border}
                            bg={active ? colors.brandLow : colors.background}
                            opacity={disabled ? 0.6 : 1}
                          >
                            <Text
                              col={active ? colors.brandLink : colors.text}
                              fos={typeScale.label.fontSize}
                              lh={typeScale.label.lineHeight}
                              fow={active ? fontWeight.semibold : fontWeight.regular}
                            >
                              {tUnits('millionShort', { count: amount / 1_000_000 })}
                            </Text>
                          </YStack>
                        </Pressable>
                      );
                    })}
                  </XStack>
                  {/* "N xe đang dùng mức cọc này" - Figma không vẽ, người dùng chốt giữ ở dạng chữ phụ (27/11/2026). */}
                  {hint ? (
                    <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                      {hint}
                    </Text>
                  ) : null}
                </YStack>
              ) : null}
            </CollateralOptionBox>

            <CollateralOptionBox
              title={tc('assetTitle')}
              hint={tc('assetHintApp')}
              checked={asset}
              disabled={disabled}
              onToggle={() => toggle('asset')}
            >
              {asset ? (
                <Controller
                  control={control}
                  name="collateralAssetTypes"
                  render={({ field, fieldState }) => {
                    const selected = field.value ?? [];
                    return (
                      <YStack gap={space.sm}>
                        {headless ? null : <FieldLabel label={t('assetTypes')} required />}
                        {COLLATERAL_ASSET_TYPE_VALUES.map((value) => (
                          <ChoiceRow
                            key={value}
                            kind="checkbox"
                            tone="soft"
                            label={domainLabel('collateralAssetType', value)}
                            checked={selected.includes(value)}
                            disabled={disabled}
                            onPress={() =>
                              field.onChange(
                                selected.includes(value)
                                  ? selected.filter((item) => item !== value)
                                  : [...selected, value],
                              )
                            }
                          />
                        ))}
                        {fieldState.error?.message ? (
                          <FieldMessage error={fieldState.error.message} />
                        ) : null}
                      </YStack>
                    );
                  }}
                />
              ) : null}
            </CollateralOptionBox>
            {cashState.error?.message ? <FieldMessage error={cashState.error.message} /> : null}
          </YStack>
        ) : (
          <Callout tone="success" title={tc('noneBadgeTitle')}>
            {tc('noneBadgeBody')}
          </Callout>
        )}
      </YStack>
    </SectionShell>
  );
}

/** Figma "Quick Presets": viên cách 6, đệm ngang 10. */
const PRESET_GAP = 6;
const PRESET_PAD_X = 10;

/**
 * Khung một hình thức cọc (Figma `24705:45586` / `24705:45621`): tiêu đề 14 đậm vừa + mô tả 12, ô tick
 * 20 bên phải; đang bật = nền `bg/primary-25` viền `stroke/primary`, tắt = nền trắng viền xám. Chạm
 * hàng đầu là bật/tắt hình thức đó; nội dung (ô số tiền, loại tài sản) nằm dưới.
 */
function CollateralOptionBox({
  title,
  hint,
  checked,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack
      p={COMPACT_GAP}
      gap={COMPACT_GAP}
      br={radius.control}
      bw={1}
      bc={checked ? colors.brandShape : colors.border}
      /* Figma `24789:84314`: chọn = nền `bg/primary-25` #fffdf5 (`brandWash`) + viền `stroke/primary`. */
      bg={checked ? colors.brandWash : colors.surface}
    >
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={title}
      >
        <XStack gap={COMPACT_GAP} ai="flex-start" opacity={disabled ? 0.6 : 1}>
          <YStack f={1} minWidth={0} gap={2}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
            >
              {title}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {hint}
            </Text>
          </YStack>
          <CheckMark checked={checked} tone="brand" />
        </XStack>
      </Pressable>
      {children}
    </YStack>
  );
}

function DeliverySection({
  control,
  disabled,
  step,
  title,
  hint,
  headless = false,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Màn gian hàng: chữ `Shop.policies.workspace.delivery.service*` như web `DeliveryBlock`. */
  title?: string;
  hint?: string;
  /** Màn sửa xe (Figma `24705:45799`): đầu khối là MỘT hàng công tắc v2 trong thẻ của nơi gọi. */
  headless?: boolean;
}) {
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.delivery');
  const tWorkspace = useTranslations('Shop.policies.workspace.delivery');
  const fmt = useAppFormat();
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  /*
   * `useWatch` cho GIÁ TRỊ, `useFieldArray` cho THÊM/XOÁ — đúng cặp web dùng.
   *
   * Bản trước bọc cả mảng trong MỘT `Controller` và đọc `field.value`. `Controller` chỉ nghe
   * đúng tên nó đăng ký (`deliveryTiers`), không nghe con của nó; mà mỗi ô `toKm` lại là một
   * `useController` riêng ở tên `deliveryTiers.N.toKm`. Nên gõ "20" vào bậc 1 KHÔNG làm khối
   * này vẽ lại, và dòng "Từ …" của bậc 2 đứng im ở giá trị cũ.
   */
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const maxRadiusKm = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });
  const { errors } = useFormState({ control, name: ['deliveryTiers', 'deliveryMaxRadiusKm'] });
  /* `headless` (Figma `24231:111519`): bậc là dòng tóm tắt, sửa trong tấm trượt - đây là bậc đang mở. */
  const [editing, setEditing] = useState<number | null>(null);

  const crossError = arrayErrorOf(errors.deliveryTiers);
  /* Bộ bậc "liền mạch" là quan hệ giữa NHIỀU dòng cộng với bán kính — cùng điều kiện với web. */
  const tiersComplete =
    tiers.length > 0 && tiers.every((tier) => tier?.toKm != null) && maxRadiusKm != null;

  return (
    <SectionShell>
      <YStack gap={headless ? COMPACT_GAP : space.md}>
        {headless ? (
          <Controller
            control={control}
            name="deliveryEnabled"
            render={({ field }) => (
              <SwitchRow
                title={tWorkspace('serviceTitle')}
                description={tWorkspace('serviceHint')}
                value={field.value === true}
                disabled={disabled}
                onChange={(next) => field.onChange(next)}
              />
            )}
          />
        ) : (
        <SectionHead
          tone={TONE.delivery}
          title={step(2, title ?? t('title'))}
          hint={hint ?? t('hint')}
          toggle={
            <Controller
              control={control}
              name="deliveryEnabled"
              render={({ field }) => (
                <PolicySwitch
                  label={t('enable')}
                  checked={field.value === true}
                  disabled={disabled}
                  onToggle={() => field.onChange(!field.value)}
                />
              )}
            />
          }
        />
        )}

        {enabled ? (
          <>
            {/*
              THỨ TỰ: bảng bậc TRƯỚC, bán kính SAU — đúng bố cục web.

              Bán kính là mốc phải KHỚP điểm kết thúc của bậc cuối (schema `covers-radius`), nên
              nó chỉ có nghĩa khi đã nhìn thấy các bậc. Đặt nó lên đầu như bản trước là bắt người
              dùng chốt giới hạn ngoài trước khi biết mình sẽ chia mấy khoảng, rồi quay lại sửa.
            */}
            {headless ? (
              <YStack gap={COMPACT_GAP}>
                {fields.map((row, index) => (
                  <TierSummaryRow
                    key={row.id}
                    from={index === 0 ? '0' : `>${tiers[index - 1]?.toKm ?? '-'}`}
                    to={tiers[index]?.toKm ?? null}
                    fee={tiers[index]?.fee ?? null}
                    removeLabel={t('removeTierAt', { index: index + 1 })}
                    editLabel={t('tierName', { index: index + 1 })}
                    disabled={disabled}
                    onRemove={() => remove(index)}
                    onEdit={() => setEditing(index)}
                  />
                ))}
                {disabled ? null : (
                  <AddLink
                    label={t('addTier')}
                    onPress={() => {
                      append({ toKm: null, fee: null });
                      setEditing(fields.length);
                    }}
                  />
                )}
                <TierStatus
                  {...(crossError ? { error: crossError } : {})}
                  {...(!crossError && tiersComplete ? { ok: t('tierOk') } : {})}
                />
                <TierEditSheet
                  control={control}
                  index={editing}
                  tierLabel={editing == null ? '' : t('tierName', { index: editing + 1 })}
                  disabled={disabled}
                  onClose={() => {
                    // Bậc vừa thêm mà đóng khi còn trống hết ⇒ bỏ luôn, không để một dòng rỗng.
                    const current = editing == null ? null : tiers[editing];
                    if (editing != null && current?.toKm == null && current?.fee == null) remove(editing);
                    setEditing(null);
                  }}
                />
              </YStack>
            ) : (
            <YStack gap={space.sm}>
              <GroupLabel label={t('tiers')} hint={t('fromKmTip')} />

              {fields.map((row, index) => {
                const from = index === 0 ? '0' : `> ${tiers[index - 1]?.toKm ?? '-'}`;
                const to = tiers[index]?.toKm ?? '-';
                return (
                  <TierCard
                    key={row.id}
                    tone={TONE.delivery}
                    index={index}
                    title={t('tierName', { index: index + 1 })}
                    badge={`${from} - ${to} ${t('unitKm')}`}
                    removeLabel={t('removeTierAt', { index: index + 1 })}
                    disabled={disabled}
                    onRemove={() => remove(index)}
                  >
                    <NumberField
                      control={control}
                      name={`deliveryTiers.${index}.toKm`}
                      label={t('toKmLabel')}
                      required
                      suffix={t('unitKm')}
                      min={0}
                      editable={!disabled}
                    />
                    {/* Mỗi bậc MỘT phí trọn gói — phí theo km đã gỡ (ADR 0078), như web. */}
                    <MoneyField
                      control={control}
                      name={`deliveryTiers.${index}.fee`}
                      label={t('feeLabel')}
                      // Cùng luật "miễn phí" với dòng tóm tắt khách thấy (@xeprime/domain) — y như web.
                      hint={isFreeDeliveryFee(tiers[index]?.fee) ? t('free') : undefined}
                      editable={!disabled}
                    />
                  </TierCard>
                );
              })}

              {disabled ? null : (
                <AddTierButton
                  label={t('addTier')}
                  tone={TONE.delivery}
                  disabled={false}
                  /* Bậc mới luôn RỖNG: mốc bắt đầu của nó là mốc kết thúc của bậc trước và được
                     suy ra lúc vẽ, nên không có gì để điền sẵn. Giống `append` của web. */
                  onPress={() => append({ toKm: null, fee: null })}
                />
              )}

              <TierStatus
                {...(crossError ? { error: crossError } : {})}
                {...(!crossError && tiersComplete ? { ok: t('tierOk') } : {})}
              />
            </YStack>
            )}

            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label={t('maxRadiusLabel')}
              hint={t('maxRadiusHint')}
              suffix={t('unitKm')}
              min={0}
              required
              editable={!disabled}
            />

            {/* Câu khách đặt sẽ đọc — dựng bằng `deliverySummaryText` dùng chung với web, nên
                hai bên không thể mô tả cùng một cấu hình theo hai kiểu. Bản v2 (`headless` - màn
                Bảo hiểm & Giao nhận xe, tab Giao nhận của Chính sách thuê) bỏ khối này: các dòng
                tóm tắt bậc đã nói đủ (người dùng chốt 27/11/2026). */}
            {tiersComplete && !headless ? (
              <Callout tone="info" title={t('previewTitle')}>
                {deliverySummaryText(
                  { deliveryTiers: tiers, deliveryMaxRadiusKm: maxRadiusKm },
                  {
                    money: fmt.money,
                    free: t('free'),
                    quote: t('summaryQuote'),
                    perKm: (amount) => t('perKmSummary', { amount }),
                  },
                )}
              </Callout>
            ) : null}
          </>
        ) : (
          <IconLine icon="power-outline">{t('disabledNote')}</IconLine>
        )}
      </YStack>
    </SectionShell>
  );
}

/**
 * HẠN MỨC QUÃNG ĐƯỜNG của chuyến tự lái — một công tắc, hai ô đi CẶP.
 *
 * Cùng hình dạng và cùng mã lỗi với bước "Cho thuê" của wizard đăng xe nhanh
 * (`QuickVehicleRentalStep`): hai màn hỏi cùng một chính sách thì phải hỏi giống nhau, nếu
 * không chủ xe sẽ thấy hai bộ luật cho một con số.
 *
 * Bật/tắt là trường của FORM, không phải của API. Backend chỉ biết "cả hai null = không giới
 * hạn" (`formToSaveInput` dịch qua lại), nên thiếu công tắc thì "đã tắt" và "mới nhập được một
 * nửa" trông y hệt nhau trên màn hình.
 *
 * Phí vượt KHÔNG cộng vào báo giá lúc đặt — lúc đó chưa ai biết khách sẽ chạy bao xa. Nó chỉ
 * thành một khoản ĐỀ XUẤT lúc quyết toán, và chủ xe vẫn phải bấm ghi. Dòng xem trước nói đúng
 * câu mà khách sẽ đọc trên trang xe, nên chủ xe thấy được hệ quả trước khi lưu.
 */
/**
 * Một bậc giao xe dạng dòng tóm tắt (Figma "Discount Toggle" `24231:111519`): "Bán kính: 0 - 3 km" /
 * "Phí giao xe: Miễn phí" (xanh) hoặc số tiền; nút xoá + sửa 20 bên phải. Sửa mở `TierEditSheet`.
 */
function TierSummaryRow({
  from,
  to,
  fee,
  removeLabel,
  editLabel,
  disabled,
  onRemove,
  onEdit,
}: {
  from: string;
  to: number | null;
  fee: number | null;
  removeLabel: string;
  editLabel: string;
  disabled: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.pricing.delivery');
  const fmt = useAppFormat();
  const free = isFreeDeliveryFee(fee);
  return (
    <EditableSummaryRow
      lines={[
        { label: t('rowRadius'), value: `${from} - ${to ?? '-'} ${t('unitKm')}` },
        fee == null
          ? { label: t('rowFee'), value: '-' }
          : {
              label: t('rowFee'),
              value: free ? t('free') : fmt.money(String(fee)),
              ...(free ? { tone: colors.success } : {}),
            },
      ]}
      removeLabel={removeLabel}
      editLabel={editLabel}
      disabled={disabled}
      onRemove={onRemove}
      onEdit={onEdit}
    />
  );
}

interface SummaryLine {
  label: string;
  value: string;
  /** Màu chữ giá trị (vd. "Miễn phí" xanh); vắng = chữ thường đậm. */
  tone?: string;
}

/**
 * Khung dòng tóm tắt v2 (Figma "Discount Toggle" `24231:111519`): các cặp "Nhãn: giá trị" bên trái,
 * nút xoá + sửa 20 bên phải. Dùng cho bậc giao xe và mốc ưu đãi dài hạn.
 */
function EditableSummaryRow({
  lines,
  removeLabel,
  editLabel,
  disabled,
  onRemove,
  onEdit,
}: {
  lines: readonly SummaryLine[];
  removeLabel: string;
  editLabel: string;
  disabled: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();
  const line = ({ label, value, tone }: SummaryLine) => (
    <XStack f={1} minWidth={0} gap={space.xs} ai="center">
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {label}
      </Text>
      <Text
        f={1}
        minWidth={0}
        numberOfLines={1}
        col={tone ?? colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={tone ? fontWeight.medium : fontWeight.semibold}
      >
        {value}
      </Text>
    </XStack>
  );
  return (
    <XStack
      ai="center"
      gap={COMPACT_GAP}
      p={COMPACT_GAP}
      br={radius.control}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
    >
      <YStack f={1} minWidth={0} gap={6}>
        {lines.map((entry) => (
          <XStack key={entry.label}>{line(entry)}</XStack>
        ))}
      </YStack>
      {disabled ? null : (
        <>
          <Pressable onPress={onRemove} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={removeLabel}>
            <LineIcon name="trash" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={editLabel}>
            <LineIcon name="edit-2" size={20} color={colors.textMuted} />
          </Pressable>
        </>
      )}
    </XStack>
  );
}

/** Nút chữ có dấu + (Figma "Button" `24789:85089`): icon Add 20 + chữ 14 đậm vừa `text/brand/primary-2`. */
function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={space.xs}>
      <XStack ai="center" gap={6} alignSelf="flex-start">
        <LineIcon name="add" size={20} color={colors.brandLink} />
        <Text
          col={colors.brandLink}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/** Tấm trượt sửa MỘT bậc giao xe - hai ô của bậc, ghi thẳng vào form (Lưu thay đổi mới gửi đi). */
function TierEditSheet({
  control,
  index,
  tierLabel,
  disabled,
  onClose,
}: {
  control: PolicyControl;
  index: number | null;
  tierLabel: string;
  disabled: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles.pricing.delivery');
  const tActions = useTranslations('Common.actions');
  return (
    <BottomSheet
      open={index != null}
      onClose={onClose}
      title={tierLabel}
      footer={<Button label={tActions('done')} variant="gradient" onPress={onClose} />}
    >
      {index == null ? null : (
        <YStack gap={COMPACT_GAP}>
          <NumberField
            control={control}
            name={`deliveryTiers.${index}.toKm`}
            label={t('toKmLabel')}
            required
            suffix={t('unitKm')}
            min={0}
            editable={!disabled}
          />
          <MoneyField
            control={control}
            name={`deliveryTiers.${index}.fee`}
            label={t('feeLabel')}
            editable={!disabled}
          />
        </YStack>
      )}
    </BottomSheet>
  );
}

/** Khoảng cách giữa các hàng trong thẻ v2 - Figma "Nhóm thông tin" gap 12. */
const COMPACT_GAP = 12;
/** Figma "_Select input base" Mức giảm của một mốc ưu đãi: rộng 81. */
const DISCOUNT_PERCENT_WIDTH = 81;

/** Hạn mức quãng đường dạng hàng công tắc v2 - xem `compact` của `PolicySections`. */
function CompactMileage({ control, disabled }: { control: PolicyControl; disabled: boolean }) {
  const t = useTranslations('Vehicles.pricing.mileage');
  const tWorkspace = useTranslations('Shop.policies.workspace.mileage');
  return (
    <Controller
      control={control}
      name="mileageLimitEnabled"
      render={({ field }) => (
        <YStack gap={COMPACT_GAP}>
          <SwitchRow
            title={t('title')}
            description={tWorkspace('hint')}
            descriptionSize="body"
            value={field.value === true}
            disabled={disabled}
            onChange={(next) => field.onChange(next)}
          />
          {field.value === true ? (
            <>
              <NumberField
                control={control}
                name="includedDistanceKmPerDay"
                label={t('includedLabel')}
                hint={t('includedHint')}
                suffix={t('unitPerDayApp')}
                integer
                min={MILEAGE_LIMIT.minKmPerDay}
                max={MILEAGE_LIMIT.maxKmPerDay}
                required
                editable={!disabled}
              />
              <MoneyField
                control={control}
                name="excessDistanceFeePerKm"
                label={t('excessLabel')}
                hint={t('excessHint')}
                unit={t('unitPerKmApp')}
                required
                editable={!disabled}
              />
            </>
          ) : null}
        </YStack>
      )}
    />
  );
}

/**
 * Hạn mức & phí trả xe quá giờ dạng hàng công tắc v2. Không có ô "Làm tròn tối thiểu" dù Figma vẽ:
 * ô đó đã gỡ 06/11/2026 (quyết toán luôn làm tròn LÊN theo giờ) - người dùng chốt không dựng lại.
 */
function CompactOvertime({ control, disabled }: { control: PolicyControl; disabled: boolean }) {
  const t = useTranslations('Vehicles.pricing.overtime');
  const tWorkspace = useTranslations('Shop.policies.workspace.overtime');
  return (
    <Controller
      control={control}
      name="overtimeEnabled"
      render={({ field }) => (
        <YStack gap={COMPACT_GAP}>
          <SwitchRow
            title={tWorkspace('title')}
            description={tWorkspace('hintApp')}
            descriptionSize="body"
            value={field.value === true}
            disabled={disabled}
            onChange={(next) => field.onChange(next)}
          />
          {field.value === true ? (
            <>
              <MoneyField
                control={control}
                name="overtimeFeePerHour"
                label={t('feePerHourApp')}
                hint={t('feePerHourHint')}
                placeholder={t('placeholder')}
                required
                editable={!disabled}
              />
              <NumberField
                control={control}
                name="overtimeGraceMinutes"
                integer
                min={0}
                label={tWorkspace('grace')}
                hint={t('graceMinutesHint')}
                placeholder={t('placeholder')}
                suffix={t('unitMinutes')}
                editable={!disabled}
              />
            </>
          ) : null}
        </YStack>
      )}
    />
  );
}

function MileageSection({
  control,
  disabled,
  step,
  title,
  hint,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Tiêu đề do nơi gọi đặt (web `MileagePolicySection title`). */
  title?: string;
  /** Câu mô tả do nơi gọi đặt - màn gian hàng dùng `workspace.mileage.hint` như web `LimitBlocks`. */
  hint?: string;
}) {
  const colors = useColors();
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.mileage');
  const fmt = useAppFormat();
  const enabled = useWatch({ control, name: 'mileageLimitEnabled' });
  const includedKm = useWatch({ control, name: 'includedDistanceKmPerDay' });
  const feePerKm = useWatch({ control, name: 'excessDistanceFeePerKm' });

  return (
    <SectionShell>
      <YStack gap={space.md}>
        <SectionHead
          tone={TONE.mileage}
          title={step(3, title ?? t('title'))}
          hint={hint ?? t('hint')}
          toggle={
            <Controller
              control={control}
              name="mileageLimitEnabled"
              render={({ field }) => (
                <PolicySwitch
                  label={t('title')}
                  checked={field.value === true}
                  disabled={disabled}
                  onToggle={() => field.onChange(!field.value)}
                />
              )}
            />
          }
        />

        {enabled ? (
          <>
            <NumberField
              control={control}
              name="includedDistanceKmPerDay"
              label={t('includedLabel')}
              hint={t('includedHint')}
              suffix={t('unitPerDayApp')}
              integer
              min={MILEAGE_LIMIT.minKmPerDay}
              max={MILEAGE_LIMIT.maxKmPerDay}
              required
              editable={!disabled}
            />
            <MoneyField
              control={control}
              name="excessDistanceFeePerKm"
              label={t('excessLabel')}
              hint={t('excessHint')}
              unit={t('unitPerKmApp')}
              required
              editable={!disabled}
            />

            {/* Đúng câu khách sẽ đọc trên trang xe — chủ xe thấy hệ quả trước khi lưu. */}
            <YStack gap={2} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
              <Text col={colors.placeholder} fos={fontSize.label} fow={fontWeight.semibold}>
                {t('previewTitle')}
              </Text>
              <Text col={colors.text} fos={fontSize.bodySm}>
                {includedKm != null && feePerKm != null
                  ? t('preview', { km: fmt.km(includedKm), fee: fmt.money(String(feePerKm)) })
                  : t('previewIncomplete')}
              </Text>
            </YStack>
          </>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('disabledNote')}
          </Text>
        )}
      </YStack>
    </SectionShell>
  );
}

function OvertimeSection({
  control,
  disabled,
  step,
  withToggle,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /**
   * Công tắc "Hạn mức & phí trả xe quá giờ" — chỉ màn chính sách GIAN HÀNG có (web, 06/11/2026). Là
   * trường của FORM (`overtimeEnabled`): tắt ⇒ `formToSaveInput` gửi null cả phí lẫn thời gian miễn
   * phí. Màn ghi đè theo xe không có công tắc nên `overtimeEnabled` để trống, không luật nào đổi.
   */
  withToggle?: boolean;
}) {
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.overtime');
  const tWorkspace = useTranslations('Shop.policies.workspace.overtime');
  const fmt = useAppFormat();
  const fee = useWatch({ control, name: 'overtimeFeePerHour' });
  const enabled = useWatch({ control, name: 'overtimeEnabled' });
  const showFields = !withToggle || enabled === true;

  return (
    <SectionShell>
      <YStack gap={space.md}>
        <SectionHead
          tone={TONE.overtime}
          title={step(4, withToggle ? tWorkspace('title') : t('title'))}
          hint={withToggle ? tWorkspace('hintApp') : t('hintRounded')}
          {...(withToggle
            ? {
                toggle: (
                  <Controller
                    control={control}
                    name="overtimeEnabled"
                    render={({ field }) => (
                      <PolicySwitch
                        label={tWorkspace('title')}
                        checked={field.value === true}
                        disabled={disabled}
                        onToggle={() => field.onChange(!field.value)}
                      />
                    )}
                  />
                ),
              }
            : {})}
        />

        {showFields ? (
          <>
            <MoneyField
              control={control}
              name="overtimeFeePerHour"
              label={t('feePerHourApp')}
              hint={t('feePerHourHint')}
              placeholder={t('placeholder')}
              {...(withToggle ? { required: true } : {})}
              editable={!disabled}
            />
            <NumberField
              control={control}
              name="overtimeGraceMinutes"
              integer
              min={0}
              label={withToggle ? tWorkspace('grace') : t('graceMinutes')}
              hint={t('graceMinutesHint')}
              placeholder={t('placeholder')}
              suffix={t('unitMinutes')}
              editable={!disabled}
            />
            {/*
              Ô "làm tròn tối thiểu" đã gỡ (06/11/2026, như web): quyết toán luôn làm tròn LÊN theo giờ
              và form luôn gửi `overtimeRoundingMinutes = null`. Công thức dưới nói thẳng điều đó.
            */}
            <NotePanel
              tone={TONE.overtime}
              icon="calculator-outline"
              title={t('formulaTitle')}
              body={
                fee == null
                  ? t('formulaNone')
                  : t('formulaRounded', { fee: fmt.money(String(fee)) })
              }
            />
          </>
        ) : null}
      </YStack>
    </SectionShell>
  );
}

/**
 * Ưu đãi cam kết dài hạn — mốc theo THÁNG LỊCH, và mốc phải là một GÓI hợp lệ (ADR 0011), không
 * phải số tháng tự do. Vì thế ô chọn là menu gói, không phải ô nhập số.
 */
function LongTermDiscountSection({
  control,
  disabled,
  step,
  legacyTiers,
  byTiers,
  headless = false,
  compact = false,
  weekdayPrice,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  legacyTiers?: readonly LegacyTierView[];
  /**
   * Xem `PolicySections.compact` - Figma `24789:85352`: mỗi mốc một khung sửa tại chỗ ("Gói thuê từ:
   * 1 tháng ▾" + xoá, rồi Mức giảm · Ghi chú), cuối là khung "Công thức tính giá gói".
   */
  compact?: boolean;
  /** Giá ngày thường của xe - có thì khung công thức nói khoảng giá tháng đề xuất (màn sửa xe). */
  weekdayPrice?: number | string | null | undefined;
  /** Thẻ nơi gọi đã có tiêu đề (tab Ưu đãi dài hạn, Figma `24789:85350`) - bỏ đầu khối lặp. */
  headless?: boolean;
  /**
   * Màn chính sách GIAN HÀNG (web 06/11/2026): không còn công tắc — có mốc là đang bật, xoá hết là
   * tắt (`discountEnabled` đi theo số mốc). Màn ghi đè theo xe giữ công tắc như web.
   */
  byTiers?: boolean;
}) {
  const colors = useColors();
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.longTermDiscount');
  const tWorkspace = useTranslations('Shop.policies.workspace.longTerm');
  const tUnits = useTranslations('Common.units');
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const enabledField = useController({ control, name: 'discountEnabled' });
  // Có mốc ⇔ đang bật — một nguồn sự thật cho cờ mà màn này không còn vẽ công tắc (như web).
  const syncEnabled = (count: number) => {
    if (byTiers) enabledField.field.onChange(count > 0);
  };
  /* Cùng cặp `useWatch` + `useFieldArray` với khối giao nhận — xem chú thích ở đó. */
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });
  const { errors } = useFormState({ control, name: 'discountTiers' });

  /*
   * Mỗi gói chỉ được đặt MỘT mốc: gói đã dùng ở dòng khác biến mất khỏi menu của dòng này (trừ
   * chính giá trị đang chọn, nếu không ô sẽ hiện trống khi mở lại). Cùng luật với `optionsFor`
   * bên web, và cùng luật với `discountDuplicate` của schema — chặn ở menu thì người dùng không
   * bao giờ chạm tới câu lỗi đó.
   */
  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (month) =>
        month === tiers[index]?.minMonths || !tiers.some((tier) => tier?.minMonths === month),
    ).map((month) => ({ value: String(month), label: tUnits('month', { count: month }) }));

  /* Hết gói chưa dùng thì không còn mốc nào để thêm — nút tắt thay vì thêm một dòng vô nghiệm. */
  const nextUnusedMonths =
    LONG_TERM_PACKAGE_MONTHS.find((month) => !tiers.some((tier) => tier?.minMonths === month)) ??
    null;

  const crossError = arrayErrorOf(errors.discountTiers);

  const legacyCallout = legacyTiers?.length ? (
    <Callout tone="warning" title={t('legacyTitle', { count: legacyTiers.length })}>
      {`${legacyTiers
        .map((tier) => t('legacyTier', { days: tier.minDays, percent: tier.percent }))
        .join(LIST_SEPARATOR)}\n${t('legacyBody')}`}
    </Callout>
  ) : null;

  if (compact) {
    return (
      <YStack gap={COMPACT_GAP}>
        {byTiers ? null : (
          <Controller
            control={control}
            name="discountEnabled"
            render={({ field }) => (
              <SwitchRow
                title={t('title')}
                titleHint={{ label: t('tipLabel'), content: t('hint') }}
                description={t('leadApp')}
                value={field.value === true}
                disabled={disabled}
                onChange={(next) => field.onChange(next)}
              />
            )}
          />
        )}
        {byTiers && !enabled && fields.length > 0 ? (
          <Callout tone="warning" title={tWorkspace('inactive')} />
        ) : null}
        {enabled || byTiers ? (
          <>
            {byTiers && fields.length === 0 ? (
              <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {tWorkspace('empty')}
              </Text>
            ) : null}
            {fields.map((row, index) => (
              /* Figma "Discount Toggle" `24789:85353`: khung viền bo 12, đệm 12, sửa tại chỗ. */
              <YStack
                key={row.id}
                p={COMPACT_GAP}
                gap={COMPACT_GAP}
                br={radius.control}
                bw={1}
                bc={colors.border}
                bg={colors.surface}
              >
                <XStack ai="center" gap={space.sm}>
                  <YStack f={1} minWidth={0}>
                    {/* `Controller` trên đúng ô `minMonths` - `update()` thay cả dòng làm ô ghi chú mất focus. */}
                    <Controller
                      control={control}
                      name={`discountTiers.${index}.minMonths`}
                      render={({ field, fieldState }) => (
                        <SelectControl
                          inline
                          label={t('packageFromLabel')}
                          value={field.value == null ? null : String(field.value)}
                          options={optionsFor(index)}
                          placeholder={t('selectPackage')}
                          disabled={disabled}
                          {...(fieldState.error?.message ? { error: fieldState.error.message } : {})}
                          onChange={(next) => field.onChange(Number(next))}
                        />
                      )}
                    />
                  </YStack>
                  {disabled ? null : (
                    <Pressable
                      onPress={() => {
                        remove(index);
                        syncEnabled(fields.length - 1);
                      }}
                      hitSlop={space.sm}
                      accessibilityRole="button"
                      accessibilityLabel={t('removeTierAt', { index: index + 1 })}
                    >
                      <LineIcon name="trash" size={20} color={colors.textMuted} />
                    </Pressable>
                  )}
                </XStack>
                <XStack gap={COMPACT_GAP} ai="flex-start">
                  <YStack w={DISCOUNT_PERCENT_WIDTH}>
                    <NumberField
                      control={control}
                      name={`discountTiers.${index}.percent`}
                      percent
                      label={t('percentShort')}
                      editable={!disabled}
                    />
                  </YStack>
                  <YStack f={1} minWidth={0}>
                    <TextField
                      control={control}
                      name={`discountTiers.${index}.note`}
                      label={t('tierNote')}
                      placeholder={t('notePlaceholder')}
                      editable={!disabled}
                    />
                  </YStack>
                </XStack>
              </YStack>
            ))}
            {disabled || nextUnusedMonths == null ? null : (
              <AddLink
                label={t('addTier')}
                onPress={() => {
                  append({ minMonths: nextUnusedMonths, percent: null, note: '' });
                  syncEnabled(fields.length + 1);
                }}
              />
            )}
            <TierStatus {...(crossError ? { error: crossError } : {})} />
            {legacyCallout}
            {/* Màn gian hàng (`byTiers`) không gắn xe nào ⇒ công thức chữ, như web (người dùng chốt 28/11/2026). */}
            <LongTermFormulaNotice weekdayPrice={byTiers ? null : weekdayPrice} />
          </>
        ) : null}
      </YStack>
    );
  }

  return (
    <SectionShell>
      <YStack gap={space.md}>
        {headless && byTiers ? null : (
        <SectionHead
          tone={TONE.discount}
          title={step(5, t('title'))}
          hint={t('hint')}
          {...(byTiers
            ? {}
            : {
                toggle: (
                  <Controller
                    control={control}
                    name="discountEnabled"
                    render={({ field }) => (
                      <PolicySwitch
                        label={t('enable')}
                        checked={field.value === true}
                        disabled={disabled}
                        onToggle={() => field.onChange(!field.value)}
                      />
                    )}
                  />
                ),
              })}
        />
        )}

        {byTiers && !enabled && fields.length > 0 ? (
          <Callout tone="warning" title={tWorkspace('inactive')} />
        ) : null}

        {enabled || byTiers ? (
          <>
            <YStack gap={space.sm}>
              <GroupLabel label={t('tiers')} hint={t('packageTip')} />
              {byTiers && fields.length === 0 ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {tWorkspace('empty')}
                </Text>
              ) : null}

              {fields.map((row, index) => (
                <TierCard
                  key={row.id}
                  tone={TONE.discount}
                  index={index}
                  removeLabel={t('removeTierAt', { index: index + 1 })}
                  disabled={disabled}
                  onRemove={() => {
                    remove(index);
                    syncEnabled(fields.length - 1);
                  }}
                >
                  {/*
                    `Controller` trên ĐÚNG ô `minMonths`, không phải `useFieldArray.update()`.

                    `update` thay cả dòng nên React Hook Form cấp `id` mới cho nó, và cả ba ô của
                    dòng bị gắn lại — chọn gói xong là ô ghi chú đang gõ mất focus và mất luôn
                    con trỏ. Web đặt một `SelectField` cho riêng trường này; đây là bản native của
                    đúng cách đó.
                  */}
                  <Controller
                    control={control}
                    name={`discountTiers.${index}.minMonths`}
                    render={({ field, fieldState }) => (
                      <SelectControl
                        label={t('tierMonths')}
                        value={field.value == null ? null : String(field.value)}
                        options={optionsFor(index)}
                        placeholder={t('selectPackage')}
                        required
                        {...(fieldState.error?.message ? { error: fieldState.error.message } : {})}
                        onChange={(next) => {
                          if (disabled) return;
                          field.onChange(Number(next));
                        }}
                      />
                    )}
                  />
                  <NumberField
                    control={control}
                    name={`discountTiers.${index}.percent`}
                    percent
                    label={t('percentLabel')}
                    hint={t('percentTip')}
                    required
                    editable={!disabled}
                  />
                  {/* Ghi chú: chỗ gian hàng nhớ VÌ SAO đặt mốc này — web có, đừng bỏ. */}
                  <TextField multiline scrollable rows={3}
                    control={control}
                    name={`discountTiers.${index}.note`}
                    label={t('tierNote')}
                    hint={t('noteTip')}
                    placeholder={t('notePlaceholder')}
                    editable={!disabled}
                  />
                </TierCard>
              ))}

              {disabled ? null : (
                <AddTierButton
                  label={t('addTier')}
                  tone={TONE.discount}
                  disabled={nextUnusedMonths == null}
                  onPress={() => {
                    append({ minMonths: nextUnusedMonths, percent: null, note: '' });
                    syncEnabled(fields.length + 1);
                  }}
                />
              )}

              <TierStatus {...(crossError ? { error: crossError } : {})} />
            </YStack>

            {/*
              Mốc cũ theo NGÀY chưa quy được sang gói: chúng KHÔNG còn tính giá, và hệ thống cố ý
              không tự quy đổi — quy đổi ngầm là đổi giá bán mà chủ xe không biết. Nói ra để họ
              chọn lại theo gói rồi lưu.
            */}
            {legacyCallout}

            {/* Công thức giá gói — thiếu nó thì con số % ở trên không quy ra được tiền. */}
            <NotePanel
              tone={TONE.discount}
              icon="calculator-outline"
              title={t('formulaTitle')}
              body={t('formula')}
            />
          </>
        ) : (
          <IconLine icon="power-outline">{t('disabledNote')}</IconLine>
        )}
      </YStack>
    </SectionShell>
  );
}


/**
 * Hai khối của form chính sách dùng LẺ, ngoài bộ bốn khối của `PolicySections`.
 *
 * Không gian "Quản lý xe" tách chính sách thành hai màn riêng — "Giao xe tận nơi" và "Thủ tục cho
 * thuê" — và cả hai ghi vào CÙNG `PUT /vehicles/:id/pricing`. Chúng dùng lại đúng khối ở đây thay
 * vì dựng bảng bậc phí hay bộ chọn hình thức bảo đảm thứ hai: cùng luật, cùng câu chữ, cùng ràng
 * buộc chéo. Web giải cùng bài này bằng `DeliveryPolicySection` / `CollateralPolicySection`.
 *
 * Không đánh số bước: đứng một mình trên màn riêng thì "2." không còn chỉ về cái gì.
 */
const PLAIN_STEP: StepTitle = (_index, title) => title;

/**
 * Form GỌI hai khối này có thể rộng hơn `PolicyFormValues` — màn "Thủ tục cho thuê" trộn chính
 * sách với thiết lập dịch vụ trong cùng một `useForm`. `Control<T>` của React Hook Form bất biến
 * theo `T` (nó vừa đọc vừa ghi), nên một siêu tập không gán được cho `Control<PolicyFormValues>`
 * dù mọi trường cần thiết đều có mặt.
 *
 * Ràng buộc `T extends PolicyFormValues` ở chữ ký là thứ THẬT SỰ bảo đảm an toàn: form thiếu một
 * trường chính sách sẽ đỏ ngay tại nơi gọi. Phép ép kiểu bên trong chỉ để qua chỗ bất biến đó, và
 * nó nằm gọn ở một chỗ thay vì rải ở từng màn.
 */
type PolicyFormSuperset<T extends PolicyFormValues> = Control<T>;

export function DeliveryPolicySection<T extends PolicyFormValues>({
  control,
  disabled,
  bare = false,
  headless = false,
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
  /** Xem `DeliverySection.headless`. */
  headless?: boolean;
  /** Đã nằm trong một thẻ của nơi gọi (thẻ mục ADR 0112) - không dựng thẻ lồng thẻ. */
  bare?: boolean;
}) {
  return (
    <SectionShellContext.Provider value={bare}>
      <DeliverySection
        control={control as unknown as PolicyControl}
        disabled={disabled}
        step={PLAIN_STEP}
        headless={headless}
      />
    </SectionShellContext.Provider>
  );
}

export function CollateralPolicySection<T extends PolicyFormValues>({
  control,
  disabled,
  title,
  optionDescriptions,
  bare = false,
  headless = false,
  hint,
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
  /** Thẻ nơi gọi đã có tiêu đề + mô tả (màn sửa xe ADR 0112) - bỏ đầu khối lặp lại. */
  headless?: boolean;
  /** Phạm vi ảnh hưởng của mức cọc ("N xe đang dùng mức cọc này") - màn gian hàng. */
  hint?: string;
  /**
   * Tiêu đề do NƠI GỌI đặt. Cùng khối này đứng ở hai ngữ cảnh: màn chính sách gian hàng gọi nó là
   * "Tiền cọc / thế chấp", còn màn Thủ tục cho thuê của một xe gọi là "Tài sản thế chấp".
   */
  title?: string;
  /** Mô tả từng chế độ do nơi gọi truyền để nói đúng ngữ cảnh (gian hàng vs một xe). */
  optionDescriptions?: Partial<Record<string, string>>;
  /** Đã nằm trong một thẻ của nơi gọi (thẻ mục ADR 0112) - không dựng thẻ lồng thẻ. */
  bare?: boolean;
}) {
  return (
    <SectionShellContext.Provider value={bare}>
      <DepositSection
        control={control as unknown as PolicyControl}
        disabled={disabled}
        step={PLAIN_STEP}
        {...(title === undefined ? {} : { title })}
        {...(optionDescriptions === undefined ? {} : { optionDescriptions })}
        headless={headless}
        {...(hint ? { hint } : {})}
      />
    </SectionShellContext.Provider>
  );
}

/** Ưu đãi dài hạn theo mốc đứng một mình (tab Ưu đãi dài hạn của Chính sách thuê) - đầu khối do nơi gọi vẽ. */
export function LongTermDiscountPolicySection<T extends PolicyFormValues>({
  control,
  disabled,
  legacyTiers,
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
  legacyTiers?: readonly LegacyTierView[] | undefined;
}) {
  return (
    <SectionShellContext.Provider value>
      <LongTermDiscountSection
        control={control as unknown as PolicyControl}
        disabled={disabled}
        step={PLAIN_STEP}
        {...(legacyTiers ? { legacyTiers } : {})}
        byTiers
        headless
        compact
      />
    </SectionShellContext.Provider>
  );
}

/**
 * Hạn mức quãng đường đứng MỘT MÌNH — dùng ở màn "Thủ tục cho thuê" của một chiếc xe.
 *
 * Nó là một ĐIỀU KHOẢN công bố với khách (hiện ngay cạnh hình thức bảo đảm trên trang xe, và
 * đóng băng vào đơn lúc đặt), nên thuộc màn đó chứ không phải một màn quản lý thứ sáu.
 *
 * Nơi gọi khoá nó sau CÙNG nút "Tuỳ chỉnh" với khối bảo đảm, và đó không phải sự lười: lưu ở màn
 * ấy gửi `PUT /vehicles/:id/pricing` với `source: vehicle` và TOÀN BỘ chính sách. Một cú gạt
 * công tắc hạn mức trên chiếc xe đang KẾ THỪA sẽ ghi xuống một bản sao đóng băng của
 * cọc/giao nhận/quá giờ/ưu đãi, và chiếc xe đó âm thầm ngừng nhận mọi thay đổi chính sách của
 * gian hàng về sau. Tách hạn mức ra khỏi bản ghi đè là một quyết định khác (cần cột riêng trên
 * `vehicles`), không phải hệ quả của một công tắc.
 */
export function MileagePolicySection<T extends PolicyFormValues>({
  control,
  disabled,
  title,
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
  title?: string;
}) {
  return (
    <MileageSection
      control={control as unknown as PolicyControl}
      disabled={disabled}
      step={PLAIN_STEP}
      {...(title === undefined ? {} : { title })}
    />
  );
}
