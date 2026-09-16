'use client';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { WalletView } from './WalletView';

import styles from './WalletRedirectToShop.module.css';

/**
 * `/account/balance` cho HAI loại người, sau khi ví được hợp nhất (15/09/2026).
 *
 * - Chưa là chủ xe → ví thuộc `user`: hiện luôn, đây đúng là sổ của họ.
 * - Đã là chủ xe   → ví đã đổi chủ sang tenant; `/account/wallet` trả 0. Đưa họ tới đúng sổ.
 *
 * Vì sao chuyển hướng thay vì hiện số 0 kèm một dòng giải thích: người mở màn ví đang đi tìm
 * tiền của mình. Một con số 0 là câu trả lời SAI cho câu hỏi họ đang hỏi, và dù có chú thích bên
 * dưới thì con số vẫn là thứ họ đọc trước. Đưa thẳng tới nơi có tiền là câu trả lời đúng.
 *
 * `replace` chứ không `push`: bấm Quay lại phải về trang trước đó, không quay lại đúng cái URL
 * vừa bị chuyển đi rồi bị chuyển lần nữa.
 */
export function WalletRedirectToShop() {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const isOwner = user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

  useEffect(() => {
    if (isOwner) router.replace(ROUTES.ACCOUNT.EARNINGS);
  }, [isOwner, router]);

  if (isLoading || isOwner) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  return <WalletView scope="account" />;
}
