'use client';

import { InputNumber, type InputNumberProps } from 'antd';
import { CURRENCY_SUFFIX, formatMoneyInput, parseMoneyInput } from '@xeprime/domain';

/*
 * Hai hàm này sống ở `@xeprime/domain` chứ không ở đây: app native cũng có ô nhập tiền, và định
 * dạng lúc nhập là MỘT quy ước cho cả hai nền tảng — hai bản sao sẽ lệch nhau ở lần sửa đầu.
 * Re-export để mọi nơi đang import từ file này không phải đổi.
 */
export { formatMoneyInput, parseMoneyInput };

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
export function MoneyInput({ addonAfter = CURRENCY_SUFFIX, ...props }: MoneyInputProps) {
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
