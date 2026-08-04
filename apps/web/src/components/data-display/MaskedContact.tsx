'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import styles from './MaskedContact.module.css';

interface MaskedContactProps {
  /** Giá trị đã che do API trả về (nguồn duy nhất khi chưa bấm xem). */
  masked: string | null | undefined;
  /** Giá trị đầy đủ sau khi đã bấm xem; `undefined` = chưa xem. */
  revealed?: string | null;
  /** Người dùng có quyền bỏ che không (BE mới là nơi chặn thật). */
  canReveal: boolean;
  loading?: boolean;
  onReveal: () => void;
}

/**
 * Hiển thị một thông tin liên hệ đã che, kèm nút "xem đầy đủ".
 *
 * Dùng chung cho các màn giám sát nền tảng (đơn thuê, khách thuê): quy tắc PII giống nhau nên
 * phải trông và cư xử giống nhau. Bấm xem là một hành động có ghi audit ở backend — vì thế
 * nút phải do người dùng bấm, không tự bung khi mở drawer.
 */
export function MaskedContact({
  masked,
  revealed,
  canReveal,
  loading,
  onReveal,
}: MaskedContactProps) {
  if (!masked && !revealed) return <span>—</span>;

  if (revealed != null) {
    return <span className={styles.revealed}>{revealed}</span>;
  }

  return (
    <span className={styles.row}>
      <span className={styles.masked}>{masked}</span>
      {canReveal ? (
        <Tooltip title="Xem đầy đủ — thao tác này được ghi vào nhật ký hệ thống">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            loading={loading}
            onClick={onReveal}
          />
        </Tooltip>
      ) : null}
    </span>
  );
}
