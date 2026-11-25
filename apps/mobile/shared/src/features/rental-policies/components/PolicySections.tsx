import { Ionicons } from '@/components/icons/Ionicons';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
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
  COLLATERAL_MODE,
  type CollateralMode,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  MILEAGE_LIMIT,
  VEHICLE_TYPE,
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
import { CheckOption, RadioOption } from '@/components/ui/RadioOption';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextField } from '@/components/ui/TextField';
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
} from '@/theme/tokens';
import type { PolicyFormValues } from '../schema';
import { LongTermPackagePreview } from './LongTermPackagePreview';

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
}: {
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
  const shopCollateral = shopWorkspace
    ? {
        title: tCollateral('title'),
        optionDescriptions: {
          [COLLATERAL_MODE.CASH]: tCollateral('modeCash'),
          [COLLATERAL_MODE.NONE]: tCollateral('modeNone'),
        },
      }
    : {};
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
      withToggle={Boolean(shopWorkspace)}
    />
  ) : null;
  const discount = shown.includes(POLICY_BLOCK.DISCOUNT) ? (
    <LongTermDiscountSection
      control={control}
      disabled={disabled}
      step={step}
      legacyTiers={legacyDiscountTiers}
      byTiers={Boolean(shopWorkspace)}
      {...(shopWorkspace ? { exampleVehicleType: shopWorkspace.vehicleType } : {})}
    />
  ) : null;

  /*
   * Màn chính sách GIAN HÀNG gom như web `ShopPolicyForm` (user chốt 12/11/2026): ba thẻ "Thủ tục &
   * Điều khoản" (bảo đảm + quãng đường + quá giờ) · "Giao nhận xe" (giao xe + thời gian chết) · "Ưu
   * đãi dài hạn". Khối con bỏ thẻ riêng và bỏ số thứ tự. Màn giá theo xe giữ năm khối đánh số.
   */
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

/**
 * Chế độ bảo đảm → khoá câu mô tả.
 *
 * Khai tường minh chứ không ghép chuỗi từ mã: ghép chuỗi thì thêm một chế độ mới là khoá thiếu
 * âm thầm, còn bảng này để TypeScript bắt ngay.
 */
const MODE_HINT_KEY: Record<CollateralMode, 'modeCash' | 'modeAsset' | 'modeNone'> = {
  [COLLATERAL_MODE.CASH]: 'modeCash',
  [COLLATERAL_MODE.ASSET]: 'modeAsset',
  [COLLATERAL_MODE.NONE]: 'modeNone',
};

