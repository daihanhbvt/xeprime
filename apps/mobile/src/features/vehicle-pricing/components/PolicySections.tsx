import { Ionicons } from '@expo/vector-icons';
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
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { FieldLabel } from '@/components/ui/Field';
import { NumberField } from '@/components/ui/NumberField';
import { CheckOption, RadioOption } from '@/components/ui/RadioOption';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PolicyFormValues } from '../schema';

type PolicyControl = Control<PolicyFormValues>;

function SectionTitle({ children }: { children: string }) {
  return (
    <BlockTitle>{children}</BlockTitle>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
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
      <Switch
        value={checked}
        onValueChange={onToggle}
        disabled={disabled ?? false}
        accessibilityLabel={label}
        trackColor={SWITCH_TRACK}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.borderInput}
      />
    </XStack>
  );
}

/** Màu rãnh công tắc. `false` phải ĐẬM hơn nền thẻ, nếu không công tắc tắt nhìn như không có. */
const SWITCH_TRACK = { false: colors.borderInput, true: colors.primary };

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

/** Lỗi cấp MẢNG (bậc phải tăng dần, phải phủ hết bán kính…) — không gắn được vào ô nào. */
function ArrayError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text col={colors.danger} fos={fontSize.label}>
      {message}
    </Text>
  );
}

/** Nút chữ thêm/xoá một dòng bậc — không dùng `Button` vì nó chiếm trọn hàng. */
function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Bốn khối chính sách thuê — bảo đảm · giao nhận · quá giờ · ưu đãi dài hạn.
 *
 * Bản native của `PolicySections` bên web: cùng trường, cùng điều kiện hiện/ẩn, cùng schema
 * (`policyFormSchema` chép nguyên sang `../schema.ts`, kể cả ràng buộc chéo). Chỉ đổi cách vẽ —
 * `Switch` thành hàng bật/tắt, `Checkbox.Group` thành hàng chip, bảng bậc thành danh sách dòng.
 */
export function PolicySections({
  control,
  disabled,
}: {
  control: PolicyControl;
  disabled: boolean;
}) {
  return (
    <YStack gap={space.md}>
      <DepositSection control={control} disabled={disabled} />
      <DeliverySection control={control} disabled={disabled} />
      <OvertimeSection control={control} disabled={disabled} />
      <LongTermDiscountSection control={control} disabled={disabled} />
    </YStack>
  );
}

/**
 * Bảo đảm là thứ gian hàng giữ để phòng rủi ro: tiền cọc, tài sản/giấy tờ, hoặc không yêu cầu
 * gì. Đây là việc RIÊNG với đối chiếu giấy tờ tuỳ thân — đối chiếu thì lượt thuê nào cũng cần.
 */

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

function DepositSection({ control, disabled }: { control: PolicyControl; disabled: boolean }) {
  const t = useTranslations('Vehicles.pricing.deposit');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' });

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionTitle>{t('title')}</SectionTitle>
        <Hint>{t('hint')}</Hint>

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
          <MoneyField
            control={control}
            name="depositAmount"
            label={t('amount')}
            hint={t('amountHint')}
            required
            editable={!disabled}
          />
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
                  <ArrayError message={fieldState.error?.message} />
                  <Hint>{t('assetTypesHint')}</Hint>
                </YStack>
              );
            }}
          />
        ) : null}

        {mode === COLLATERAL_MODE.NONE ? (
          <YStack bg={colors.infoSurface} br={radius.sm} p={space.sm} gap={2}>
            <Text col={colors.info} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('noneTitle')}
            </Text>
            <Hint>{t('noneBody')}</Hint>
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}

