'use client';

import { Alert, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { SUPPORT_CAPABILITY, SUPPORT_REASON_LIMITS, type SupportCapability } from '@xeprime/types';
import {
  supportActionReasonSchema,
  supportSubmitReviewReasonSchema,
  type SupportSubmitReviewReasonValues,
} from '@xeprime/validators';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import {
  registerSupportReasonPrompter,
  type SupportReasonRequest,
} from '@/services/support-reason';
import styles from './SupportReasonDialog.module.css';

/** Khoá bản dịch của hậu quả từng thao tác — capability mang dấu chấm, không làm khoá JSON được. */
const CONSEQUENCE_KEY = {
  [SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT]: 'createDraft',
  [SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE]: 'documentManage',
  [SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]: 'branchReassign',
  [SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE]: 'operationsUpdate',
  [SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE]: 'scheduleBlock',
  [SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE]: 'branchBasic',
  [SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW]: 'submitReview',
  [SUPPORT_CAPABILITY.LISTING_REPAIR]: 'listingRepair',
} as const satisfies Partial<Record<SupportCapability, string>>;

type ConsequenceKey = (typeof CONSEQUENCE_KEY)[keyof typeof CONSEQUENCE_KEY];

function consequenceKeysOf(capabilities: readonly SupportCapability[]): ConsequenceKey[] {
  return capabilities.flatMap((capability) => {
    const key = (CONSEQUENCE_KEY as Partial<Record<SupportCapability, ConsequenceKey>>)[capability];
    return key ? [key] : [];
  });
}

interface Pending {
  readonly request: SupportReasonRequest;
  readonly resolve: (reason: string | null) => void;
}

/**
 * Hộp thoại LÝ DO RIÊNG của một thao tác mức trung bình/cao trong phiên hỗ trợ (ADR 0050 §13).
 *
 * Mở ra vì SERVER đòi (`SUPPORT_REASON_REQUIRED`), không vì form đoán — nên nó đứng một chỗ cho mọi
 * thao tác, và nói đúng HẬU QUẢ của thao tác đang làm (vị trí công khai đổi, xe ngừng nhận chuyến,
 * phiếu vào hàng đợi duyệt…). Gửi duyệt thay chủ xe cần xác nhận lần hai. Huỷ thì request không
 * được gửi lại và không có gì bị ghi.
 *
 * Chỉ mount trong `SupportDataScope`: ngoài phiên không có hộp thoại nào đăng ký, nên màn của chủ
 * xe không bao giờ thấy nó.
 */
export function SupportReasonDialog() {
  const t = useTranslations('TenantSupport.reason');
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(
    () =>
      registerSupportReasonPrompter(
        (request) => new Promise<string | null>((resolve) => setPending({ request, resolve })),
      ),
    [],
  );
  // Rời phiên giữa chừng: request đang chờ nhận "huỷ" thay vì treo mãi.
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => pendingRef.current?.resolve(null), []);

  const needsOwnerConfirm =
    pending?.request.capabilities.includes(SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW) ?? false;
  // Gửi duyệt thay chủ xe: lý do + ô xác nhận lần hai. Thao tác khác: chỉ lý do.
  const submitReviewResolver = useValidationResolver<SupportSubmitReviewReasonValues>(
    supportSubmitReviewReasonSchema,
    'TenantSupport.reason.validation',
  );
  const reasonResolver = useValidationResolver<SupportSubmitReviewReasonValues>(
    supportActionReasonSchema,
    'TenantSupport.reason.validation',
  );
  const { control, handleSubmit, reset } = useForm<SupportSubmitReviewReasonValues>({
    resolver: needsOwnerConfirm ? submitReviewResolver : reasonResolver,
    defaultValues: { reason: '', ownerRequested: false },
  });

  function finish(reason: string | null) {
    pending?.resolve(reason);
    setPending(null);
    reset({ reason: '', ownerRequested: false });
  }

  const submit = handleSubmit((values) => finish(values.reason.trim()));

  const consequences = consequenceKeysOf(pending?.request.capabilities ?? []);

  return (
    <ResponsiveDialog
      open={pending !== null}
      title={consequences.length === 1 ? t(`consequence.${consequences[0]!}.title`) : t('title')}
      size="md"
      onClose={() => finish(null)}
      onOk={() => void submit()}
      okText={t('submit')}
    >
      <Form component={false} layout="vertical">
        <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
          {consequences.map((key) => (
            <Alert
              key={key}
              type="warning"
              showIcon
              className={styles.consequence}
              title={t(`consequence.${key}.body`)}
            />
          ))}
          {pending?.request.invalid ? (
            <Alert type="error" showIcon className={styles.consequence} title={t('invalid')} />
          ) : null}
          <TextAreaField
            control={control}
            name="reason"
            label={t('label')}
            placeholder={t('placeholder')}
            help={t('help')}
            rows={3}
            maxLength={SUPPORT_REASON_LIMITS.max}
            showCount
            required
          />
          {needsOwnerConfirm ? (
            <CheckboxField control={control} name="ownerRequested">
              {t('ownerRequested')}
            </CheckboxField>
          ) : null}
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
