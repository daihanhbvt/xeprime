'use client';

import { App } from 'antd';
import { PERMISSION } from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { PartnerContact } from './api';
import { usePartnerContact } from './hooks';

type ContactField = Exclude<keyof PartnerContact, 'tenantId'>;

/**
 * Một ô liên hệ của đối tác trên drawer (SĐT/email của chủ, hoặc liên hệ công khai của gian hàng):
 * bản đã che, nút bỏ che cho người có `platform.tenants.view_pii`, và nút sao chép sau khi bỏ che.
 * Mọi ô của cùng đối tác dùng chung MỘT lượt bỏ che (`usePartnerContact`).
 */
export function PartnerContactValue({
  tenantId,
  field,
  masked,
}: {
  tenantId: string;
  field: ContactField;
  masked: string | null | undefined;
}) {
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { contact, reveal, isPending } = usePartnerContact(tenantId);
  return (
    <MaskedContact
      masked={masked}
      revealed={contact ? contact[field] : undefined}
      canReveal={has(PERMISSION.PLATFORM_TENANT_PII_VIEW)}
      loading={isPending}
      onReveal={() =>
        reveal(undefined, { onError: (err) => void message.error(errorMessage(err)) })
      }
    />
  );
}