function DeliverySection({ control, disabled }: { control: PolicyControl; disabled: boolean }) {
  const t = useTranslations('Vehicles.pricing.delivery');
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  /*
   * `useWatch` cho GIÁ TRỊ, `useFieldArray` cho THÊM/XOÁ — đúng cặp web dùng.
   *
   * Bản trước bọc cả mảng trong MỘT `Controller` và đọc `field.value`. `Controller` chỉ nghe
   * đúng tên nó đăng ký (`deliveryTiers`), không nghe con của nó; mà mỗi ô `toKm` lại là một
   * `useController` riêng ở tên `deliveryTiers.N.toKm`. Nên gõ "20" vào bậc 1 KHÔNG làm khối
   * này vẽ lại, và dòng "Từ …" của bậc 2 đứng im ở giá trị cũ — đúng lỗi bạn thấy.
   */
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });
  const { errors } = useFormState({ control, name: 'deliveryTiers' });

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionTitle>{t('title')}</SectionTitle>
        <Hint>{t('hint')}</Hint>

        <Controller
          control={control}
          name="deliveryEnabled"
          render={({ field }) => (
            <ToggleRow
              label={t('enable')}
              checked={field.value === true}
              disabled={disabled}
              onToggle={() => field.onChange(!field.value)}
            />
          )}
        />

        {enabled ? (
          <>
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              integer
              label={t('maxRadiusLabel')}
              hint={t('maxRadiusHint')}
              suffix="km"
              required
              editable={!disabled}
            />

            <YStack gap={space.xs}>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                      {t('tiers')}
                    </Text>
                    {/*
                      MỘT BẬC = MỘT Ô, ba phần xếp dọc: tên bậc + nút xoá · khoảng cách · phí.

                      Bản trước nhét cả bốn thứ vào một hàng ngang và phải kê `pb={space.sm}`
                      cho chữ "0" với nút xoá để chúng ngang hàng với ĐÁY ô nhập — một cách căn
                      chỉnh bằng tay, và nó lệch ngay khi ô nhập có dòng lỗi hoặc nhãn xuống hai
                      dòng. Ở 390px bốn cột đó còn ~80pt mỗi cột, đủ hiện "10.0…".

                      Mốc BẮT ĐẦU vẫn là CHỮ, không phải ô nhập: nó luôn bằng mốc kết thúc của
                      bậc trước. Cho nhập là mở đường tạo khoảng trống giữa hai bậc, mà schema
                      lại cấm đúng chuyện đó.
                    */}
                    {fields.map((row, index) => (
                      <YStack
                        key={row.id}
                        gap={space.xs}
                        p={space.sm}
                        br={radius.sm}
                        bg={colors.surfaceMuted}
                      >
                        <XStack ai="center" jc="space-between" gap={space.xs}>
                          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                            {t('tierName', { index: index + 1 })}
                          </Text>
                          {disabled ? null : (
                            <Pressable
                              onPress={() => remove(index)}
                              accessibilityRole="button"
                              accessibilityLabel={t('removeTier')}
                              hitSlop={space.xs}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={iconSize.sm}
                                color={colors.danger}
                              />
                            </Pressable>
                          )}
                        </XStack>

                        <Text col={colors.textMuted} fos={fontSize.bodySm}>
                          {t('tierRange', {
                            from: index === 0 ? '0' : String(tiers[index - 1]?.toKm ?? '—'),
                          })}
                        </Text>

                        <NumberField
                          control={control}
                          name={`deliveryTiers.${index}.toKm`}
                          integer
                          label={t('tierTo')}
                          suffix="km"
                          editable={!disabled}
                        />
                        <MoneyField
                          control={control}
                          name={`deliveryTiers.${index}.fee`}
                          label={t('tierFee')}
                          hint={tiers[index]?.fee ? undefined : t('free')}
                          editable={!disabled}
                        />
                      </YStack>
                    ))}
                    <ArrayError message={arrayErrorOf(errors.deliveryTiers)} />
                    {disabled ? null : (
                      <TextAction
                        label={t('addTier')}
                        /*
                          Bậc mới luôn RỖNG: mốc bắt đầu của nó là mốc kết thúc của bậc trước và
                          được suy ra lúc vẽ, nên không có gì để điền sẵn. Giống `append` của web.
                        */
                        onPress={() => append({ toKm: null, fee: null })}
                      />
                    )}
            </YStack>
          </>
        ) : (
          <Hint>{t('disabledNote')}</Hint>
        )}
      </YStack>
    </Card>
  );
}

/**
 * Hộp CÔNG THỨC — bản native của `styles.formulaCard` bên web.
 *
 * Nền mờ chứ không phải nền cảnh báo: đây là lời giải thích, không phải chuyện cần xử lý.
 */
function FormulaCard({ title, body }: { title: string; body: string }) {
  return (
    <YStack gap={2} p={space.sm} br={radius.sm} bg={colors.surfaceMuted}>
      <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
        {title}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {body}
      </Text>
    </YStack>
  );
}

