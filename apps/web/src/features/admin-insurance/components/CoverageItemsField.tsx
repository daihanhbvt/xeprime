'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import { useTranslations } from 'next-intl';
import { Controller, useFieldArray, useFormState, type Control } from 'react-hook-form';
import { INSURANCE_PRODUCT_LIMITS } from '@xeprime/types';
import type { InsuranceProductFormValues } from '../form';
import styles from './InsuranceProductFormDialog.module.css';

/**
 * Phạm vi bảo vệ dạng DANH SÁCH MỤC - mỗi hàng là một dòng có dấu tích ở ô chọn bảo hiểm và popup
 * quyền lợi (Figma `22548:37013`). Lưu xuống chính cột `coverage_*` (mỗi mục một dòng, chữ thường):
 * app, trang /insurance và bản chụp sản phẩm trên đơn đọc nguyên văn, nên không dùng ô định dạng
 * HTML ở đây.
 */
export function CoverageItemsField({
  control,
  name,
  label,
}: {
  control: Control<InsuranceProductFormValues>;
  name: 'coverageVi' | 'coverageEn';
  label: string;
}) {
  const t = useTranslations('AdminInsurance.form');
  const { fields, append, remove } = useFieldArray({ control, name });
  const { errors } = useFormState({ control, name });
  const listError = errors[name]?.root?.message ?? errors[name]?.message;
  const max = INSURANCE_PRODUCT_LIMITS.coverageItems.max;

  return (
    <div className={styles.coverage}>
      <span className={styles.coverageLabel}>{label}</span>
      <ol className={styles.coverageList} aria-label={label}>
        {fields.map((field, index) => {
          const rowError = errors[name]?.[index]?.text?.message;
          return (
            <li key={field.id} className={styles.coverageRow}>
              <Controller
                control={control}
                name={`${name}.${index}.text`}
                render={({ field: f }) => (
                  <Input
                    value={f.value ?? ''}
                    onChange={f.onChange}
                    onBlur={f.onBlur}
                    maxLength={INSURANCE_PRODUCT_LIMITS.coverageItem.max}
                    aria-label={t('coverage.itemAria', { index: index + 1 })}
                    placeholder={t('coverage.itemPlaceholder')}
                    status={rowError || listError ? 'error' : undefined}
                  />
                )}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined aria-hidden />}
                aria-label={t('coverage.remove')}
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
              />
              {rowError ? (
                <p className={styles.coverageError} role="alert">
                  {rowError}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {listError ? (
        <p className={styles.coverageError} role="alert">
          {listError}
        </p>
      ) : null}
      {fields.length < max ? (
        <Button
          type="dashed"
          block
          icon={<PlusOutlined aria-hidden />}
          onClick={() => append({ text: '' })}
        >
          {t('coverage.add')}
        </Button>
      ) : null}
    </div>
  );
}
