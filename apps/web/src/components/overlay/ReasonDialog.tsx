'use client';

import { Alert, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { RadioGroupField, type RadioGroupFieldOption } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import styles from './ReasonDialog.module.css';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** Câu nói rõ quyết định sẽ làm gì (tiền đi đâu) — hiện thành khung thông tin, đọc trước khi bấm. */
  summary?: string;
  /** Ai đọc lý do này — "Khách đọc được câu này", "Chủ ví đọc được câu này". */
  audienceHint?: string;
  label: string;
  placeholder?: string;
  requiredMessage: string;
  /** Sàn sau khi cắt khoảng trắng; `1` = chỉ cần không rỗng. Cùng sàn với DTO backend. */
  minLength: number;
  maxLength?: number;
  submitText: string;
  /** Mặc định `true` (từ chối, đảo lệnh, bỏ qua). Quyết định không phá huỷ (chốt, khớp) truyền `false`. */
  destructive?: boolean;
  loading: boolean;
  /**
   * Lý do CÓ MÃ — khi quyết định đi kèm một mã mà phía bên kia đọc thành câu riêng (vd mã từ chối
   * bằng lái → câu hướng dẫn khách chụp lại). Có `choices` thì người dùng BẮT BUỘC chọn một mã,
   * còn ô chữ thành lời nhắn kèm theo — chỉ bắt buộc với các mã ở `textRequiredFor`.
   */
  choices?: readonly RadioGroupFieldOption[];
  choiceLabel?: string;
  choiceRequiredMessage?: string;
  textRequiredFor?: readonly string[];
  /** `choice` chỉ có khi khai `choices`; chuỗi lời nhắn có thể rỗng khi mã không đòi lời nhắn. */
  onSubmit: (reason: string, choice?: string) => void;
  onClose: () => void;
}

/**
 * Hộp nhập LÝ DO cho một quyết định phải có người chịu trách nhiệm — mở từ CHÂN panel làm việc
 * (`WorkDrawer`) hay từ nút trên một dòng: từ chối hoàn, từ chối / đảo lệnh rút, chốt kết cục giữ
 * chỗ, khớp tay tiền vào, vô hiệu hợp đồng bảo hiểm, từ chối bằng lái. Một chỗ dùng chung để mọi
 * quyết định có cùng một hình thức: lý do bắt buộc, nói rõ ai đọc nó, nút xác nhận màu nguy hiểm
 * khi phá huỷ.
 *
 * Form RESET mỗi lần mở — lý do của quyết định trước không bao giờ điền sẵn cho quyết định sau.
 * Enter trong ô nhập gửi form kể cả khi nút OK đang quay, nên lượt gửi thứ hai bị chặn ở đây.
 */
export function ReasonDialog({
  open,
  title,
  summary,
  audienceHint,
  label,
  placeholder,
  requiredMessage,
  minLength,
  maxLength = 500,
  submitText,
  destructive = true,
  loading,
  choices,
  choiceLabel,
  choiceRequiredMessage,
  textRequiredFor,
  onSubmit,
  onClose,
}: ReasonDialogProps) {
  const tCommon = useTranslations('Common');
  const hasChoices = Boolean(choices && choices.length > 0);
  const schema = useMemo(() => {
    const text = yup
      .string()
      .trim()
      .max(maxLength, tCommon('validation.maxLength', { max: maxLength }));
    const required = text.min(minLength, requiredMessage).required(requiredMessage);
    return yup.object({
      choice: hasChoices
        ? yup.string().required(choiceRequiredMessage ?? requiredMessage)
        : yup.string().default(''),
      reason: hasChoices
        ? yup
            .string()
            .when('choice', ([choice]: unknown[]) =>
              textRequiredFor?.includes(String(choice)) ? required : text.default(''),
            )
        : required,
    });
  }, [
    hasChoices,
    minLength,
    maxLength,
    requiredMessage,
    choiceRequiredMessage,
    textRequiredFor,
    tCommon,
  ]);

  type FormValues = { choice?: string; reason?: string };

  const { control, handleSubmit, reset } = useForm<FormValues>({
    // Schema đổi hình theo `choices` (nhánh `.when`), nên kiểu suy ra của yup không khớp một
    // `FormValues` cố định — ép ở MỘT chỗ này thay vì để nó lan ra nơi gọi.
    resolver: yupResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { choice: '', reason: '' },
  });
  const choice = useWatch({ control, name: 'choice' });
  const textRequired = !hasChoices || Boolean(choice && textRequiredFor?.includes(choice));

  useEffect(() => {
    if (open) reset({ choice: '', reason: '' });
  }, [open, reset]);

  const submit = handleSubmit((values) => {
    if (loading) return;
    const reason = (values.reason ?? '').trim();
    if (hasChoices) onSubmit(reason, values.choice);
    else onSubmit(reason);
  });

  return (
    <ResponsiveDialog
      title={title}
      open={open}
      onClose={onClose}
      size="sm"
      okText={submitText}
      destructive={destructive}
      onOk={() => void submit()}
      confirmLoading={loading}
    >
      <Form component={false} layout="vertical">
        <form className={styles.form} noValidate onSubmit={(e) => void submit(e)}>
          {summary ? <Alert type="info" showIcon title={summary} /> : null}
          {audienceHint ? <p className={styles.hint}>{audienceHint}</p> : null}
          {hasChoices ? (
            <RadioGroupField
              control={control}
              name="choice"
              label={choiceLabel}
              options={choices!}
              required
            />
          ) : null}
          <TextAreaField
            control={control}
            name="reason"
            label={label}
            placeholder={placeholder}
            rows={3}
            maxLength={maxLength}
            required={textRequired}
          />
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
