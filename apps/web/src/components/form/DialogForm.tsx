'use client';

import { Form } from 'antd';
import type { FormHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/lib/cx';
import styles from './DialogForm.module.css';

type LabelWidth = 'sm' | 'md' | 'lg';

interface DialogFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'children'> {
  children: ReactNode;
  /** Độ rộng cột nhãn desktop; mobile luôn tự chuyển về nhãn nằm trên ô nhập. */
  labelWidth?: LabelWidth;
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
  ...formProps
}: DialogFormProps) {
  return (
    <Form component={false} layout="horizontal" labelAlign="left" labelWrap colon={false}>
      <form
        {...formProps}
        className={cx(styles.form, styles[`label-${labelWidth}`], className)}
        noValidate={formProps.noValidate ?? true}
      >
        {children}
      </form>
    </Form>
  );
}
