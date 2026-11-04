'use client';

import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Select, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FINANCE_CATEGORY_TYPE_META, type FinanceCategoryType } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { RECEIPT_TYPE } from '../constants';
import { useFinanceOptions } from '../hooks/use-finance-options';
import type { CreateCategoryInput, FinanceCategory } from '../types';
import {
  useCreateCategory,
  useDeleteCategory,
  useFinanceCategories,
  useUpdateCategory,
} from '../hooks/use-finance-categories';
import styles from './CategoryManagerModal.module.css';

const NAME_MAX = 255;

/**
 * Danh mục thu/chi — design Partner-XePrime `23845:41185`: một bảng (Danh mục · Loại · Thao tác),
 * sửa/xoá ngay trên dòng, dòng nhập mới ở cuối bảng, "+ Thêm danh mục".
 *
 * **Lưu TỪNG DÒNG** (chốt 04/11/2026) bằng nút ✓ của chính dòng đó, không gom chờ "Xác nhận":
 * mỗi thao tác là một lệnh server riêng, nên gom lại thì lỗi ở một dòng làm cả lượt phải xử lý
 * lại. Chân hộp vì thế chỉ còn "Đóng".
 *
 * Danh mục HỆ THỐNG không sửa/xoá được (server cũng chặn) — dòng của nó mang nhãn "Hệ thống" và
 * không có nút nào, thay vì hai nút bấm vào là lỗi. Xếp theo loại (Chi trước Thu) như mũi tên ở
 * đầu cột của design; trong cùng loại theo tên.
 */
export function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const t = useTranslations('Finance.receipts.categories');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const options = useFinanceOptions();
  const { data: categories, isLoading } = useFinanceCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  /** Dòng thêm mới: mở sẵn khi chưa có danh mục riêng nào, bấm "+ Thêm danh mục" để mở lại. */
  const [adding, setAdding] = useState(true);
  const [type, setType] = useState<string>(RECEIPT_TYPE.EXPENSE);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const list = useMemo(
    () =>
      [...(categories ?? [])].sort(
        (a, b) => b.type.localeCompare(a.type) || a.name.localeCompare(b.name, 'vi'),
      ),
    [categories],
  );

  function add() {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    create.mutate(
      { type: type as CreateCategoryInput['type'], name: trimmed },
      {
        onSuccess: () => {
          setName('');
          message.success(t('added'));
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function saveEdit() {
    if (!editing || update.isPending) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return;
    update.mutate(
      { id: editing.id, name: trimmed },
      {
        onSuccess: () => {
          setEditing(null);
          message.success(t('renamed'));
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function del(category: FinanceCategory) {
    remove.mutate(category.id, {
      onSuccess: () => message.success(t('deleted')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    // `destroyOnClose={false}`: tên đang gõ ở dòng thêm mới sống qua lần đóng — bấm nhầm ra ngoài
    // không được nuốt mất chữ người dùng vừa gõ.
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size="md"
      destroyOnClose={false}
      footer={
        <div className={styles.footer}>
          <Button size="large" onClick={onClose}>
            {t('done')}
          </Button>
        </div>
      }
    >
      <div className={styles.table} role="table" aria-label={t('title')}>
        <div className={styles.headRow} role="row">
          <span role="columnheader">{t('columns.name')}</span>
          <span role="columnheader">{t('columns.type')}</span>
          <span role="columnheader" className={styles.actionsHead}>
            {t('columns.actions')}
          </span>
        </div>

        {isLoading ? (
          <div className={styles.loading} aria-label={tCommon('states.loading')}>
            <Skeleton active title={false} paragraph={{ rows: 3 }} />
          </div>
        ) : list.length === 0 && !adding ? (
          <p className={styles.empty}>{t('empty')}</p>
        ) : (
          list.map((c) => {
            const isEditing = editing?.id === c.id;
            return (
              <div key={c.id} className={styles.row} role="row">
                <span role="cell" className={styles.nameCell}>
                  {isEditing ? (
                    <Input
                      size="large"
                      autoFocus
                      value={editing.name}
                      maxLength={NAME_MAX}
                      aria-label={t('nameLabel')}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      onPressEnter={saveEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <>
                      <span className={styles.name}>{c.name}</span>
                      {c.isSystem ? <span className={styles.system}>{t('system')}</span> : null}
                    </>
                  )}
                </span>
                <span role="cell">
                  <StatusTag
                    value={c.type as FinanceCategoryType}
                    meta={FINANCE_CATEGORY_TYPE_META}
                    group="financeCategoryType"
                  />
                </span>
                <span role="cell" className={styles.actions}>
                  {c.isSystem ? null : isEditing ? (
                    <>
                      <Button
                        type="text"
                        danger
                        icon={<CloseOutlined />}
                        aria-label={t('discard')}
                        onClick={() => setEditing(null)}
                      />
                      <Button
                        type="text"
                        className={styles.confirm}
                        icon={<CheckOutlined />}
                        aria-label={t('save')}
                        loading={update.isPending}
                        disabled={!editing.name.trim()}
                        onClick={saveEdit}
                      />
                    </>
                  ) : (
                    <>
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        aria-label={t('edit')}
                        onClick={() => setEditing({ id: c.id, name: c.name })}
                      />
                      <Popconfirm
                        title={t('deleteConfirm', { name: c.name })}
                        okText={tCommon('actions.delete')}
                        cancelText={tCommon('actions.cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => del(c)}
                      >
                        <Button type="text" icon={<DeleteOutlined />} aria-label={t('delete')} />
                      </Popconfirm>
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}

        {adding ? (
          <div className={styles.row} role="row">
            <span role="cell" className={styles.nameCell}>
              <Input
                size="large"
                value={name}
                placeholder={t('namePlaceholder')}
                aria-label={t('nameLabel')}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onPressEnter={add}
              />
            </span>
            <span role="cell">
              <Select
                size="large"
                value={type}
                onChange={setType}
                aria-label={t('typeLabel')}
                options={options.receiptType}
                className={styles.typeSelect}
              />
            </span>
            <span role="cell" className={styles.actions}>
              <Button
                type="text"
                danger
                icon={<CloseOutlined />}
                aria-label={t('discard')}
                onClick={() => {
                  setName('');
                  setAdding(false);
                }}
              />
              <Button
                type="text"
                className={styles.confirm}
                icon={<CheckOutlined />}
                aria-label={tCommon('actions.add')}
                loading={create.isPending}
                disabled={!name.trim()}
                onClick={add}
              />
            </span>
          </div>
        ) : null}
      </div>

      {!adding ? (
        <Button
          type="link"
          icon={<PlusOutlined />}
          className={styles.addLink}
          onClick={() => setAdding(true)}
        >
          {t('addRow')}
        </Button>
      ) : null}
    </ResponsiveDialog>
  );
}
