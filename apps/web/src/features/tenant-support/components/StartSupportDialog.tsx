'use client';

import { Alert } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  PERMISSION,
  SUPPORT_CONTEXT_TTL_MINUTES,
  SUPPORT_MODE,
  SUPPORT_REASON_LIMITS,
} from '@xeprime/types';
import {
  openSupportContextSchema,
  type OpenSupportContextValues,
} from '@xeprime/validators';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { adminTenantSupportPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useOpenSupportContext } from '../hooks/use-tenant-support';
import styles from './StartSupportDialog.module.css';

/**
 * Bắt đầu một phiên hỗ trợ gian hàng (ADR 0050): chọn chế độ, ghi LÝ DO, rồi vào khu làm việc
 * của gian hàng dưới danh tính của chính mình.
 *
 * Lý do là bắt buộc và được ghi vào phiên + mọi dòng audit của phiên — người đọc nhật ký sau này
 * phải hiểu vì sao nhân sự nền tảng đã ở trong khu của gian hàng. Chế độ "hỗ trợ thao tác" chỉ
 * hiện khi người mở có quyền đó; server kiểm lại lần nữa.
 */
export function StartSupportDialog({
  tenantId,
  tenantName,
  open,
  onClose,
}: {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('TenantSupport.start');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const canAssist = has(PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST);
  const start = useOpenSupportContext();
  const resolver = useValidationResolver<OpenSupportContextValues>(
    openSupportContextSchema,
    'TenantSupport.start.validation',
  );
  const { control, handleSubmit, reset } = useForm<OpenSupportContextValues>({
    resolver,
    defaultValues: { mode: SUPPORT_MODE.VIEW, reason: '' },
  });

  function close() {
    reset();
    start.reset();
    onClose();
  }

  const submit = handleSubmit((values) => {
    start.mutate(
      { tenantId, mode: values.mode, reason: values.reason.trim() },
      { onSuccess: (context) => router.push(adminTenantSupportPath.root(context.id)) },
    );
  });

  return (
    <ResponsiveDialog
      open={open}
      title={t('title', { tenant: tenantName })}
      size="md"
      onClose={close}
      onOk={() => void submit()}
      okText={t('submit')}
      confirmLoading={start.isPending}
    >
      <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        <p className={styles.lead}>
          {t('lead', { minutes: SUPPORT_CONTEXT_TTL_MINUTES })}
        </p>
        {start.isError ? (
          <Alert type="error" showIcon title={errorMessage(start.error)} className={styles.error} />
        ) : null}
        <RadioGroupField
          control={control}
          name="mode"
          label={t('modeLabel')}
          required
          options={[
            {
              value: SUPPORT_MODE.VIEW,
              label: t('mode.view.label'),
              description: t('mode.view.description'),
            },
            {
              value: SUPPORT_MODE.ASSIST,
              label: t('mode.assist.label'),
              description: canAssist
                ? t('mode.assist.description')
                : t('mode.assist.noPermission'),
              disabled: !canAssist,
            },
          ]}
        />
        <TextAreaField
          control={control}
          name="reason"
          label={t('reasonLabel')}
          placeholder={t('reasonPlaceholder')}
          help={t('reasonHelp', { min: SUPPORT_REASON_LIMITS.min })}
          rows={3}
          maxLength={SUPPORT_REASON_LIMITS.max}
          showCount
          required
        />
      </form>
    </ResponsiveDialog>
  );
}
