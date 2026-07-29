'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Select, Tag } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '@/services/api-client';
import { RECEIPT_TYPE, RECEIPT_TYPE_OPTIONS } from '../constants';
import type { CreateCategoryInput } from '../types';
import {
  useCreateCategory,
  useDeleteCategory,
  useFinanceCategories,
} from '../hooks/use-finance-categories';
import styles from './CategoryManagerModal.module.css';

/** Quản lý danh mục thu/chi: xem hệ thống + thêm/xoá danh mục riêng của tenant. */
export function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const { data: categories, isLoading } = useFinanceCategories();
  const create = useCreateCategory();
  const remove = useDeleteCategory();

  const [type, setType] = useState<string>(RECEIPT_TYPE.EXPENSE);
  const [name, setName] = useState('');

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { type: type as CreateCategoryInput['type'], name: trimmed },
      {
        onSuccess: () => {
          setName('');
          message.success('Đã thêm danh mục');
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function del(id: string) {
    remove.mutate(id, { onError: (err) => message.error(getErrorMessage(err)) });
  }

  const list = categories ?? [];

  return (
    <Modal title="Danh mục thu/chi" open={open} onCancel={onClose} footer={null}>
      <div className={styles.addRow}>
        <Select
          value={type}
          onChange={setType}
          options={RECEIPT_TYPE_OPTIONS}
          style={{ width: 110 }}
        />
        <Input
          value={name}
          placeholder="Tên danh mục mới"
          onChange={(e) => setName(e.target.value)}
          onPressEnter={add}
          maxLength={255}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={create.isPending}
          onClick={add}
          disabled={!name.trim()}
        >
          Thêm
        </Button>
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.empty}>Đang tải…</div>
        ) : (
          list.map((c) => (
            <div key={c.id} className={styles.item}>
              <span>
                {c.name}{' '}
                <Tag color={c.type === RECEIPT_TYPE.INCOME ? 'green' : 'red'}>
                  {c.type === RECEIPT_TYPE.INCOME ? 'Thu' : 'Chi'}
                </Tag>
                {c.isSystem ? <Tag>Hệ thống</Tag> : null}
              </span>
              {!c.isSystem ? (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label="Xoá danh mục"
                  onClick={() => del(c.id)}
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
