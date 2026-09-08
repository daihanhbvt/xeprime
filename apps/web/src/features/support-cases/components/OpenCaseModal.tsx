'use client';

import { App, Alert } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { SUPPORT_CASE_CATEGORY, SUPPORT_CASE_CATEGORY_VALUES } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useOpenSupportCase } from '../hooks/use-support-cases';
import type { SupportSurface } from '../types';

const OPENABLE_CATEGORIES = SUPPORT_CASE_CATEGORY_VALUES.filter(
  (value) => value !== SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
);

/**
 * Mở một yêu cầu hỗ trợ.
 *
 * `dispute` bắt buộc gắn một chuyến: tranh chấp có hệ quả tiền (nó TẠM GIỮ kết cục khoản giữ chỗ
 * của đơn đó), nên không thể là một câu hỏi chung chung. Server kiểm lại điều này — ô ở đây chỉ
 * để người dùng biết trước khi bấm.
 */
export function OpenCaseModal({
  surface,
  open,
  onClose,
  onOpened,
}: {
  surface: SupportSurface;
  open: boolean;
  onClose: () => void;
  onOpened?: (id: string) => void;
}) {
  const t = useTranslations('SupportCases');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const openCase = useOpenSupportCase(surface);

  const schema = useMemo(
    () =>
      yup.object({
        category: yup.string().oneOf(OPENABLE_CATEGORIES).required(),
        subject: yup.string().trim().min(5, t('form.subjectRequired')).max(255).required(t('form.subjectRequired')),
        description: yup
          .string()
          .trim()
          .min(10, t('form.descriptionRequired'))
          .max(5000)
          .required(t('form.descriptionRequired')),
        bookingId: yup
          .string()
          .trim()
          .default('')
          .when('category', {
            is: SUPPORT_CASE_CATEGORY.DISPUTE,
            then: (s) => s.test('required', t('form.bookingRequired'), (v) => Boolean(v)),
          }),
      }),
    [t],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      category: SUPPORT_CASE_CATEGORY.OTHER,
      subject: '',
      description: '',
      bookingId: '',
    },
  });

  const isDispute = watch('category') === SUPPORT_CASE_CATEGORY.DISPUTE;

  const onSubmit = handleSubmit((values) => {
    openCase.mutate(
      {
        category: values.category,
        subject: values.subject.trim(),
        description: values.description.trim(),
        bookingId: values.bookingId?.trim() || null,
      },
      {
        onSuccess: (created) => {
          message.success(t('form.openedSuccess'));
          onOpened?.(created.id);
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('form.title')}
      open={open}
      onClose={onClose}
      okText={t('form.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={openCase.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <SelectField
          control={control}
          name="category"
          label={t('form.category')}
          // `account_deletion` có luồng riêng ở `/account/delete-account` (checkbox xác nhận, cụm từ
          // xác nhận, idempotent) — không nằm trong ô chọn chung để tránh gửi nhầm một yêu cầu
          // xoá tài khoản như một câu hỏi thường.
          options={OPENABLE_CATEGORIES.map((value) => ({
            value,
            label: domainLabel('supportCaseCategory', value),
          }))}
        />
        <TextField control={control} name="subject" label={t('form.subject')} />
        <TextAreaField control={control} name="description" label={t('form.description')} rows={5} />
        {isDispute ? (
          <>
            <Alert type="warning" showIcon message={t('form.disputeHint')} />
            <TextField control={control} name="bookingId" label={t('form.bookingId')} help={t('form.bookingIdHint')} />
          </>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
