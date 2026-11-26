'use client';

import { ConfigProvider } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import { partnerControlTheme } from '@/styles/theme';

/**
 * Theme control riêng của site partner, lồng TRONG `ConfigProvider` gốc: AntD gộp token theo từng
 * component, nên token gốc (màu chữ nút primary, chế độ tối…) vẫn giữ nguyên. Hộp thoại/ô xổ xuống
 * mở qua portal vẫn nhận theme này - nó đi theo context React, không theo cây DOM.
 */
export function PartnerThemeScope({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const config = useMemo(() => partnerControlTheme(theme), [theme]);
  return <ConfigProvider theme={config}>{children}</ConfigProvider>;
}
