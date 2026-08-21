'use client';

import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/** Thời gian giữ dấu tick sau khi chép — đủ để mắt bắt được, không đủ để tưởng là trạng thái. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * Nút sao chép chỉ-icon, đứng CẠNH giá trị đang hiển thị.
 *
 * Dùng cho giá trị người ta phải mang sang chỗ khác: SĐT dán vào máy gọi/Zalo, email, mã đơn.
 * KHÔNG thay cho `tel:`/`mailto:` — giá trị vẫn hiển thị và vẫn bấm gọi được, nút này chỉ thêm
 * một lối nữa cho trường hợp cần dán chứ không cần gọi.
 *
 * A11y: nút chỉ-icon nên `label` trở thành `aria-label` — `Tooltip` KHÔNG tạo được tên khả
 * truy cập (cùng lý do đã ghi ở `RowActions`).
 *
 * `navigator.clipboard` chỉ tồn tại ở secure context; mở app qua IP LAN trên máy nhân viên là
 * trường hợp thật, nên hỏng phải báo ra chứ không im lặng.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  size = 'small',
}: {
  value: string;
  /** Nhãn cho tooltip + `aria-label`: "Sao chép số điện thoại". */
  label: string;
  copiedLabel?: string;
  size?: 'small' | 'middle';
}) {
  const tCommon = useTranslations('Common');
  /**
   * PHẢI dùng biến này ở cả tooltip lẫn `aria-label`, không dùng thẳng `copiedLabel`:
   * `copiedLabel` là tuỳ chọn và cả bốn nơi gọi hiện tại đều bỏ trống, nên dùng thẳng nó sẽ
   * cho `aria-label={undefined}` trong 1,5 giây sau khi chép — đúng lúc nút đổi sang icon tick
   * và mất luôn tên khả truy cập, thứ mà docblock ở trên nói rõ là không được phép.
   */
  const copiedText = copiedLabel ?? tCommon('actions.copied');
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      message.error(tCommon('components.copyFailed'));
    }
  }

  return (
    <Tooltip title={copied ? copiedText : label}>
      <Button
        type="text"
        size={size}
        aria-label={copied ? copiedText : label}
        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={() => void copy()}
      />
    </Tooltip>
  );
}
