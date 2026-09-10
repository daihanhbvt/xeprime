'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { App, Button, Empty, Pagination, Popconfirm, Result, Skeleton, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_NOTE_TYPE_META,
  type TenantCustomerNoteType,
} from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { NOTE_TYPE_VALUES } from '../constants';
import {
  useAddCustomerNote,
  useCustomerNotes,
  useDeleteCustomerNote,
} from '../hooks/use-customers';
import { customerNoteSchema, type CustomerNoteFormValues } from '../schema';
import styles from './CustomerNotesPanel.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const EMPTY: CustomerNoteFormValues = {
  noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
  body: '',
};

/**
 * Ghi chú nội bộ — dòng thời gian có tác giả và thời điểm, không phải một ô văn bản bị ghi đè.
 *
 * Nội dung TUYỆT ĐỐI nội bộ: nói rõ điều đó ngay trên bề mặt, vì người nhập cần biết chắc trước
 * khi gõ "khách này hay mặc cả" rằng khách không đọc được.
 */
export function CustomerNotesPanel({
  customerId,
  canManage,
  disabled,
}: {
  customerId: string;
  canManage: boolean;
  /** Hồ sơ đang lưu trữ — đọc được, không ghi thêm được (backend cũng chặn). */
  disabled?: boolean;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useCustomerNotes(customerId, page);
  const add = useAddCustomerNote();
  const remove = useDeleteCustomerNote();

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
          message.success(t('notes.added'));
          reset(EMPTY);
          setPage(1);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const items = data?.items ?? [];

  return (
    <section className={styles.panel}>
      {canManage && !disabled ? (
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          <SelectField
            control={control}
            name="noteType"
            label={t('notes.type')}
            options={typeOptions}
          />
          <TextAreaField
            control={control}
            name="body"
            label={t('notes.body')}
            rows={3}
            maxLength={2000}
            placeholder={t('notes.bodyPlaceholder')}
          />
          <p className={styles.hint}>{t('hints.notes')}</p>
          <div className={styles.composerActions}>
            <Button type="primary" htmlType="submit" loading={add.isPending}>
              {t('notes.add')}
            </Button>
          </div>
        </form>
      ) : null}

      {isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}

      {isError && !data ? (
        <Result
          status="warning"
          title={t('notes.errorTitle')}
          extra={
            <Button onClick={() => void refetch()} loading={isFetching}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notes.emptyTitle')} />
      ) : null}

      {items.length > 0 ? (
        <ol className={styles.timeline}>
          {items.map((note) => (
            <li key={note.id} className={styles.item}>
              <div className={styles.itemHead}>
                <Tag
                  color={
                    TENANT_CUSTOMER_NOTE_TYPE_META[note.noteType as TenantCustomerNoteType]?.color
                  }
                >
                  {domainLabel('tenantCustomerNoteType', note.noteType)}
                </Tag>
                <span className={styles.itemMeta}>
                  {note.authorName ?? t('notes.deletedAuthor')} · {fmt.dateTime(note.createdAt)}
                </span>
                {canManage ? (
                  <Popconfirm
                    title={t('notes.removeTitle')}
                    okText={t('notes.removeOk')}
                    cancelText={tCommon('actions.close')}
                    onConfirm={() =>
                      remove.mutate(
                        { id: customerId, noteId: note.id },
                        {
                          onSuccess: () => message.success(t('notes.removed')),
                          onError: (err) => message.error(errorMessage(err)),
                        },
                      )
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={t('notes.removeLabel', { date: fmt.dateTime(note.createdAt) })}
                      className={styles.itemRemove}
                    />
                  </Popconfirm>
                ) : null}
              </div>
              <p className={styles.itemBody}>{note.body}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {data && data.meta.total > data.meta.limit ? (
        <Pagination
          className={styles.pagination}
          current={data.meta.page}
          pageSize={data.meta.limit}
          total={data.meta.total}
          showSizeChanger={false}
          onChange={setPage}
        />
      ) : null}
    </section>
  );
}
