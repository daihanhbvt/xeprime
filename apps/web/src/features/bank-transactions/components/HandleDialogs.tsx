'use client';

import { Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import styles from './HandleDialogs.module.css';

/** Cùng trần với DTO backend (`note` ≤ 500, mã hoàn 3–100). */
export const NOTE_MAX = 500;
const REFUND_REFERENCE_MIN = 3;
const REFUND_REFERENCE_MAX = 100;

/**
 * BỎ QUA một khoản tiền vào chưa khớp — mở từ CHÂN panel chi tiết, đúng khuôn panel làm việc (lý do
 * của một quyết định nằm trong hộp thoại, không lẫn vào thân panel). "Khớp tay" chỉ cần một lý do
 * nên dùng thẳng `components/overlay/ReasonDialog`; bỏ qua có thêm phần "đã chuyển trả người gửi".
 *
 * Lý do BẮT BUỘC: mỗi dòng `ignored` phải truy được về một người và một lý do.
 */

export function IgnoreDialog({
  open,
  submitting,
  onSubmit,
  onClose,
}: {
  open: boolean;
  submitting: boolean;
  onSubmit: (input: { note: string; refundReference?: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations('BankTransactions');
  const tCommon = useTranslations('Common');
  const schema = useMemo(
    () =>
      yup.object({
        note: yup
          .string()
          .trim()
          .required(t('handle.reasonRequired'))
          .max(NOTE_MAX, tCommon('validation.maxLength', { max: NOTE_MAX })),
        refunded: yup.boolean().default(false),
        refundReference: yup
          .string()
          .trim()
          .default('')
          .when('refunded', {
            is: true,
            then: (s) =>
              s
                .min(REFUND_REFERENCE_MIN, t('ignore.refundReferenceRequired'))
                .max(
                  REFUND_REFERENCE_MAX,
                  tCommon('validation.maxLength', { max: REFUND_REFERENCE_MAX }),
                )
                .required(t('ignore.refundReferenceRequired')),
          }),
      }),
    [t, tCommon],
  );
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { note: '', refunded: false, refundReference: '' },
  });
  const refunded = useWatch({ control, name: 'refunded' });

  useEffect(() => {
    if (open) reset({ note: '', refunded: false, refundReference: '' });
  }, [open, reset]);

  const submit = handleSubmit((values) => {
    // Enter trong ô nhập gửi form kể cả khi nút OK đang quay — chặn lượt thứ hai ở đây.
    if (submitting) return;
    onSubmit({
      note: values.note.trim(),
      ...(values.refunded ? { refundReference: values.refundReference.trim() } : {}),
    });
  });

  return (
    <ResponsiveDialog
      title={t('ignore.title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('ignore.submit')}
      destructive
      onOk={() => void submit()}
      confirmLoading={submitting}
    >
      <Form component={false} layout="vertical">
        <form className={styles.form} noValidate onSubmit={(e) => void submit(e)}>
          <p className={styles.hint}>{t('ignore.body')}</p>
          <TextAreaField
            control={control}
            name="note"
            label={t('handle.reasonLabel')}
            placeholder={t('ignore.notePlaceholder')}
            rows={3}
            maxLength={NOTE_MAX}
            required
          />
          <CheckboxField control={control} name="refunded">
            {t('ignore.refunded')}
          </CheckboxField>
          {refunded ? (
            <TextField
              control={control}
              name="refundReference"
              label={t('ignore.refundReference')}
              placeholder={t('ignore.refundReferencePlaceholder')}
              required
            />
          ) : null}
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
