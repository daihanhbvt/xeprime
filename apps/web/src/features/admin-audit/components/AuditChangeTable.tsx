'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import type { AuditChange } from '../diff';
import { useAuditLabels } from '../hooks/use-audit-labels';
import { useAuditValueFormatter } from '../hooks/use-audit-value-format';
import styles from './AuditChangeTable.module.css';

/**
 * Bảng Trường · Trước · Sau của một lượt SỬA.
 *
 * Mặc định chỉ hiện trường THAY ĐỔI (một lượt sửa gói ghi 12 trường nhưng thường chỉ 2 trường
 * đổi); "Hiện tất cả" để đối chiếu. Cột "Trường" là nhãn người đọc — tên khoá kỹ thuật chỉ hiện
 * khi trường chưa có nhãn, còn dữ liệu gốc nằm ở "Thông tin kỹ thuật".
 *
 * Mount với `key={log.id}` để trạng thái "hiện tất cả" không mang từ dòng này sang dòng khác.
 */
export function AuditChangeTable({
  targetType,
  rows,
}: {
  targetType: string;
  rows: readonly AuditChange[];
}) {
  const t = useTranslations('AdminAudit.detail.changes');
  const labels = useAuditLabels();
  const format = useAuditValueFormatter(targetType);
  const [showAll, setShowAll] = useState(false);

  const changed = rows.filter((row) => row.changed);
  const visible = showAll ? rows : changed;
  const hiddenCount = rows.length - visible.length;

  return (
    <div className={styles.wrap}>
      {visible.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('field')}</th>
              <th scope="col">{t('before')}</th>
              <th scope="col">{t('after')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const label = labels.field(row.path);
              return (
                <tr key={row.path} className={cx(row.changed && styles.changed)}>
                  <th scope="row" className={styles.field}>
                    <span className={cx(label === row.path && styles.path)}>{label}</span>
                  </th>
                  <td className={cx(styles.value, row.changed && styles.before)}>
                    {format(row.path, row.before)}
                  </td>
                  <td className={cx(styles.value, row.changed && styles.after)}>
                    {format(row.path, row.after)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.note}>{t('noChanges')}</p>
      )}
      {hiddenCount > 0 || showAll ? (
        <div className={styles.footer}>
          {hiddenCount > 0 ? (
            <span className={styles.note}>{t('unchangedHidden', { count: hiddenCount })}</span>
          ) : (
            <span />
          )}
          <Button type="link" size="small" onClick={() => setShowAll((value) => !value)}>
            {showAll ? t('hideUnchanged') : t('showUnchanged')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