function OvertimeSection({ control, disabled }: { control: PolicyControl; disabled: boolean }) {
  const t = useTranslations('Vehicles.pricing.overtime');
  const fmt = useAppFormat();
  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionTitle>{t('title')}</SectionTitle>
        <Hint>{t('hint')}</Hint>
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
          label={t('graceMinutes')}
          hint={t('graceMinutesHint')}
          placeholder={t('placeholder')}
          suffix="phút"
          editable={!disabled}
        />
        <NumberField
          control={control}
          name="overtimeRoundingMinutes"
          integer
          label={t('roundingMinutes')}
          hint={t('roundingMinutesHint')}
          placeholder={t('placeholder')}
          suffix="phút"
          editable={!disabled}
        />

        {/*
          CÔNG THỨC, không phải một dòng gợi ý.

          Ba ô ở trên (phí/giờ, miễn phí, làm tròn) chỉ có nghĩa khi biết chúng ghép lại thành
          phép tính nào và tính ở BƯỚC NÀO. Thiếu dòng này thì chủ xe đặt số theo cảm tính rồi
          tranh cãi với khách ở bàn giao — đúng lúc không sửa được nữa.
        */}
        <FormulaCard
          title={t('formulaTitle')}
          body={
            fee == null ? t('formulaNone') : t('formula', { fee: fmt.money(String(fee)) })
          }
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
}: {
  control: PolicyControl;
  disabled: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.longTermDiscount');
  const enabled = useWatch({ control, name: 'discountEnabled' });
  /* Cùng cặp `useWatch` + `useFieldArray` với khối giao nhận — xem chú thích ở đó. */
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { fields, append, remove, update } = useFieldArray({ control, name: 'discountTiers' });
  const { errors } = useFormState({ control, name: 'discountTiers' });

  const monthOptions = LONG_TERM_PACKAGE_MONTHS.map((months) => ({
    value: String(months),
    label: String(months),
  }));

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionTitle>{t('title')}</SectionTitle>
        <Hint>{t('hint')}</Hint>

        <Controller
          control={control}
          name="discountEnabled"
          render={({ field }) => (
            <ToggleRow
              label={t('enable')}
              checked={field.value === true}
              disabled={disabled}
              onToggle={() => field.onChange(!field.value)}
            />
          )}
        />

        {enabled ? (
          <YStack gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('tiers')}
                  </Text>
                  {fields.map((row, index) => (
                    /*
                      Một mốc = một Ô RIÊNG trên nền mờ, ba trường xếp DỌC.

                      Web xếp ngang được vì có cả bề rộng bàn phím; ở 390px ba ô trên một hàng
                      còn ~110pt mỗi ô, đủ để ô ghi chú chỉ hiện được ba chữ. Nền mờ thay cho
                      đường kẻ hàng của bảng bên web.
                    */
                    <YStack
                      key={row.id}
                      gap={space.xs}
                      p={space.sm}
                      br={radius.sm}
                      bg={colors.surfaceMuted}
                    >
                      <XStack ai="flex-end" gap={space.xs}>
                      <YStack f={1}>
                        <SelectControl
                          label={t('tierMonths')}
                          value={tiers[index]?.minMonths == null ? null : String(tiers[index]?.minMonths)}
                          options={monthOptions}
                          onChange={(next) => {
                            if (disabled) return;
                            /* `note` mặc định chuỗi rỗng: schema khai nó là `string`, không `optional`. */
                            update(index, {
                              percent: tiers[index]?.percent ?? null,
                              note: tiers[index]?.note ?? '',
                              minMonths: Number(next),
                            });
                          }}
                        />
                      </YStack>
                      <YStack f={1}>
                        <NumberField
                          control={control}
                          name={`discountTiers.${index}.percent`}
                          percent
                          label={t('tierPercent')}
                          editable={!disabled}
                        />
                      </YStack>
                      {disabled ? null : (
                        <Pressable
                          onPress={() => remove(index)}
                          accessibilityRole="button"
                          accessibilityLabel={t('removeTier')}
                          style={{ paddingBottom: space.sm }}
                        >
                          <Ionicons name="trash-outline" size={iconSize.sm} color={colors.danger} />
                        </Pressable>
                      )}
                      </XStack>

                      {/* Ghi chú: web có, app thiếu — nó là chỗ gian hàng nhớ vì sao đặt mốc này. */}
                      <TextField
                        control={control}
                        name={`discountTiers.${index}.note`}
                        label={t('tierNote')}
                        placeholder={t('notePlaceholder')}
                        editable={!disabled}
                      />
                    </YStack>
                  ))}
                  <ArrayError message={arrayErrorOf(errors.discountTiers)} />
                  {disabled ? null : (
                    <TextAction
                      label={t('addTier')}
                      onPress={() => append({ minMonths: null, percent: null, note: '' })}
                    />
                  )}
          </YStack>
        ) : (
          <Hint>{t('disabledNote')}</Hint>
        )}

        {/* Công thức giá gói — thiếu nó thì con số % ở trên không quy ra được tiền. */}
        <FormulaCard title={t('formulaTitle')} body={t('formula')} />
      </YStack>
    </Card>
  );
}
