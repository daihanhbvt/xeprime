'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';

import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';

import type { PlanPurchaseState } from '../plan-purchase';
import { PlanPricingTable } from './PlanPricingTable';
import styles from './PlanPickerPanel.module.css';

/**
 * Câu chữ của màn gọi — mỗi luồng có ngữ cảnh riêng và nói khác nhau.
 *
 * Copy đi bằng PROP thay vì một `useTranslations` trong này: hai luồng dùng panel này thuộc hai
 * namespace khác nhau (`ShopOnboarding.checkout` cho onboarding gian hàng trả phí,
 * `Subscription.upgrade` cho luồng nâng cấp), và gom chúng về một namespace nghĩa là dời khoá —
 * thứ mà app native cũng đang đọc. Cấu trúc dùng chung, câu chữ thuộc về nơi có ngữ cảnh.
 */
export interface PlanPickerCopy {
  /** Không tải được danh mục gói. */
  loadError: string;
  /** Không có bậc gói nào đang bán — lỗi cấu hình phía nền tảng, không phải lựa chọn của người dùng. */
  empty: string;
  emptyHint?: string;
  /** Nhãn nút hành động — bỏ trống khi nơi gọi tự dựng khu hành động của mình (`showSubmit`). */
  submit?: string;
  /** Vì sao nút đang mờ. */
  pickTermHint?: string;
}

/**
 * BỘ CHỌN GÓI + nút hành động — phần dùng CHUNG của mọi màn bán gói trong cổng người dùng.
 *
 * Trước đợt này cùng một thang trạng thái (đang tải → lỗi → danh mục rỗng → bảng giá + quy chế +
 * nút mờ kèm lời giải thích) tồn tại hai bản gần như y hệt ở `PackageShopCheckout` và ở bước 1
 * của luồng nâng cấp. Hai bản nghĩa là một lần sửa dải quy chế sàn hay câu "chưa có gói nào đang
 * bán" chỉ đúng với một nửa số người dùng.
 *
 * Panel KHÔNG sở hữu state: `usePlanPurchase` sống ở nơi gọi vì chính nơi đó cần `selection` để
 * quyết định bước kế tiếp (tạo hoá đơn ngay, hay mở form hồ sơ). Lý do đầy đủ ở docblock của
 * `plan-purchase.ts`.
 */
export function PlanPickerPanel({
  plans,
  state,
  copy,
  submitting,
  errorText,
  showSubmit = true,
  onSubmit,
}: {
  /**
   * Kết quả của `useTenantPlans`. Khai theo HÌNH DẠNG cần dùng, không theo `UseQueryResult` đầy
   * đủ: panel chỉ đọc ba thứ, và một kiểu hẹp giữ cho nó test được mà không phải dựng query thật.
   */
  plans: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  state: PlanPurchaseState;
  copy: PlanPickerCopy;
  /** Đang gửi request của nơi gọi (tạo hoá đơn). */
  submitting: boolean;
  /** Lỗi của bước sau, hiện ngay trên bảng giá. `null` = không có gì để báo. */
  errorText: string | null;
  /**
   * Panel tự dựng nút hành động của nó.
   *
   * Mặc định BẬT: ở màn onboarding, nút đứng sẵn (mờ kèm câu giải thích) để người dùng thấy ngay
   * bước cuối là gì. Màn NÂNG CẤP tắt nó đi vì khu hành động ở đó là cả một dải có tổng tiền,
   * ghi chú bảo mật và bước kế tiếp — thứ chỉ nơi gọi biết cách dựng.
   */
  showSubmit?: boolean;
  onSubmit: () => void;
}) {
  const tCommon = useTranslations('Common');

  if (plans.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (plans.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={copy.loadError}
        action={
          <Button size="small" onClick={() => void plans.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  /*
   * Danh mục không có bậc gói nào đang bán = lỗi cấu hình phía nền tảng. Nói thẳng thay vì hiện
   * một bảng giá rỗng với một nút không bấm được.
   */
  if (state.tiers.length === 0) {
    return <Alert type="warning" showIcon title={copy.empty} description={copy.emptyHint} />;
  }

  return (
    <div className={styles.panel}>
      {errorText ? <Alert type="error" showIcon title={errorText} /> : null}

      <PlanPricingTable state={state} />

      {/*
        Quy chế sàn là văn bản quy định phí dịch vụ và thứ tự hiển thị mà gian hàng đang mua —
        đây là khoảnh khắc nó bắt đầu ràng buộc họ (ADR 0028 điều 9).
      */}
      <LegalConsentNote place="subscription" className={styles.consent} />

      {showSubmit ? (
        <>
          <Button
            type="primary"
            size="large"
            block
            loading={submitting}
            disabled={!state.selection}
            onClick={onSubmit}
          >
            {copy.submit}
          </Button>
          {/*
            Nút mờ phải nói VÌ SAO. Không có dòng này, người dùng chọn xong một bậc rồi thấy nút
            xám và không có cách nào biết mình còn thiếu một cú bấm vào thẻ kỳ hạn.
          */}
          {state.selection ? null : <p className={styles.hint}>{copy.pickTermHint}</p>}
        </>
      ) : null}
    </div>
  );
}
