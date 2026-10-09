'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { PAYMENT_ORDER_NOTE_LENGTH, PAYMENT_ORDER_REFUND_REFERENCE_LENGTH } from '@xeprime/types';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import styles from './ResolveGatewayOrderDialog.module.css';

/** Cùng ràng buộc với DTO backend (`ResolvePaymentOrderDto`) — một nguồn ở `@xeprime/types`. */
const NOTE_MIN = PAYMENT_ORDER_NOTE_LENGTH.MIN;
const NOTE_MAX = PAYMENT_ORDER_NOTE_LENGTH.MAX;
const REFUND_REFERENCE_MIN = PAYMENT_ORDER_REFUND_REFERENCE_LENGTH.MIN;
const REFUND_REFERENCE_MAX = PAYMENT_ORDER_REFUND_REFERENCE_LENGTH.MAX;

/**
 * ĐÓNG một lượt thanh toán qua cổng ở hàng đợi — ghi lại việc đã làm BÊN NGOÀI (thường là hoàn tay qua
 * portal của cổng). Không có thao tác tiền nào chạy từ đây: chính sách hoàn qua cổng chưa được quyết
 * (ADR 0058), nên hệ thống chỉ giữ bằng chứng — ai, lúc nào, làm gì, mã hoàn nào.
 *
 * Form reset mỗi lần mở: hộp thoại không bị tháo khỏi cây, và một mã hoàn của lượt A lọt sang lượt B
 * là một bằng chứng sai.
 */
export function ResolveGatewayOrderDialog({
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
  const t = useTranslations('PlatformMoney.gateway.resolve');
  const tCommon = useTranslations('Common');
  const schema = useMemo(
    () =>
      yup.object({
        note: yup
          .string()
          .trim()
          .required(t('noteRequired'))
          .min(NOTE_MIN, t('noteMin', { min: NOTE_MIN }))
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
                .min(REFUND_REFERENCE_MIN, t('refundReferenceRequired'))
                .max(
                  REFUND_REFERENCE_MAX,
                  tCommon('validation.maxLength', { max: REFUND_REFERENCE_MAX }),
                )
                .required(t('refundReferenceRequired')),
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
      title={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('submit')}
      onOk={() => void submit()}
      confirmLoading={submitting}
    >
      <Form component={false} layout="vertical">
        <form className={styles.form} noValidate onSubmit={(e) => void submit(e)}>
          <p className={styles.hint}>{t('body')}</p>
          <TextAreaField
            control={control}
            name="note"
            label={t('note')}
            placeholder={t('notePlaceholder')}
            rows={3}
            maxLength={NOTE_MAX}
            required
          />
          <CheckboxField control={control} name="refunded">
            {t('refunded')}
          </CheckboxField>
          {refunded ? (
            <TextField
              control={control}
              name="refundReference"
              label={t('refundReference')}
              placeholder={t('refundReferencePlaceholder')}
              required
            />
          ) : null}
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
