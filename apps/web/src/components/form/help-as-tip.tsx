'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, type ReactNode } from 'react';

import { InfoTip } from '@/components/overlay/InfoTip';
import styles from './field.module.css';

/**
 * Bật cho một vùng form: ghi chú (`help`) của các ô KHÔNG in dưới ô nữa mà thành dấu ⓘ cạnh nhãn -
 * hover trên máy tính, chạm trên điện thoại (`InfoTip`). Lỗi validate vẫn in dưới ô như cũ.
 *
 * Màn thêm xe bật nó (18/11/2026): lưới 3 cột chật, chữ hướng dẫn dưới từng ô làm lệch hàng.
 */
const HelpAsTipContext = createContext(false);

export function HelpAsTipProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
  return <HelpAsTipContext.Provider value={enabled}>{children}</HelpAsTipContext.Provider>;
}

/**
 * Nhãn + ghi chú THỰC SỰ hiển thị của một ô: trong vùng bật, ghi chú dời lên nhãn thành ⓘ và
 * `help` trả về `undefined`. Ngoài vùng bật trả nguyên hai giá trị.
 */
export function useHelpAsTip(
  label: ReactNode,
  help: ReactNode,
): { label: ReactNode; help: ReactNode } {
  const enabled = useContext(HelpAsTipContext);
  const t = useTranslations('Common.labels');
  if (!enabled || help == null || help === false || help === '' || label == null) {
    return { label, help };
  }
  const field = typeof label === 'string' ? label : '';
  return {
    label: (
      <span className={styles.labelWithTip}>
        {label}
        <InfoTip label={t('fieldNote', { field })}>{help}</InfoTip>
      </span>
    ),
    help: undefined,
  };
}
