'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { PLAN_GUIDE_TEMPLATE_CODE_PATTERN } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDuplicatePlanGuideTemplate } from '../hooks/use-app-config';
import type { PlanGuideTemplateSummary } from '../types';
import { normalizeTemplateCode, TEMPLATE_NAME_MAX } from './template-form';

interface FormValues {
  code: string;
  name: string;
}

/**
 * Nhân bản một mẫu — mã mới bắt buộc (unique), tên để trống thì server đặt "<tên cũ> (bản sao)".
 *
 * Trang cha gắn `key={source.id}` để form dựng lại khi đổi mẫu nguồn (RHF chỉ đọc
 * `defaultValues` một lần).
 */
export function DuplicateTemplateDialog({
  source,
  onClose,
}: {
  source: PlanGuideTemplateSummary | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminAppConfig');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const duplicate = useDuplicatePlanGuideTemplate();

  const schema = useMemo(
    () =>
      yup.object({
        code: yup
          .string()
          .trim()
          .required(t('editor.validation.codeRequired'))
          .matches(PLAN_GUIDE_TEMPLATE_CODE_PATTERN, t('editor.validation.codeFormat')),
        name: yup
          .string()
          .defined()
          .trim()
          .max(TEMPLATE_NAME_MAX, t('editor.validation.nameTooLong', { max: TEMPLATE_NAME_MAX })),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { code: source ? `${source.code}-copy`.slice(0, 60) : '', name: '' },
  });

  const submit = handleSubmit((values) => {
    if (!source || duplicate.isPending) return;
    duplicate.mutate(
      { id: source.id, code: values.code, ...(values.name ? { name: values.name } : {}) },
      {
        onSuccess: (copy) => {
          message.success(t('templates.toast.duplicated', { name: copy.name }));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      open={Boolean(source)}
      size="sm"
      title={source ? t('templates.duplicateDialog.title', { name: source.name }) : ''}
      onClose={onClose}
      onOk={() => void submit()}
      okText={t('templates.duplicateDialog.submit')}
      confirmLoading={duplicate.isPending}
    >
      <DialogForm onSubmit={submit} noValidate labelWidth="sm">
        <TextField
          control={control}
          name="code"
          required
          autoFocus
          label={t('templates.duplicateDialog.code')}
          help={t('editor.codeHelp')}
          normalize={normalizeTemplateCode}
        />
        <TextField
          control={control}
          name="name"
          label={t('templates.duplicateDialog.name')}
          placeholder={
            source ? t('templates.duplicateDialog.namePlaceholder', { name: source.name }) : undefined
          }
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
