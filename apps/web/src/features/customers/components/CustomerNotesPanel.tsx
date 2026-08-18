'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { DeleteOutlined } from '@ant-design/icons';
import { App, Button, Empty, Pagination, Popconfirm, Result, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_NOTE_TYPE_META,
  type TenantCustomerNoteType,
} from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { formatDateTime } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { CUSTOMER_HINTS, NOTE_TYPE_OPTIONS } from '../constants';
import {
  useAddCustomerNote,
  useCustomerNotes,
  useDeleteCustomerNote,
} from '../hooks/use-customers';
import { customerNoteSchema, type CustomerNoteFormValues } from '../schema';
import styles from './CustomerNotesPanel.module.css';

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
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useCustomerNotes(customerId, page);
  const add = useAddCustomerNote();
  const remove = useDeleteCustomerNote();

  const { control, handleSubmit, reset } = useForm<CustomerNoteFormValues>({
    resolver: yupResolver(customerNoteSchema),
    defaultValues: EMPTY,
  });

  const submit = handleSubmit((values) => {
    add.mutate(
      { id: customerId, body: { noteType: values.noteType, body: values.body.trim() } },
      {
        onSuccess: () => {
          message.success('Đã thêm ghi chú');
          reset(EMPTY);
          setPage(1);
        },
        onError: (err) => message.error(getErrorMessage(err)),
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
            label="Loại ghi chú"
            options={NOTE_TYPE_OPTIONS}
          />
          <TextAreaField
            control={control}
            name="body"
            label="Nội dung"
            rows={3}
            maxLength={2000}
            placeholder="Ví dụ: khách quen, luôn trả xe đúng giờ; thích xe số sàn."
          />
          <p className={styles.hint}>{CUSTOMER_HINTS.notes}</p>
          <div className={styles.composerActions}>
            <Button type="primary" htmlType="submit" loading={add.isPending}>
              Thêm ghi chú
            </Button>
          </div>
        </form>
      ) : null}

      {isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}

      {isError && !data ? (
        <Result
          status="warning"
          title="Không tải được ghi chú"
          extra={
            <Button onClick={() => void refetch()} loading={isFetching}>
              Thử lại
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có ghi chú nào về khách này"
        />
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
                  {TENANT_CUSTOMER_NOTE_TYPE_META[note.noteType as TenantCustomerNoteType]?.label ??
                    note.noteType}
                </Tag>
                <span className={styles.itemMeta}>
                  {note.authorName ?? 'Người dùng đã xoá'} · {formatDateTime(note.createdAt)}
                </span>
                {canManage ? (
                  <Popconfirm
                    title="Gỡ ghi chú này?"
                    okText="Gỡ"
                    cancelText="Đóng"
                    onConfirm={() =>
                      remove.mutate(
                        { id: customerId, noteId: note.id },
                        {
                          onSuccess: () => message.success('Đã gỡ ghi chú'),
                          onError: (err) => message.error(getErrorMessage(err)),
                        },
                      )
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={`Gỡ ghi chú ngày ${formatDateTime(note.createdAt)}`}
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