function DepositSection({
  control,
  disabled,
  step,
  hint,
  title,
  optionDescriptions,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Phạm vi ảnh hưởng của mức cọc đang sửa — chỉ màn chính sách gian hàng truyền vào. */
  hint?: string;
  /** Xem docblock ở `CollateralPolicySection`. */
  title?: string;
  optionDescriptions?: Partial<Record<string, string>>;
}) {
  const colors = useColors();
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.deposit');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' });

  return (
    <SectionShell>
      <YStack gap={space.md}>
        <SectionHead tone={TONE.deposit} title={step(1, title ?? t('title'))} hint={t('hint')} />

        <Controller
          control={control}
          name="collateralMode"
          render={({ field }) => (
            <YStack gap={space.xs}>
              <FieldLabel label={t('mode')} required />
              {/*
                Mỗi lựa chọn có MỘT CÂU nói nó là gì — đúng `description` của
                `COLLATERAL_MODE_OPTIONS` bên web.

                Ba cái tên trần ("Cọc tiền", "Tài sản thế chấp", "Miễn thế chấp") không nói được
                tiền có hoàn lại không, gian hàng có giữ tiền không, hay xe sẽ mang nhãn gì trên
                sàn — mà đó mới là thứ chủ xe cần để chọn.
              */}
              {COLLATERAL_MODE_VALUES.map((value) => (
                <RadioOption
                  key={value}
                  label={domainLabel('collateralMode', value)}
                  hint={optionDescriptions?.[value] ?? t(MODE_HINT_KEY[value])}
                  checked={field.value === value}
                  disabled={disabled}
                  onPress={() => field.onChange(value)}
                />
              ))}
            </YStack>
          )}
        />

        {mode === COLLATERAL_MODE.CASH ? (
          <YStack gap={space.xs}>
            <MoneyField
              control={control}
              name="depositAmount"
              label={t('amount')}
              hint={t('amountHint')}
              required
              editable={!disabled}
            />
            {/* Màu nhấn thương hiệu, không phải chữ mờ: đây là PHẠM VI ẢNH HƯỞNG của con số vừa
                gõ (`styles.depositHint` bên web cũng tô `primary-active`), không phải một chú
                thích để lướt qua. */}
            {hint ? (
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {hint}
              </Text>
            ) : null}
          </YStack>
        ) : null}

        {mode === COLLATERAL_MODE.ASSET ? (
          <Controller
            control={control}
            name="collateralAssetTypes"
            render={({ field, fieldState }) => {
              const selected = field.value ?? [];
              return (
                <YStack gap={space.xs}>
                  <FieldLabel label={t('assetTypes')} required />
                  {/*
                    Cùng khung với ba lựa chọn "Hình thức bảo đảm" ngay trên, chỉ khác dấu:
                    VUÔNG vì chọn được nhiều loại tài sản (web dùng `Checkbox.Group`).

                    Trước đây là dải chip. Chip đọc ra là bộ lọc, và nằm ngay dưới một hàng
                    lựa chọn khung-viền thì cùng một khối có hai kiểu chọn khác hẳn nhau.
                  */}
                  {COLLATERAL_ASSET_TYPE_VALUES.map((value) => (
                    <CheckOption
                      key={value}
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
                  {/* Lỗi thắng gợi ý — đúng `help` của `CheckboxGroupField` bên web. */}
                  <FieldMessage
                    {...(fieldState.error?.message ? { error: fieldState.error.message } : {})}
                    hint={t('assetTypesHint')}
                  />
                </YStack>
              );
            }}
          />
        ) : null}

        {mode === COLLATERAL_MODE.NONE ? (
          <Callout tone="info" title={t('noneTitle')}>
            {t('noneBody')}
          </Callout>
        ) : null}
      </YStack>
    </SectionShell>
  );
}

function DeliverySection({
  control,
  disabled,
  step,
  title,
  hint,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Màn gian hàng: chữ `Shop.policies.workspace.delivery.service*` như web `DeliveryBlock`. */
  title?: string;
  hint?: string;
}) {
  const TONE = useTone();
  const t = useTranslations('Vehicles.pricing.delivery');
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

  const crossError = arrayErrorOf(errors.deliveryTiers);
  /* Bộ bậc "liền mạch" là quan hệ giữa NHIỀU dòng cộng với bán kính — cùng điều kiện với web. */
  const tiersComplete =
    tiers.length > 0 && tiers.every((tier) => tier?.toKm != null) && maxRadiusKm != null;

  return (
    <SectionShell>
      <YStack gap={space.md}>
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

        {enabled ? (
          <>
            {/*
              THỨ TỰ: bảng bậc TRƯỚC, bán kính SAU — đúng bố cục web.

              Bán kính là mốc phải KHỚP điểm kết thúc của bậc cuối (schema `covers-radius`), nên
              nó chỉ có nghĩa khi đã nhìn thấy các bậc. Đặt nó lên đầu như bản trước là bắt người
              dùng chốt giới hạn ngoài trước khi biết mình sẽ chia mấy khoảng, rồi quay lại sửa.
            */}
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
                hai bên không thể mô tả cùng một cấu hình theo hai kiểu. */}
            {tiersComplete ? (
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
              suffix={t('unitPerDay')}
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
              unit={t('unitPerKm')}
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
          hint={withToggle ? tWorkspace('hint') : t('hintRounded')}
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
              label={t('feePerHour')}
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
  exampleVehicleType,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  legacyTiers?: readonly LegacyTierView[];
  /**
   * Màn chính sách GIAN HÀNG (web 06/11/2026): không còn công tắc — có mốc là đang bật, xoá hết là
   * tắt (`discountEnabled` đi theo số mốc). Màn ghi đè theo xe giữ công tắc như web.
   */
  byTiers?: boolean;
  /** Có ⇒ khung "Khách sẽ thấy trên sàn" với giá tháng VÍ DỤ của loại xe này (web `ExamplePreview`). */
  exampleVehicleType?: VehicleType;
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

  return (
    <SectionShell>
      <YStack gap={space.md}>
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
            {legacyTiers?.length ? (
              <Callout tone="warning" title={t('legacyTitle', { count: legacyTiers.length })}>
                {`${legacyTiers
                  .map((tier) => t('legacyTier', { days: tier.minDays, percent: tier.percent }))
                  .join(LIST_SEPARATOR)}\n${t('legacyBody')}`}
              </Callout>
            ) : null}

            {/* Công thức giá gói — thiếu nó thì con số % ở trên không quy ra được tiền. */}
            <NotePanel
              tone={TONE.discount}
              icon="calculator-outline"
              title={t('formulaTitle')}
              body={t('formula')}
            />
            {exampleVehicleType ? (
              <ExamplePackagePreview control={control} vehicleType={exampleVehicleType} />
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
 * Giá tháng VÍ DỤ của khung xem trước trên màn chính sách gian hàng — gian hàng không có một giá
 * chung, nên preview cần một con số để hình dung. Chỉ là trạng thái hiển thị (không lưu, không gửi);
 * chủ xe sửa được ngay trong khung. Cùng số với web.
 */
const EXAMPLE_MONTHLY_PRICE: Readonly<Record<VehicleType, number>> = {
  [VEHICLE_TYPE.CAR]: 15_000_000,
  [VEHICLE_TYPE.MOTORBIKE]: 3_000_000,
};

function ExamplePackagePreview({
  control,
  vehicleType,
}: {
  control: PolicyControl;
  vehicleType: VehicleType;
}) {
  const [monthly, setMonthly] = useState<number | null>(EXAMPLE_MONTHLY_PRICE[vehicleType]);
  const tiers = useWatch({ control, name: 'discountTiers' });
  return <LongTermPackagePreview monthly={monthly} onMonthlyChange={setMonthly} tiers={tiers} />;
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
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
}) {
  return (
    <DeliverySection
      control={control as unknown as PolicyControl}
      disabled={disabled}
      step={PLAIN_STEP}
    />
  );
}

export function CollateralPolicySection<T extends PolicyFormValues>({
  control,
  disabled,
  title,
  optionDescriptions,
}: {
  control: PolicyFormSuperset<T>;
  disabled: boolean;
  /**
   * Tiêu đề do NƠI GỌI đặt. Cùng khối này đứng ở hai ngữ cảnh: màn chính sách gian hàng gọi nó là
   * "Tiền cọc / thế chấp", còn màn Thủ tục cho thuê của một xe gọi là "Tài sản thế chấp".
   */
  title?: string;
  /** Mô tả từng chế độ do nơi gọi truyền để nói đúng ngữ cảnh (gian hàng vs một xe). */
  optionDescriptions?: Partial<Record<string, string>>;
}) {
  return (
    <DepositSection
      control={control as unknown as PolicyControl}
      disabled={disabled}
      step={PLAIN_STEP}
      {...(title === undefined ? {} : { title })}
      {...(optionDescriptions === undefined ? {} : { optionDescriptions })}
    />
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
