'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';

import { laneVehicleType } from '../plan-lanes';
import type { ScopedPlanPurchaseState } from '../plan-purchase';
import { EnterprisePlanCard } from './EnterprisePlanCard';
import { PlanPricingTable, PlanTermCards } from './PlanPricingTable';
import styles from './PlanPickerPanel.module.css';

/**
 * Câu chữ của màn gọi — mỗi luồng có ngữ cảnh riêng và nói khác nhau.
 *
 * Copy đi bằng PROP thay vì một `useTranslations` trong này: hai luồng dùng panel này thuộc hai
 * namespace khác nhau (`ShopOnboarding.checkout` cho onboarding gian hàng trả phí,
 * `Subscription.upgrade` cho luồng nâng cấp), và gom chúng về một namespace nghĩa là dời khoá —
 * thứ mà app native cũng đang đọc. Cấu trúc dùng chung, câu chữ thuộc về nơi có ngữ cảnh. Câu chữ
 * của CHÍNH bộ chọn hai làn (tên làn, bỏ chọn) thì là của `Subscription.lanes`.
 */
export interface PlanPickerCopy {
  /** Không tải được danh mục gói. */
  loadError: string;
  /** Không có bậc gói nào đang bán — lỗi cấu hình phía nền tảng, không phải lựa chọn của người dùng. */
  empty: string;
  emptyHint?: string;
  /** Nhãn nút hành động — bỏ trống khi nơi gọi tự dựng khu hành động của mình (`showSubmit`). */
  submit?: string;
}

/**
 * BỘ CHỌN GÓI HAI LÀN + nút hành động — phần dùng CHUNG của mọi màn bán gói nhiều phạm vi trong cổng
 * người dùng (ADR 0065): onboarding gian hàng trả phí và bước 1 của luồng nâng cấp.
 *
 *   Gói xe máy   [1 xe] [5 xe] [10 xe]
 *   Gói ô tô     [1 xe] [5 xe] [10 xe]
 *   Thời hạn     [1] [3] [6] [12] tháng   - MỘT kỳ cho mọi gói đang chọn
 *   Doanh nghiệp — Liên hệ tư vấn
 *
 * Chọn ÍT NHẤT một làn; làn còn lại để trống là "không mua gói cho loại xe đó" — xe của loại đó
 * không lên chợ cho tới khi có gói (ADR 0065 điều 4), và dòng gợi ý dưới mỗi làn nói đúng điều đó.
 * Một gói ⇒ một hoá đơn; hai gói ⇒ MỘT phiếu thanh toán gộp `XPC…` ở nơi gọi (ADR 0083).
 *
 * Panel KHÔNG sở hữu state: `useScopedPlanPurchase` sống ở nơi gọi vì chính nơi đó cần
 * `selections` để quyết định bước kế tiếp (tạo hoá đơn ngay, hay mở form hồ sơ).
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
  /** Kết quả của `useTenantPlans`, khai theo HÌNH DẠNG cần dùng để test không phải dựng query thật. */
  plans: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  state: ScopedPlanPurchaseState;
  copy: PlanPickerCopy;
  /** Đang gửi request của nơi gọi (tạo hoá đơn). */
  submitting: boolean;
  /** Lỗi của bước sau, hiện ngay trên bảng giá. `null` = không có gì để báo. */
  errorText: string | null;
  /** Panel tự dựng nút hành động. Màn NÂNG CẤP tắt nó đi — khu hành động ở đó là cả một dải. */
  showSubmit?: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations('Subscription.lanes');
  const tPurchase = useTranslations('Subscription.purchase');
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
   * Danh mục không có bậc nào bán được (kể cả bậc tư vấn) = lỗi cấu hình phía nền tảng. Nói thẳng
   * thay vì hiện một bảng giá rỗng với một nút không bấm được.
   */
  if (state.lanes.length === 0 && !state.enterprise) {
    return <Alert type="warning" showIcon title={copy.empty} description={copy.emptyHint} />;
  }

  const canSubmit = state.selections.length > 0 && !state.incomplete;
  const [onlyTier] = state.pickedTiers;
  const sharedTermTitle =
    state.pickedTiers.length > 1
      ? t('sharedTermTitle', { count: state.pickedTiers.length })
      : onlyTier
        ? tPurchase('termsTitleFor', { plan: onlyTier.plan.name })
        : null;

  return (
    <div className={styles.panel}>
      {errorText ? <Alert type="error" showIcon title={errorText} /> : null}

      {state.lanes.map(({ scope, state: lane }) => {
        const Icon = VEHICLE_TYPE_ICON[laneVehicleType(scope)];
        const title = t(`title.${scope}`);
        return (
          <section key={scope} className={styles.lane} aria-label={title}>
            <header className={styles.laneHead}>
              <span className={styles.laneIcon} aria-hidden="true">
                <Icon />
              </span>
              <div className={styles.laneText}>
                <h3 className={styles.laneTitle}>{title}</h3>
                <p className={styles.laneHint}>{t(`pickHint.${scope}`)}</p>
              </div>
              {/*
                Bỏ chọn = "không mua gói cho loại xe này". Chỉ hiện khi đã chọn: một nút bỏ chọn
                trên một làn trống là một nút không làm gì.
              */}
              {lane.planId != null ? (
                <Button size="small" type="link" onClick={lane.reset}>
                  {t('clear')}
                </Button>
              ) : null}
            </header>
            <PlanPricingTable state={lane} label={title} showTerms={false} />
          </section>
        );
      })}

      {/*
        MỘT kỳ hạn cho mọi gói đang chọn - dưới hai làn, không lặp lại dưới từng làn. Hai bậc
        không có kỳ chung (danh mục admin bán lệch kỳ) thì nói thẳng thay vì một hàng thẻ rỗng.
      */}
      {sharedTermTitle ? (
        state.termOptions.length > 0 ? (
          <PlanTermCards
            title={sharedTermTitle}
            hint={state.pickedTiers.length > 1 ? t('sharedTermHint') : tPurchase('termsHint')}
            options={state.termOptions}
            value={state.termMonths}
            onChange={state.setTermMonths}
          />
        ) : (
          <Alert type="warning" showIcon title={t('noSharedTerm')} />
        )
      ) : null}

      {state.enterprise ? <EnterprisePlanCard tier={state.enterprise} /> : null}

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
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {copy.submit}
          </Button>
          {/*
            Nút mờ phải nói VÌ SAO: chưa chọn làn nào, hay đã chọn bậc mà còn thiếu kỳ hạn.
          */}
          {canSubmit ? (
            <p className={styles.hint}>{t('invoiceCount', { count: state.selections.length })}</p>
          ) : (
            <p className={styles.hint}>
              {state.incomplete ? t('pickTermFirst') : t('pickAtLeastOne')}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
