import { useEffect, useMemo, type ReactNode } from 'react';
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
import { isZeroMoney } from '@xeprime/domain';
import { REASON_MAX } from '@/lib/reason';
import { visibleSurchargeCategories } from '../surcharge-categories';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { ExcessMileageFacts } from '@/features/bookings/components/ExcessMileageFacts';
import type {
  BookingSettlement,
  ExcessMileageSuggestion,
  OvertimeSuggestion,
  SaveSurchargeInput,
} from '../api';

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
  excessMileage,
  recorded,
  surchargeRules,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  /** Gợi ý quá giờ do SERVER tính từ chính sách + giờ trả thực tế. */
  overtime: OvertimeSuggestion;
  /** Đề xuất phí VƯỢT KM — cùng luật với quá giờ: server tính, chủ xe nhận/sửa/bỏ. */
  excessMileage: ExcessMileageSuggestion;
  /**
   * Các khoản ĐÃ ghi của chuyến — chỉ dùng để LOẠI danh mục một-lần khỏi ô chọn.
   *
   * Backend từ chối khoản thứ hai ở những danh mục đó. Vẫn bày chúng ra nghĩa là mời người
   * dùng đi hết một biểu mẫu rồi mới ăn lỗi ở bước gửi — trong khi câu trả lời đã biết từ
   * lúc mở tấm.
   */
  recorded: BookingSettlement['surcharges'];
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
  const tMileage = useTranslations('Bookings.settlement.excessMileage');
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

  const { control, handleSubmit, setValue, getValues } = useForm<SurchargeFormValues>({
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

  /* Luật "danh mục nào còn chọn được" — xem `visibleSurchargeCategories`. */
  const categoryOptions = visibleSurchargeCategories(recorded);
  const canSuggestOvertime =
    category === SURCHARGE_CATEGORY.OVERTIME && overtime.available && overtime.amount != null;
  const hasMileageAmount =
    excessMileage.amount != null && !isZeroMoney(excessMileage.amount);
  const canSuggestMileage =
    category === SURCHARGE_CATEGORY.EXCESS_MILEAGE &&
    excessMileage.available &&
    hasMileageAmount;
  const showMileageFacts =
    category === SURCHARGE_CATEGORY.EXCESS_MILEAGE && excessMileage.includedKmPerDay != null;
  /** Câu ghi chú điền sẵn — dựng từ SỐ của backend, không tính lại gì. */
  const mileageReason = tMileage('defaultReason', {
    actual: fmt.km(excessMileage.actualKm),
    allowed: fmt.km(excessMileage.allowedKm),
    excess: fmt.km(excessMileage.excessKm),
    fee: fmt.money(excessMileage.feePerKm ?? '0'),
  });
  const rule = surchargeRules.find((r) => r.category === category) ?? null;

  /*
   * Điền sẵn số tiền + lý do ngay khi chủ xe CHỌN danh mục vượt km — đúng như `changeCategory`
   * của web, không bắt bấm thêm "Áp dụng".
   *
   * Hai rào chắn giữ cho nó không phá thứ người dùng đã gõ: chỉ điền vào ô ĐANG TRỐNG, và chỉ
   * khi thật sự có km vượt (`canSuggestMileage`). Điền sẵn KHÔNG phải là ghi — khoản chỉ tồn tại
   * sau khi bấm "Thêm phí phát sinh".
   *
   * Hiệu ứng chạy theo `category` chứ không nằm trong một handler, vì ô danh mục do RHF điều
   * khiển: `SelectField` ghi thẳng vào form, không đi qua tay component này.
   */
  useEffect(() => {
    if (!canSuggestMileage) return;
    if (getValues('amount') == null) {
      setValue('amount', Number(excessMileage.amount), { shouldValidate: true });
    }
    if (!getValues('reason').trim()) {
      setValue('reason', mileageReason, { shouldValidate: true });
    }
  }, [canSuggestMileage, excessMileage.amount, mileageReason, getValues, setValue]);

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
        options={categoryOptions.map((category) => ({
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
        ĐỀ XUẤT PHÍ VƯỢT KM — cùng luật với quá giờ: server tính, chủ xe nhận / sửa / bỏ.

        "Dùng được" đòi HAI điều, không phải một: đủ dữ kiện VÀ thật sự có km vượt. Chạy trong
        hạn mức thì đề xuất là 0, và một nút "dùng số này" cho số 0 chỉ dẫn tới một khoản phụ
        phí 0 đồng.

        Phép so "có tiền không" chạy trên CHUỖI (ADR 0007). `Number` chỉ xuất hiện ở mối nối
        với ô nhập, nơi component đòi một số — đó là chuyển kiểu, không phải phép tính tiền.

        Nút điền cả SỐ TIỀN lẫn LÝ DO: một khoản trừ tiền khách mà ô lý do trống là thứ không
        ai giải thích được về sau. Câu lý do dựng từ số của backend, không tính lại gì.
      */}
      {showMileageFacts ? (
        <Suggestion
          tone={canSuggestMileage ? 'warning' : 'info'}
          title={
            canSuggestMileage
              ? t('mileageSuggestion', { amount: fmt.money(excessMileage.amount as string) })
              : tMileage('title')
          }
          body={<ExcessMileageFacts suggestion={excessMileage} />}
          {...(canSuggestMileage
            ? {
                actionLabel: tOvertime('apply'),
                onApply: () => {
                  setValue('amount', Number(excessMileage.amount), { shouldValidate: true });
                  setValue('reason', mileageReason, { shouldValidate: true });
                },
              }
            : {})}
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
 * xe. Ba nhánh (quá giờ · phí vượt km · bảng phụ phí đã công bố) dùng CHUNG khối này vì chúng
 * là cùng một loại lời khuyên — dựng ba khối riêng là ba chỗ để cách nói trôi khỏi nhau.
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
  /**
   * Chuỗi, hoặc cả một khối dựng sẵn.
   *
   * Đề xuất phí vượt km cần bày SÁU dòng dữ kiện (hai chỉ số đồng hồ, hạn mức, công thức) —
   * nhồi chúng vào một chuỗi là mất hết căn hàng và mất luôn màu nhấn ở dòng km vượt.
   */
  body: ReactNode;
  /**
   * Vắng cả hai = khối chỉ ĐỌC.
   *
   * Có ca phải bày dữ kiện mà KHÔNG được mời nhận số: chuyến có hạn mức nhưng chạy trong
   * hạn mức, hoặc thiếu chỉ số đồng hồ. Im lặng ở đó là tệ nhất — chủ xe sẽ tự gõ một con số
   * mà không biết hệ thống đang thiếu gì. Còn một nút "dùng số này" cho 0đ thì dẫn thẳng tới
   * một khoản phụ phí rỗng.
   */
  actionLabel?: string;
  onApply?: () => void;
}) {
  const surface = tone === 'warning' ? colors.warningSurface : colors.infoSurface;

  return (
    <YStack bg={surface} p={space.md} br={space.xs} gap={space.xs}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {title}
      </Text>
      {typeof body === 'string' ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {body}
        </Text>
      ) : (
        body
      )}
      {actionLabel && onApply ? (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onApply} />
      ) : null}
    </YStack>
  );
}
