'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Input, Select, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorMessage } from '@/services/api-client';
import { RECEIPT_TYPE } from '../constants';
import { useFinanceOptions } from '../hooks/use-finance-options';
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
  const t = useTranslations('Finance.receipts.categories');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const options = useFinanceOptions();
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
          message.success(t('added'));
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
    // `destroyOnClose={false}`: bản Modal cũ KHÔNG có `destroyOnClose`, nên nội dung được giữ
    // qua lần đóng. Giữ đúng như vậy — dialog dùng chung mặc định là huỷ.
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      footer={null}
      destroyOnClose={false}
    >
      <div className={styles.addRow}>
        <Select
          value={type}
          onChange={setType}
          aria-label={t('typeLabel')}
          options={options.receiptType}
          className={styles.typeSelect}
        />
        <Input
          value={name}
          placeholder={t('namePlaceholder')}
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
          {tCommon('actions.add')}
        </Button>
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.empty}>{tCommon('states.loading')}</div>
        ) : (
          list.map((c) => (
            <div key={c.id} className={styles.item}>
              <span>
                {c.name}{' '}
                <Tag color={c.type === RECEIPT_TYPE.INCOME ? 'green' : 'red'}>
                  {/* Nhãn "Thu"/"Chi" là CÙNG từ vựng nghiệp vụ với loại phiếu — đọc từ `Domain`
                      thay vì viết lại một cặp chữ thứ hai chỉ sống ở hộp thoại này. */}
                  {domainLabel('financeCategoryType', c.type)}
                </Tag>
                {c.isSystem ? <Tag>{t('system')}</Tag> : null}
              </span>
              {!c.isSystem ? (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={t('delete')}
                  onClick={() => del(c.id)}
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </ResponsiveDialog>
  );
}
