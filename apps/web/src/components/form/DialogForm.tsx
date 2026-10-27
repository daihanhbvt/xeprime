'use client';

import { Form, type FormProps } from 'antd';
import type { FormHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/lib/cx';
import styles from './DialogForm.module.css';

type LabelWidth = 'sm' | 'md' | 'lg';

interface DialogFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'children'> {
  children: ReactNode;
  /** Độ rộng cột nhãn desktop; mobile luôn tự chuyển về nhãn nằm trên ô nhập. */
  labelWidth?: LabelWidth;
  /**
   * `top`: nhãn luôn nằm TRÊN ô nhập, cả ở desktop — hộp thoại dáng v2 của bề mặt khách (Figma
   * Account `19973:50994`). Mặc định `side` giữ cột nhãn của các khu quản lý.
   */
  labelPosition?: 'side' | 'top';
  /** Dấu bắt buộc — vd `trailingRequiredMark` để `*` đứng SAU nhãn như bản vẽ. */
  requiredMark?: FormProps['requiredMark'];
}

/**
 * Layout form chuẩn cho modal CRUD nhỏ/vừa.
 *
 * Desktop dùng một cột nhãn cố định để mép trái của mọi input thẳng nhau. Nhãn dài được phép
 * xuống dòng nhưng không đẩy riêng input của hàng đó sang trái/phải. Mobile tự xếp nhãn lên trên
 * để không hy sinh chiều rộng ô nhập và vùng chạm.
 */
export function DialogForm({
  children,
  className,
  labelWidth = 'md',
  labelPosition = 'side',
  requiredMark,
  ...formProps
}: DialogFormProps) {
  const top = labelPosition === 'top';
  return (
    <Form
      component={false}
      layout={top ? 'vertical' : 'horizontal'}
      labelAlign="left"
      labelWrap
      colon={false}
      requiredMark={requiredMark}
    >
      <form
        {...formProps}
        className={cx(
          top ? styles.top : styles.form,
          !top && styles[`label-${labelWidth}`],
          className,
        )}
        noValidate={formProps.noValidate ?? true}
      >
        {children}
      </form>
    </Form>
  );
}
