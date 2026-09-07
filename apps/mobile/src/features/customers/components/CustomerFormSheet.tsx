import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE } from '@xeprime/types';
import { customerFormSchema, type CustomerFormValues } from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import { duplicateCustomerId, type TenantCustomerDetail } from '../api';
import { useCreateCustomer, useUpdateCustomer } from '../hooks/use-customers';

const EMPTY: CustomerFormValues = { fullName: '', phone: '', email: '', address: '' };

function toValues(customer: TenantCustomerDetail | null): CustomerFormValues {
  if (!customer) return EMPTY;
  return {
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email ?? '',
    address: customer.address ?? '',
  };
}

/**
 * Hồ sơ khách — MỘT tấm trượt cho cả thêm lẫn sửa (bản native của `CustomerFormModal`).
 *
 * Thân form chỉ render khi `open` và remount theo `key`: mỗi lần mở là state sạch (giá trị nhập
 * dở và lỗi trùng SĐT của lần trước không sống sót) mà KHÔNG cần effect nào đồng bộ lại.
 */
export function CustomerFormSheet({
  open,
  customer,
  onClose,
  onOpenExisting,
}: {
  open: boolean;
  /** null = thêm mới; có giá trị = sửa hồ sơ đó. */
  customer: TenantCustomerDetail | null;
  onClose: () => void;
  onOpenExisting?: ((customerId: string) => void) | undefined;
}) {
  const t = useTranslations('Customers.form');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={customer ? t('editTitle') : t('addTitle')}
    >
      {open ? (
        <CustomerForm
          key={customer?.id ?? 'new'}
          customer={customer}
          onDone={onClose}
          onOpenExisting={onOpenExisting}
        />
      ) : null}
    </BottomSheet>
  );
}

/**
 * Trùng SĐT KHÔNG phải một lỗi validate thường: backend trả `CUSTOMER_PHONE_DUPLICATE` kèm id hồ
 * sơ đang giữ số đó, và ở đây nó thành một lối đi tiếp ("Mở hồ sơ đang có") thay vì một dòng đỏ
 * dẫn tới ngõ cụt. Hệ thống KHÔNG tự gộp hai hồ sơ — gộp khách là quyết định của người dùng, có
 * chủ đích, không phải hệ quả phụ của một lần gõ nhầm số.
 */
function CustomerForm({
  customer,
  onDone,
  onOpenExisting,
}: {
  customer: TenantCustomerDetail | null;
  onDone: () => void;
  onOpenExisting?: ((customerId: string) => void) | undefined;
}) {
  const t = useTranslations('Customers.form');
  const tCustomers = useTranslations('Customers.detail');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const saving = create.isPending || update.isPending;

  const [duplicate, setDuplicate] = useState<{ message: string; customerId: string | null } | null>(
    null,
  );

  const resolver = useValidationResolver<CustomerFormValues>(
    customerFormSchema,
    'Customers.validation',
  );
  const { control, handleSubmit } = useForm<CustomerFormValues>({
    resolver,
    defaultValues: toValues(customer),
  });

  const submit = handleSubmit((values) => {
    setDuplicate(null);
    const body = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      email: values.email.trim() || null,
      address: values.address.trim() || null,
    };
    const done = {
      onSuccess: () => {
        toast.showSuccess(customer ? t('updated') : t('created'));
        onDone();
      },
      onError: (err: unknown) => {
        if (getErrorCode(err) === API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE) {
          setDuplicate({ message: errorMessage(err), customerId: duplicateCustomerId(err) });
          return;
        }
        toast.showError(errorMessage(err));
      },
    };
    if (customer) update.mutate({ id: customer.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="fullName"
        label={t('fullName')}
        placeholder={t('fullNamePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="phone"
        label={t('phone')}
        placeholder={t('phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        required
        hint={t('phoneHelp')}
      />
      <TextField
        control={control}
        name="email"
        label={t('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField control={control} name="address" label={t('address')} multiline rows={2} />

      {customer ? (
        <DataRow
          label={tCustomers('source')}
          value={domainLabel('tenantCustomerSource', customer.source)}
        />
      ) : null}

      {duplicate ? (
        <YStack gap={space.sm}>
          <Callout tone="warning" title={duplicate.message}>
            {t('duplicateHint')}
          </Callout>
          {duplicate.customerId && onOpenExisting ? (
            <Button
              label={t('duplicateOpen')}
              variant="secondary"
              onPress={() => {
                onOpenExisting(duplicate.customerId as string);
                onDone();
              }}
            />
          ) : null}
        </YStack>
      ) : null}

      <Button
        label={customer ? t('submitEdit') : t('submitAdd')}
        loading={saving}
        onPress={() => void submit()}
      />
      <Button label={tCommon('close')} variant="ghost" disabled={saving} onPress={onDone} />
    </YStack>
  );
}

export type { CustomerFormValues };
