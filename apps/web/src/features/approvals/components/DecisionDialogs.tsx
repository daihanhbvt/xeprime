'use client';

import { Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  APPROVAL_DECISION,
  APPROVAL_REASON_MAX_LENGTH,
  type ApprovalDecision,
} from '@xeprime/types';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import styles from './VehicleApprovalDrawer.module.css';

export type ReasonDecision = Exclude<ApprovalDecision, typeof APPROVAL_DECISION.APPROVE>;

interface ReasonValues {
  reason: string;
}

const reasonSchema = yup.object({
  reason: yup
    .string()
    .trim()
    .required('reasonRequired')
    .max(
      APPROVAL_REASON_MAX_LENGTH,
      `reasonTooLong::${JSON.stringify({ max: APPROVAL_REASON_MAX_LENGTH })}`,
    ),
});

const REASON_COPY = {
  [APPROVAL_DECISION.REQUEST_REVISION]: 'revision',
  [APPROVAL_DECISION.REJECT]: 'reject',
} as const satisfies Record<ReasonDecision, string>;

/**
 * Hộp thoại LÝ DO — bắt buộc với Từ chối và Yêu cầu bổ sung, vì chủ xe chỉ sửa được điều họ
 * được nói ra. Lý do này GỬI CHỦ XE; nó không phải ghi chú nội bộ (khối riêng ở cột phải).
 *
 * Nút gửi mờ khi ô còn trống, và Yup vẫn chặn chuỗi toàn khoảng trắng — backend cũng từ chối
 * (400), nên ba lớp nói cùng một điều.
 */
export function ReasonDialog({
  kind,
  submitting,
  onSubmit,
  onClose,
}: {
  kind: ReasonDecision | null;
  submitting: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Approvals.dialog');
  const resolver = useValidationResolver<ReasonValues>(reasonSchema, 'Approvals.dialog');
  const { control, handleSubmit, reset } = useForm<ReasonValues>({
    resolver,
    defaultValues: { reason: '' },
  });
  const reason = useWatch({ control, name: 'reason' });

  // Mỗi lần mở là một lý do mới — không mang chữ của lần từ chối trước sang lần yêu cầu bổ sung.
  useEffect(() => {
    if (kind) reset({ reason: '' });
  }, [kind, reset]);

  const copy = kind ? REASON_COPY[kind] : REASON_COPY[APPROVAL_DECISION.REQUEST_REVISION];
  const submit = handleSubmit((values) => onSubmit(values.reason.trim()));

  return (
    <ResponsiveDialog
      open={Boolean(kind)}
      title={t(`${copy}.title`)}
      size="sm"
      okText={t(`${copy}.ok`)}
      destructive={kind === APPROVAL_DECISION.REJECT}
      okDisabled={!reason?.trim()}
      confirmLoading={submitting}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <p className={styles.dialogHint}>{t(`${copy}.hint`)}</p>
      <Form component={false} layout="vertical">
        <form noValidate onSubmit={(event) => void submit(event)}>
          <TextAreaField
            control={control}
            name="reason"
            label={t('reasonLabel')}
            placeholder={t('reasonPlaceholder')}
            rows={4}
            maxLength={APPROVAL_REASON_MAX_LENGTH}
            showCount
            required
          />
        </form>
      </Form>
    </ResponsiveDialog>
  );
}

/** Bước xác nhận của Phê duyệt — lên chợ là một lời hứa với khách, không phải một cú bấm nhầm. */
export function ApproveDialog({
  open,
  vehicleName,
  submitting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  vehicleName: string;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Approvals.dialog.approve');
  return (
    <ResponsiveDialog
      open={open}
      title={t('title')}
      size="sm"
      okText={t('ok')}
      confirmLoading={submitting}
      onOk={onConfirm}
      onClose={onClose}
    >
      <p className={styles.dialogHint}>{t('body', { name: vehicleName })}</p>
    </ResponsiveDialog>
  );
}
