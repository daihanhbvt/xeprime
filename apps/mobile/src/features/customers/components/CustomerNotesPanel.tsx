import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_FIELD_MAX,
  TENANT_CUSTOMER_NOTE_TYPE_META,
  type TenantCustomerNoteType,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { colors, fontSize, space } from '@/theme/tokens';
import { customerNoteSchema, type CustomerNoteFormValues } from '@xeprime/validators';
import { NOTE_TYPE_VALUES } from '../constants';
import {
  useAddCustomerNote,
  useCustomerNotes,
  useDeleteCustomerNote,
} from '../hooks/use-customers';
import type { CustomerNote } from '../api';

const EMPTY: CustomerNoteFormValues = {
  noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
  body: '',
};

/**
 * Ghi chú nội bộ — dòng thời gian có tác giả và thời điểm, không phải một ô văn bản bị ghi đè.
 *
 * Nội dung TUYỆT ĐỐI nội bộ: nói rõ điều đó ngay trên bề mặt, vì người nhập cần biết chắc trước
 * khi gõ "khách này hay mặc cả" rằng khách không đọc được.
 *
 * Quyền: `customers.view` đọc; `customers.manage` thêm/xoá. Hồ sơ đã lưu trữ thì đọc được nhưng
 * không thêm mới (backend cũng chặn) — cùng luật với web.
 */
export function CustomerNotesPanel({
  customerId,
  canManage,
  disabled,
}: {
  customerId: string;
  canManage: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();

  const [page, setPage] = useState(FIRST_PAGE);
  const { data, isLoading, isError, error, refetch } = useCustomerNotes(customerId, page);
  const add = useAddCustomerNote();
  const remove = useDeleteCustomerNote();
  const [removing, setRemoving] = useState<CustomerNote | null>(null);

  const resolver = useValidationResolver<CustomerNoteFormValues>(
    customerNoteSchema,
    'Customers.validation',
  );
  const { control, handleSubmit, reset } = useForm<CustomerNoteFormValues>({
    resolver,
    defaultValues: EMPTY,
  });

  const typeOptions = useMemo(
    () =>
      NOTE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('tenantCustomerNoteType', value),
      })),
    [domainLabel],
  );

  const submit = handleSubmit((values) => {
    add.mutate(
      { id: customerId, body: { noteType: values.noteType, body: values.body.trim() } },
      {
        onSuccess: () => {
          toast.showSuccess(t('notes.added'));
          reset(EMPTY);
          setPage(FIRST_PAGE);
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <YStack gap={space.md}>
      {canManage && !disabled ? (
        <Card>
          <YStack gap={space.md}>
            <SelectField
              control={control}
              name="noteType"
              label={t('notes.type')}
              options={typeOptions}
            />
            <TextField
              control={control}
              name="body"
              label={t('notes.body')}
              multiline
              rows={3}
              maxLength={TENANT_CUSTOMER_FIELD_MAX.NOTE_BODY}
              placeholder={t('notes.bodyPlaceholder')}
              hint={t('hints.notes')}
            />
            <Button label={t('notes.add')} loading={add.isPending} onPress={() => void submit()} />
          </YStack>
        </Card>
      ) : null}

      {isLoading && !data ? <SkeletonText lines={4} /> : null}

      {isError && !data ? (
        <ScreenError error={error} title={t('notes.errorTitle')} onRetry={() => void refetch()} />
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <ScreenMessage icon="document-text-outline" title={t('notes.emptyTitle')} />
      ) : null}

      {items.map((note) => (
        <Card key={note.id}>
          <YStack gap={space.xs}>
            <XStack ai="center" gap={space.xs}>
              <StatusBadge
                label={domainLabel('tenantCustomerNoteType', note.noteType)}
                color={
                  TENANT_CUSTOMER_NOTE_TYPE_META[note.noteType as TenantCustomerNoteType].color
                }
                size="sm"
              />
              {/* `f={1}` + `minWidth={0}`: tên người ghi dài không được đẩy nút xoá ra khỏi mép. */}
              <Text
                col={colors.textMuted}
                fos={fontSize.label}
                f={1}
                minWidth={0}
                numberOfLines={1}
              >
                {note.authorName ?? t('notes.deletedAuthor')} · {fmt.dateTime(note.createdAt)}
              </Text>
              {canManage ? (
                <IconButton
                  icon="trash-outline"
                  label={t('notes.removeLabel', { date: fmt.dateTime(note.createdAt) })}
                  tone="danger"
                  onPress={() => setRemoving(note)}
                />
              ) : null}
            </XStack>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {note.body}
            </Text>
          </YStack>
        </Card>
      ))}

      {meta && meta.total > meta.limit ? (
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onChange={setPage} />
      ) : null}

      <AlertDialog
        open={removing !== null}
        title={t('notes.removeTitle')}
        confirmLabel={t('notes.removeOk')}
        cancelLabel={tCommon('close')}
        destructive
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const note = removing;
          if (!note) return;
          remove.mutate(
            { id: customerId, noteId: note.id },
            {
              onSuccess: () => {
                toast.showSuccess(t('notes.removed'));
                setRemoving(null);
              },
              onError: (err) => {
                toast.showError(errorMessage(err));
                setRemoving(null);
              },
            },
          );
        }}
      />
    </YStack>
  );
}
