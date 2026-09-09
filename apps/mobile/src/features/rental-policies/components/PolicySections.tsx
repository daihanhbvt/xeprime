import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  Controller,
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
} from '@xeprime/types';
import { deliverySummaryText, LIST_SEPARATOR } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
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
import {
  colors,
  fieldFontSize,
  fontSize,
  fontWeight,
  iconSize,
  radius,
  sizing,
  space,
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

const TONE = {
  deposit: { fg: colors.info, surface: colors.infoSurface, icon: 'shield-checkmark' },
  delivery: { fg: colors.primaryActive, surface: colors.primaryLight, icon: 'navigate' },
  overtime: { fg: colors.warning, surface: colors.warningSurface, icon: 'time' },
  discount: { fg: colors.success, surface: colors.successSurface, icon: 'pricetags' },
} as const satisfies Record<string, SectionTone>;

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
  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.sm}>
        <IconDisc icon={tone.icon} tone={tone.fg} filled />
        {/* `flexShrink` mặc định là 0 trong RN — thiếu `f={1}` thì tiêu đề dài đẩy công tắc ra
            khỏi thẻ thay vì tự xuống dòng. */}
        <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {title}
        </Text>
        {toggle}
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {hint}
      </Text>
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
  /** Câu giải thích dưới nhãn — `description` của `SwitchField` bên web. */
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
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
      <PolicySwitch label={label} checked={checked} disabled={disabled ?? false} onToggle={onToggle} />
    </XStack>
  );
}

/** Màu rãnh công tắc. `false` phải ĐẬM hơn nền thẻ, nếu không công tắc tắt nhìn như không có. */
const SWITCH_TRACK = { false: colors.borderInput, true: colors.primary };

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
export function PolicySections({
  control,
  disabled,
  numbered = true,
  depositHint,
  legacyDiscountTiers,
}: {
  control: PolicyControl;
  disabled: boolean;
  numbered?: boolean;
  depositHint?: string;
  legacyDiscountTiers?: readonly LegacyTierView[];
}) {
  const step = (index: number, title: string) => (numbered ? `${index}. ${title}` : title);

  return (
    <YStack gap={space.md}>
      <DepositSection control={control} disabled={disabled} step={step} hint={depositHint} />
      <DeliverySection control={control} disabled={disabled} step={step} />
      <OvertimeSection control={control} disabled={disabled} step={step} />
      <LongTermDiscountSection
        control={control}
        disabled={disabled}
        step={step}
        legacyTiers={legacyDiscountTiers}
      />
    </YStack>
  );
}

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
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  /** Phạm vi ảnh hưởng của mức cọc đang sửa — chỉ màn chính sách gian hàng truyền vào. */
  hint?: string;
}) {
  const t = useTranslations('Vehicles.pricing.deposit');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' });

  return (
    <Card>
      <YStack gap={space.md}>
        <SectionHead tone={TONE.deposit} title={step(1, t('title'))} hint={t('hint')} />

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
                  hint={t(MODE_HINT_KEY[value])}
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
    </Card>
  );
}

function DeliverySection({
  control,
  disabled,
  step,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
}) {
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
    <Card>
      <YStack gap={space.md}>
        <SectionHead
          tone={TONE.delivery}
          title={step(2, t('title'))}
          hint={t('hint')}
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
                const from = index === 0 ? '0' : `> ${tiers[index - 1]?.toKm ?? '—'}`;
                const to = tiers[index]?.toKm ?? '—';
                return (
                  <TierCard
                    key={row.id}
                    tone={TONE.delivery}
                    index={index}
                    title={t('tierName', { index: index + 1 })}
                    badge={`${from} – ${to} ${t('unitKm')}`}
                    removeLabel={t('removeTierAt', { index: index + 1 })}
                    disabled={disabled}
                    onRemove={() => remove(index)}
                  >
                    <NumberField
                      control={control}
                      name={`deliveryTiers.${index}.toKm`}
                      label={t('toKmLabel')}
                      suffix={t('unitKm')}
                      min={0}
                      editable={!disabled}
                    />
                    <MoneyField
                      control={control}
                      name={`deliveryTiers.${index}.fee`}
                      label={t('feeLabel')}
                      hint={tiers[index]?.fee ? undefined : t('free')}
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
                  { money: fmt.money, free: t('free'), quote: t('summaryQuote') },
                )}
              </Callout>
            ) : null}
          </>
        ) : (
          <IconLine icon="power-outline">{t('disabledNote')}</IconLine>
        )}
      </YStack>
    </Card>
  );
}

