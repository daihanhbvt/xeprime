import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_VALUES,
  type SurchargeCategory,
} from '@xeprime/types';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { BookingSettlement, OvertimeSuggestion, SaveSurchargeInput } from '../api';

/**
 * Hình dạng form suy từ CHÍNH schema, không viết tay.
 *
 * `yup.oneOf([...])` thu hẹp `string` thành union, nên một interface viết tay với
 * `category: string` lệch ngay với resolver — và lệch theo kiểu chỉ hiện ra ở `Control<>`,
 * tức là ở mọi `<TextField control={...}>` chứ không phải ở chỗ khai báo.
 */
type SurchargeFormValues = yup.InferType<ReturnType<typeof buildSurchargeSchema>>;

function buildSurchargeSchema(labels: { category: string; amount: string; reason: string }) {
  return yup.object({
    category: yup.string().oneOf(SURCHARGE_CATEGORY_VALUES).required(labels.category),
    /*
     * Cùng LUẬT và cùng CÂU BÁO LỖI với web (`amount == null || amount <= 0` ⇒
     * `surcharges.amountRequired`):
     *
     *  - **lớn hơn 0**, không phải `min(0)`. Một khoản phát sinh 0đ là một dòng sổ không có nội
     *    dung, và nó vẫn trừ vào đề xuất hoàn cọc bằng đúng 0 — tức chỉ làm bẩn quyết toán.
     *  - **KHÔNG `.integer()`**. Đó là một ràng buộc app tự thêm mà web và server đều không có:
     *    cột tiền là `Decimal(14,2)`, nên 50.000,50 hợp lệ ở server lại bị chặn ở app.
     */
    amount: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(labels.amount)
      .moreThan(0, labels.amount)
      .required(labels.amount),
    reason: yup.string().trim().required(labels.reason).max(REASON_MAX, labels.reason),
  });
}

/**
 * Thêm / sửa một khoản phụ phí.
 *
 * `reason` là BẮT BUỘC vì đây là khoản TRỪ VÀO TIỀN CỦA KHÁCH, và khách đọc được nó ở màn chuyến
 * của mình. Một khoản trừ không lý do là thứ không được phép tồn tại.
 *
 * `SURCHARGE_CATEGORY` cố ý **không có** danh mục nhiên liệu: hao xăng đã có kênh riêng ở biên
 * bản bàn giao (mức xăng lúc giao và lúc nhận), và ghi nó thành một khoản tiền tự do ở đây là
 * mở đường cho hai con số nói khác nhau về cùng một chuyện.
 *
 * Tiền nhập là số nguyên VND, gửi lên dạng CHUỖI (ADR 0007).
 */
