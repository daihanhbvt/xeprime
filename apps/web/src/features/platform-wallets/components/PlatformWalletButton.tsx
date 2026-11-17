'use client';

import { WalletOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import type { PlatformWalletOwner } from '../types';
import { PlatformWalletDrawer } from './PlatformWalletDrawer';

/**
 * Lối mở Ví điểm của một chủ ví từ màn khách / đối tác. Người không có `platform.wallets.view`
 * không thấy nút (server vẫn chặn 403 độc lập — ẩn nút chỉ là trang trí, ADR 0027 điều 4).
 */
export function PlatformWalletButton({
  owner,
  size,
}: {
  owner: PlatformWalletOwner;
  size?: 'small' | 'middle';
}) {
  const t = useTranslations('PlatformWallets');
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);
  if (!has(PERMISSION.PLATFORM_WALLET_VIEW)) return null;

  return (
    <>
      <Button size={size} icon={<WalletOutlined />} onClick={() => setOpen(true)}>
        {t('open')}
      </Button>
      <PlatformWalletDrawer owner={open ? owner : null} onClose={() => setOpen(false)} />
    </>
  );
}