function OvertimeSection({
  control,
  disabled,
  step,
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
}) {
  const t = useTranslations('Vehicles.pricing.overtime');
  const fmt = useAppFormat();
  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <Card>
      <YStack gap={space.md}>
        <SectionHead tone={TONE.overtime} title={step(3, t('title'))} hint={t('hint')} />

        <MoneyField
          control={control}
          name="overtimeFeePerHour"
          label={t('feePerHour')}
          hint={t('feePerHourHint')}
          placeholder={t('placeholder')}
          editable={!disabled}
        />
        <NumberField
          control={control}
          name="overtimeGraceMinutes"
          integer
          min={0}
          label={t('graceMinutes')}
          hint={t('graceMinutesHint')}
          placeholder={t('placeholder')}
          suffix={t('unitMinutes')}
          editable={!disabled}
        />
        <NumberField
          control={control}
          name="overtimeRoundingMinutes"
          integer
          min={1}
          label={t('roundingMinutes')}
          hint={t('roundingMinutesHint')}
          placeholder={t('placeholder')}
          suffix={t('unitMinutes')}
          editable={!disabled}
        />

        {/*
          CÔNG THỨC, không phải một dòng gợi ý.

          Ba ô ở trên (phí/giờ, miễn phí, làm tròn) chỉ có nghĩa khi biết chúng ghép lại thành
          phép tính nào và tính ở BƯỚC NÀO. Thiếu dòng này thì chủ xe đặt số theo cảm tính rồi
          tranh cãi với khách ở bàn giao — đúng lúc không sửa được nữa.
        */}
        <NotePanel
          tone={TONE.overtime}
          icon="calculator-outline"
          title={t('formulaTitle')}
          body={fee == null ? t('formulaNone') : t('formula', { fee: fmt.money(String(fee)) })}
        />
      </YStack>
    </Card>
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
}: {
  control: PolicyControl;
  disabled: boolean;
  step: StepTitle;
  legacyTiers?: readonly LegacyTierView[];
}) {
  const t = useTranslations('Vehicles.pricing.longTermDiscount');
  const tUnits = useTranslations('Common.units');
  const enabled = useWatch({ control, name: 'discountEnabled' });
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
    <Card>
      <YStack gap={space.md}>
        <SectionHead
          tone={TONE.discount}
          title={step(4, t('title'))}
          hint={t('hint')}
          toggle={
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
          }
        />

        {enabled ? (
          <>
            <YStack gap={space.sm}>
              <GroupLabel label={t('tiers')} hint={t('packageTip')} />

              {fields.map((row, index) => (
                <TierCard
                  key={row.id}
                  tone={TONE.discount}
                  index={index}
                  removeLabel={t('removeTierAt', { index: index + 1 })}
                  disabled={disabled}
                  onRemove={() => remove(index)}
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
                        {...(fieldState.error?.message
                          ? { error: fieldState.error.message }
                          : {})}
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
                    editable={!disabled}
                  />
                  {/* Ghi chú: chỗ gian hàng nhớ VÌ SAO đặt mốc này — web có, đừng bỏ. */}
                  <TextField
                    control={control}
                    name={`discountTiers.${index}.note`}
                    label={t('tierNote')}
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
                  onPress={() =>
                    append({ minMonths: nextUnusedMonths, percent: null, note: '' })
                  }
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
          </>
        ) : (
          <IconLine icon="power-outline">{t('disabledNote')}</IconLine>
        )}
      </YStack>
    </Card>
  );
}