export function SurchargeSheet({
  open,
  onClose,
  overtime,
  surchargeRules,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  /** Gợi ý quá giờ do SERVER tính từ chính sách + giờ trả thực tế. */
  overtime: OvertimeSuggestion;
  /**
   * Bảng phụ phí chủ xe ĐÃ CÔNG BỐ lúc đặt — snapshot trên đơn, không đọc lại cấu hình hiện tại.
   *
   * Đây là thứ khách đã nhìn thấy và đồng ý trước khi đặt; ghi một khoản lệch khỏi nó là một
   * khoản trừ mà khách chưa từng biết tới.
   */
  surchargeRules: BookingSettlement['surchargeRules'];
  onConfirm: (body: SaveSurchargeInput) => void;
  loading: boolean;
}) {
  const t = useTranslations('Bookings.settlement.surcharges');
  const tOvertime = useTranslations('Bookings.settlement.overtime');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  /*
   * Câu báo lỗi là câu GIẢI THÍCH, không phải cái nhãn ô lặp lại. Bản trước dùng `amountLabel`
   * ("Số tiền (đ)") làm thông báo, nên ô trống báo lỗi bằng đúng tên của chính nó — web dùng
   * `amountRequired`/`reasonRequired`, hai câu nói rõ phải làm gì và vì sao.
   */
  const schema = useMemo(
    () =>
      buildSurchargeSchema({
        category: t('categoryLabel'),
        amount: t('amountRequired'),
        reason: t('reasonRequired'),
      }),
    [t],
  );

  const { control, handleSubmit, setValue } = useForm<SurchargeFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      /*
        Ô tiền để TRỐNG, không phải một số 0 điền sẵn: 0 đọc ra như "miễn phí" và người dùng bấm
        thêm là ghi một dòng sổ rỗng. Web cũng mặc định `null`.
      */
      category: SURCHARGE_CATEGORY.OVERTIME,
      amount: null as unknown as number,
      reason: '',
    },
  });

  /*
   * Hai gợi ý bám theo DANH MỤC đang chọn, đúng như web: quá giờ chỉ có nghĩa ở danh mục quá giờ,
   * còn bảng phụ phí có tài xế thì mỗi danh mục một quy tắc.
   */
  const category = useWatch({ control, name: 'category' }) as SurchargeCategory;
  const canSuggestOvertime =
    category === SURCHARGE_CATEGORY.OVERTIME && overtime.available && overtime.amount != null;
  const rule = surchargeRules.find((r) => r.category === category) ?? null;

  const submit = handleSubmit((values) =>
    onConfirm({
      category: values.category as SaveSurchargeInput['category'],
      amount: String(values.amount),
      reason: values.reason,
    }),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('add')}
      footer={
        <Button
          label={t('add')}
          icon="add-circle-outline"
          loading={loading}
          onPress={() => void submit()}
        />
      }
    >
      <SelectField
        control={control}
        name="category"
        label={t('categoryLabel')}
        options={SURCHARGE_CATEGORY_VALUES.map((category) => ({
          value: category,
          label: domainLabel('surchargeCategory', category),
        }))}
        required
      />

      {/*
        Gợi ý phí quá giờ — hiện CẢ công thức để người dùng thấy vì sao ra con số đó.
        `available: false` thì KHÔNG bịa số: thiếu chính sách hoặc thiếu giờ trả thực tế nghĩa là
        không có cơ sở nào để đề xuất.
      */}
      {canSuggestOvertime ? (
        <Suggestion
          tone="warning"
          title={t('overtimeSuggestion', { amount: fmt.money(overtime.amount as string) })}
          body={
            overtime.formula ??
            tOvertime('charged', {
              hours: overtime.chargedHours,
              fee: fmt.money(overtime.feePerHour),
            })
          }
          actionLabel={tOvertime('apply')}
          onApply={() => setValue('amount', Number(overtime.amount), { shouldValidate: true })}
        />
      ) : null}

      {/*
        Quy tắc đã CÔNG BỐ cho danh mục đang chọn. Không tự điền: chủ xe nhập số THỰC TẾ theo
        chuyến (quy tắc là "150k mỗi đêm", chuyến này có thể hai đêm), nút chỉ mồi con số gốc.
      */}
      {rule ? (
        <Suggestion
          tone="info"
          title={t('ruleSuggestion', {
            kind: domainLabel('driverSurchargeKind', rule.kind),
            amount: fmt.money(rule.amount),
            unit: domainLabel('driverSurchargeUnit', rule.unit),
          })}
          body={
            rule.thresholdValue != null
              ? t('ruleThreshold', { value: rule.thresholdValue })
              : t('ruleHint')
          }
          actionLabel={tOvertime('apply')}
          onApply={() => setValue('amount', Number(rule.amount), { shouldValidate: true })}
        />
      ) : null}

      <MoneyField control={control} name="amount" label={t('amountLabel')} required />

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHint')}
        multiline
        rows={3}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}

/**
 * Một GỢI Ý số tiền — nói con số, nói vì sao ra con số đó, và cho một nút điền vào ô.
 *
 * Không tự điền: đây là tiền trừ vào khách, nên con số cuối cùng phải là một hành động của chủ
 * xe. Hai nhánh (quá giờ · bảng phụ phí đã công bố) dùng CHUNG khối này vì chúng là cùng một
 * loại lời khuyên — dựng hai khối riêng là hai chỗ để cách nói trôi khỏi nhau.
 */
function Suggestion({
  tone,
  title,
  body,
  actionLabel,
  onApply,
}: {
  tone: 'info' | 'warning';
  title: string;
  body: string;
  actionLabel: string;
  onApply: () => void;
}) {
  const surface = tone === 'warning' ? colors.warningSurface : colors.infoSurface;

  return (
    <YStack bg={surface} p={space.md} br={space.xs} gap={space.xs}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {title}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {body}
      </Text>
      <Button label={actionLabel} variant="secondary" size="sm" onPress={onApply} />
    </YStack>
  );
}
