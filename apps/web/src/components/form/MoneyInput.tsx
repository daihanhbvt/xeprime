'use client';

import { InputNumber, type InputNumberProps } from 'antd';

/**
 * Định dạng số tiền khi đang nhập theo quy ước Việt Nam: `1000000` → `1.000.000`.
 *
 * Đây là formatter của Ô NHẬP, khác `formatMoneyVnd`: không thêm đơn vị vào chuỗi giá trị và
 * không biến dữ liệu form thành chuỗi đã format. Giá trị trả qua `onChange` vẫn là `number | null`.
 */
export function formatMoneyInput(value: string | number | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Bỏ mọi ký tự phân nhóm/đơn vị khỏi ô tiền; xoá trắng trả về `null`, không tự biến thành 0. */
export function parseMoneyInput(value: string | undefined): number | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

export type MoneyInputProps = Omit<
  InputNumberProps<number>,
  'controls' | 'formatter' | 'parser' | 'precision' | 'suffix'
>;

/**
 * Primitive tiền VND dùng chung cho cả form RHF lẫn form local-state.
 *
 * Mọi nơi nhập tiền phải đi qua component này (hoặc `NumberField money`, vốn dùng component này)
 * để không còn nơi có dấu chấm hàng nghìn, nơi lại là chuỗi số thô.
 */
export function MoneyInput({ addonAfter = '₫', ...props }: MoneyInputProps) {
  return (
    <InputNumber<number>
      {...props}
      controls={false}
      precision={0}
      // AntD 6 đã bỏ khuyến nghị addon rời; suffix trong cùng control giúp mọi ô tiền
      // giữ cùng chiều rộng và không còn cảm giác “thòi thụt” giữa các hàng form.
      suffix={addonAfter}
      formatter={formatMoneyInput}
      parser={(value) => parseMoneyInput(value) as number}
    />
  );
}
