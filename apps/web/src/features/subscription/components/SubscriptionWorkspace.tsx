'use client';

import { Alert, Button, Spin } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION, canUpgradeToPackageTrack } from '@xeprime/types';

import { useTenantScope } from '@/hooks/use-tenant-scope';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';

import { useMySubscription } from '../hooks/use-subscription';
import { PackageUpgradeWizard, UPGRADE_TITLE_ID } from './PackageUpgradeWizard';
import { PlanFeatureList } from './PlanFeatureList';
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
 *
 * ## Hai hình dạng của việc MUA, theo TUYẾN
 *
 * | Tuyến | Màn mua | Vì sao |
 * | --- | --- | --- |
 * | gói (gia hạn/nâng bậc) | `PurchaseModal` | hồ sơ gian hàng đã đủ; chỉ còn chọn bậc rồi trả tiền |
 * | hoa hồng (nâng cấp) | `PackageUpgradeWizard` NGAY TRÊN TRANG | còn một bước hồ sơ ở giữa |
 *
 * Luồng nâng cấp KHÔNG nằm trong một hộp thoại có chủ đích: bảng giá là thứ đầu tiên người ta
 * tới đây để xem, và giấu nó sau một cú bấm là bắt họ mở một cánh cửa trước khi biết đằng sau có
 * gì. Ở đây CTA phía trên chỉ cuộn xuống đúng khối đó.
 */
export function SubscriptionWorkspace({
  header,
  framed = false,
}: {
  header: ReactNode;
  /**
   * Khối "gói hiện hành" tự vẽ thẻ trắng của nó.
   *
   * Bật ở `/account/subscription`, nơi màn này là cả một TRANG; tắt ở trang Cửa hàng, nơi nó
   * được nhúng vào trong `ShopSectionCard` và khung thứ hai là hai lớp viền cho một nội dung.
   */
  framed?: boolean;
}) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const canPurchase = has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const { tenant } = useTenantScope();
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050 §10) chỉ XEM gói đang dùng và sổ hoá đơn: không lời mời nâng
   * cấp (đó là việc MUA gói) và không khối chuyển khoản của hoá đơn đang chờ.
   */
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.PLAN_PURCHASE);

  /*
   * Chủ xe tuyến hoa hồng ⇒ màn NÂNG CẤP thay cho hộp thoại mua. Điều kiện đọc từ luật dùng chung
   * (ADR 0038 điều 1 · ADR 0040 điều 4): nhân viên gian hàng hoa hồng, tenant thiếu gói hiện hành
   * và gian hàng đã từng trả tiền đều KHÔNG rơi vào đây — với họ đây vẫn là màn gia hạn.
   */
  const upgrading = canPurchase && canUpgradeToPackageTrack(tenant);

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
        upgrading={upgrading}
        framed={framed}
        onPurchase={() => (upgrading ? focusUpgradeSection() : setPurchaseOpen(true))}
      />
      {/*
        "Nâng cấp để mở khoá" là một THẺ RIÊNG, không nằm trong khối gói: nó nói về thứ người
        dùng chưa có, và lồng nó vào trong thẻ trắng của gói hiện hành làm hai chuyện khác nhau
        đọc ra như một. Tự biến mất khi không còn tính năng nào bị khoá.
      */}
      {inSupport ? null : (
        <PlanFeatureList
          onUpgrade={canPurchase && !upgrading ? () => setPurchaseOpen(true) : undefined}
        />
      )}
      {upgrading ? <PackageUpgradeWizard /> : null}
      {/*
        Luồng nâng cấp đã dựng khối chuyển khoản ở bước 3 của nó. Để sổ hoá đơn dựng thêm một
        khối nữa là hai mã QR cho CÙNG một hoá đơn trên cùng một trang.
      */}
      <SubscriptionInvoicesPanel showPending={!upgrading && !inSupport} />
      {/* Tuyến hoa hồng KHÔNG dựng hộp thoại mua: luồng của họ đã nằm ngay trên trang. */}
      {canPurchase && !upgrading ? (
        <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * Cuộn tới khối nâng cấp VÀ đặt tiêu điểm vào tiêu đề của nó.
 *
 * Tiêu điểm là nửa thường bị quên: cuộn không thôi thì người dùng bàn phím vẫn đứng ở nút vừa
 * bấm, và phím Tab tiếp theo đưa họ sang một nút khác hẳn thay vì vào bảng giá.
 *
 * `preventScroll` cho `focus()`: `scrollIntoView` ở trên đã cuộn mượt, để trình duyệt cuộn lần
 * thứ hai (tức thời) sẽ giật ngược giữa animation.
 */
function focusUpgradeSection(): void {
  const el = document.getElementById(UPGRADE_TITLE_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}
