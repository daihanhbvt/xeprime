'use client';

import { Alert, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
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
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/**
 * Hộp nhập LÝ DO cho một quyết định phải có người chịu trách nhiệm — mở từ CHÂN panel làm việc
 * (`WorkDrawer`) hay từ nút trên một dòng: từ chối hoàn, từ chối / đảo lệnh rút, chốt kết cục giữ
 * chỗ, khớp tay tiền vào, vô hiệu hợp đồng bảo hiểm. Một chỗ dùng chung để mọi quyết định có cùng
 * một hình thức: lý do bắt buộc, nói rõ ai đọc nó, nút xác nhận màu nguy hiểm khi phá huỷ.
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
  onSubmit,
  onClose,
}: ReasonDialogProps) {
  const tCommon = useTranslations('Common');
  const schema = useMemo(
    () =>
      yup.object({
        reason: yup
          .string()
          .trim()
          .min(minLength, requiredMessage)
          .max(maxLength, tCommon('validation.maxLength', { max: maxLength }))
          .required(requiredMessage),
      }),
    [minLength, maxLength, requiredMessage, tCommon],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const submit = handleSubmit((values) => {
    if (loading) return;
    onSubmit(values.reason.trim());
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
          <TextAreaField
            control={control}
            name="reason"
            label={label}
            placeholder={placeholder}
            rows={3}
            maxLength={maxLength}
            required
          />
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
