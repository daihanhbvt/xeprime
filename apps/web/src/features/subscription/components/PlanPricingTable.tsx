'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useAppFormat } from '@/i18n/use-app-format';

import type { PlanPurchaseState } from '../plan-purchase';
import styles from './PlanPricingTable.module.css';

/**
 * Nơi bậc TƯ VẤN dẫn tới — trung tâm hỗ trợ công khai.
 *
 * Không dựng một biểu mẫu "để lại thông tin" riêng: kênh liên hệ thật của nền tảng (hotline,
 * email, giờ làm việc) đã sống ở một chỗ có tên, và một biểu mẫu thứ hai là một hàng đợi thứ hai
 * mà chưa ai nhận. Khi có đội bán hàng thật thì đổi ĐÚNG hằng này.
 */
const CONTACT_SALES_HREF = '/support';

/**
 * BẢNG GIÁ ba bậc — phần vẽ của bộ chọn mua gói (ADR 0041). Dùng CHUNG cho `PurchaseModal`
 * (gia hạn / nâng bậc) và bước 2 của onboarding gian hàng trả phí.
 *
 * Không giữ state và không biết gì về tiền: cả hai nằm ở `usePlanPurchase`, và nơi gọi sở hữu
 * hook đó vì chính nó cần `selection` để bật/khoá nút "Tạo hoá đơn" của mình. Lý do đầy đủ ở
 * docblock của `plan-purchase.ts`.
 *
 * ## Bậc TƯ VẤN vẫn có thẻ
 *
 * Bậc `salesOnly` không mua được, nhưng thẻ của nó ở lại (ADR 0041 điều 5): giấu bậc doanh
 * nghiệp là giấu lối nâng cấp của chính nhóm khách hàng lớn nhất, và một bảng giá dừng ở "10
 * xe" nói rằng nền tảng không phục vụ được đội xe lớn hơn. Chỗ của giá là một dòng "Liên hệ báo
 * giá" + nút liên hệ — không phải một con số, vì chưa có con số nào.
 *
 * ## Kỳ hạn chỉ mở ra ở bậc ĐANG CHỌN
 *
 * Vẽ cả bốn kỳ hạn trên cả ba thẻ là mười hai con số cho một quyết định hai bước. Thẻ hiện giá
 * THÁNG (mốc rẻ nhất để so ngang các bậc); chọn bậc rồi mới tới bảng kỳ hạn bên dưới, nơi %
 * tiết kiệm có nghĩa vì nó so với chính giá tháng của bậc đó.
 */
export function PlanPricingTable({ state }: { state: PlanPurchaseState }) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();

  const { tiers, planId, selected, termMonths } = state;

  return (
    <div className={styles.wrap}>
      <div className={styles.tiers} role="radiogroup" aria-label={t('purchase.planLabel')}>
        {tiers.map((tier) => {
          const active = tier.plan.id === planId;
          const monthly = tier.terms.find((term) => term.months === 1) ?? tier.terms[0];
          return (
            <div
              key={tier.plan.id}
              className={`${styles.tier} ${active ? styles.tierActive : ''} ${
                tier.selfServe ? '' : styles.tierEnterprise
              }`}
            >
              <div className={styles.tierHead}>
                <span className={styles.tierName}>{tier.plan.name}</span>
                {tier.limits.recommended ? (
                  <Tag color="orange">{t('purchase.recommendedTag')}</Tag>
                ) : null}
                {tier.selfServe ? null : <Tag>{t('purchase.enterpriseTag')}</Tag>}
              </div>
              {tier.plan.description ? (
                <p className={styles.tierDesc}>{tier.plan.description}</p>
              ) : null}

              <ul className={styles.limits}>
                <li>
                  <CheckCircleFilled aria-hidden="true" />
                  {tier.limits.maxVehicles == null
                    ? t('purchase.limitVehiclesUnlimited')
                    : t('purchase.limitVehicles', { count: tier.limits.maxVehicles })}
                </li>
                <li>
                  <CheckCircleFilled aria-hidden="true" />
                  {tier.limits.maxBranches == null
                    ? t('purchase.limitBranchesUnlimited')
                    : t('purchase.limitBranches', { count: tier.limits.maxBranches })}
                </li>
              </ul>

              {tier.selfServe && monthly ? (
                <p className={styles.tierPrice}>
                  <strong>{fmt.money(String(monthly.total))}</strong>
                  <span>{t('purchase.perTerm', { months: monthly.months })}</span>
                </p>
              ) : (
                <p className={styles.tierQuote}>{t('purchase.contactForQuote')}</p>
              )}

              {/*
                `<button>` thật chứ không phải một `<div onClick>`: đây là một bộ chọn, nên bàn
                phím phải đi qua được và trình đọc màn hình phải nghe ra "1 trong 3".
              */}
              {tier.selfServe ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={styles.tierAction}
                  onClick={() => state.selectPlan(tier.plan.id)}
                >
                  {active ? t('purchase.tierSelected') : t('purchase.tierSelect')}
                </button>
              ) : (
                /*
                  Một LIÊN KẾT, không phải một nút mở hộp thoại: đích đến là một trang thật
                  (trung tâm hỗ trợ), nên nó phải mở được ở tab mới, sao chép được, và hoạt động
                  khi JS chưa chạy. Nút giả dạng liên kết lấy đi cả ba.
                */
                <Link href={CONTACT_SALES_HREF} className={styles.tierAction}>
                  {t('purchase.contactSales')}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {selected?.selfServe ? (
        <div className={styles.terms}>
          <div className={styles.termsTitle}>
            {t('purchase.termsTitleFor', { plan: selected.plan.name })}
          </div>
          <div className={styles.termCards} role="radiogroup" aria-label={t('purchase.termsTitle')}>
            {selected.terms.map((choice) => (
              <button
                key={choice.months}
                type="button"
                role="radio"
                aria-checked={termMonths === choice.months}
                className={`${styles.termCard} ${
                  termMonths === choice.months ? styles.termCardActive : ''
                }`}
                onClick={() => state.setTermMonths(choice.months)}
              >
                <span className={styles.termMonths}>
                  {t('purchase.termOption', { months: choice.months })}
                </span>
                <span className={styles.termTotal}>{fmt.money(String(choice.total))}</span>
                {/*
                  % tiết kiệm là một phép SO SÁNH với giá tháng của chính bậc này, không phải một
                  khoản giảm trên hoá đơn (ADR 0041 điều 2). Bậc không bán kỳ 1 tháng thì không có
                  mốc để so và nhãn vắng mặt — im lặng đúng hơn một con số không kiểm chứng được.
                */}
                {choice.savingPercent > 0 ? (
                  <Tag color="green" className={styles.termSaving}>
                    {t('purchase.termSaving', { percent: choice.savingPercent })}
                  </Tag>
                ) : null}
              </button>
            ))}
          </div>

          {/*
            Tổng tiền là CHỮ, không chỉ một con số to: khi chưa chọn kỳ hạn nó phải nói ra điều
            đó ("Chọn kỳ hạn"), không im lặng. `aria-live` vì nó đổi do một cú bấm ở chỗ khác
            trên màn hình — trình đọc màn hình phải nghe được con số mới.
          */}
          <div className={styles.total} aria-live="polite">
            {state.total == null
              ? t('purchase.pickTerm')
              : t('purchase.total', { amount: fmt.money(String(state.total)) })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
