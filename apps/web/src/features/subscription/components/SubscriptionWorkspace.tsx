'use client';

import { Alert, Button, Spin } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';

import { usePermissions } from '@/hooks/use-permissions';

import { useMySubscription } from '../hooks/use-subscription';
import { PlanSummaryPanel } from './PlanSummaryPanel';
import { PurchaseModal } from './PurchaseModal';
import { SubscriptionInvoicesPanel } from './SubscriptionInvoicesPanel';
import styles from './SubscriptionWorkspace.module.css';

/**
 * "Gói & hạn mức" + "Hoá đơn thanh toán" (W2, ADR 0015/0026).
 *
 * Dựng ở HAI khu:
 *  - `/manage/shop?section=plan` — một section của trang Cửa hàng (gian hàng tuyến gói);
 *  - `/account/subscription` — trang riêng của chủ xe tuyến hoa hồng.
 *
 * Khu thứ hai là phễu nâng cấp lên tuyến gian hàng (ADR 0028 điều 1) và chủ xe tuyến hoa hồng
 * KHÔNG vào `/manage` được — gộp màn này vào trang Cửa hàng mà không chừa đường đó ra là cắt
 * đứt chính con đường người dùng đi để trả tiền.
 *
 * `header` đi vào bằng prop thay vì tự dựng: hai khu có hai component tiêu đề khác nhau
 * (`ManagePageHeader` / `AccountPageHeader`), còn trang Cửa hàng thì đã có tiêu đề section của
 * riêng nó và truyền `null`. Mỗi trang vẫn đúng một `h1`.
 *
 * ## Mua gói là quyền RIÊNG
 *
 * `subscription.view` cho XEM gói và hạn mức — `shop_manager` có, vì điều hành đội xe cần biết
 * còn bao nhiêu chỗ. `subscription.purchase` cho MUA/gia hạn thì mặc định chỉ chủ gian hàng có
 * (`rbac.ts`), và API đã chặn. Giao diện phải khớp: thiếu quyền thì KHÔNG có CTA nào dẫn vào
 * luồng đó, và `PurchaseModal` KHÔNG được dựng trong cây — một modal treo sẵn là một đường vào
 * bằng phím tắt mà API sẽ từ chối ở bước cuối.
 */
export function SubscriptionWorkspace({ header }: { header: ReactNode }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const canPurchase = has(PERMISSION.SUBSCRIPTION_PURCHASE);

  const me = useMySubscription();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  if (me.isLoading) {
    return (
      <div>
        {header}
        <div className={styles.center}>
          <Spin />
        </div>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div>
        {header}
        <Alert
          type="error"
          showIcon
          title={t('page.loadError')}
          action={
            <Button size="small" onClick={() => void me.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      {header}
      <PlanSummaryPanel
        data={me.data}
        canPurchase={canPurchase}
        onPurchase={() => setPurchaseOpen(true)}
      />
      <SubscriptionInvoicesPanel />
      {canPurchase ? (
        <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      ) : null}
    </div>
  );
}
