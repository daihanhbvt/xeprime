'use client';

import { CheckCircleFilled, CrownFilled, RiseOutlined, StarFilled } from '@ant-design/icons';
import { Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PLAN_TIER_ICON, type PlanBenefitLine, type PlanTierIcon } from '@xeprime/domain';
import { PLAN_VEHICLE_SCOPE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { PlanPurchaseState } from '../plan-purchase';
import type { TenantPlan } from '../types';
import styles from './PlanPricingTable.module.css';

/**
 * Nơi bậc TƯ VẤN dẫn tới — trung tâm hỗ trợ công khai.
 *
 * Không dựng một biểu mẫu "để lại thông tin" riêng: kênh liên hệ thật của nền tảng (hotline,
 * email, giờ làm việc) đã sống ở một chỗ có tên, và một biểu mẫu thứ hai là một hàng đợi thứ hai
 * mà chưa ai nhận. Khi có đội bán hàng thật thì đổi ĐÚNG hằng này.
 */
export const CONTACT_SALES_HREF = ROUTES.SUPPORT;

/**
 * Huy hiệu của bậc — LOẠI biểu tượng (đường tăng → ngôi sao → vương miện, theo vị trí) do
 * `buildPlanPricingCards` (`@xeprime/domain`) quyết, dùng chung với email hướng dẫn gói. Ở đây chỉ
 * ánh xạ loại → icon AntD.
 */
const TIER_ICONS: Readonly<Record<PlanTierIcon, typeof RiseOutlined>> = {
  [PLAN_TIER_ICON.TREND]: RiseOutlined,
  [PLAN_TIER_ICON.STAR]: StarFilled,
  [PLAN_TIER_ICON.CROWN]: CrownFilled,
};

/**
 * BẢNG GIÁ ba bậc — phần vẽ của bộ chọn mua gói (ADR 0041). Dùng CHUNG cho `PurchaseModal`
 * (gia hạn / nâng bậc), bước 2 của onboarding gian hàng trả phí, và bước 1 của luồng nâng cấp
 * từ tuyến hoa hồng.
 *
 * Không giữ state và không biết gì về tiền: cả hai nằm ở `usePlanPurchase`, và nơi gọi sở hữu
 * hook đó vì chính nó cần `selection` để bật/khoá nút "Tạo hoá đơn" của mình. Lý do đầy đủ ở
 * docblock của `plan-purchase.ts`.
 *
 * ## Bậc TƯ VẤN vẫn có thẻ
 *
 * Bậc `salesOnly` không mua được, nhưng thẻ của nó ở lại (ADR 0041 điều 5): giấu bậc doanh
 * nghiệp là giấu lối nâng cấp của chính nhóm khách hàng lớn nhất, và một bảng giá dừng ở "10
 * xe" nói rằng nền tảng không phục vụ được đội xe lớn hơn. Chỗ của giá là một dòng "Liên hệ" +
 * nút liên hệ — không phải một con số, vì chưa có con số nào.
 *
 * ## Kỳ hạn chỉ mở ra ở bậc ĐANG CHỌN
 *
 * Vẽ cả bốn kỳ hạn trên cả ba thẻ là mười hai con số cho một quyết định hai bước. Thẻ hiện giá
 * THÁNG (mốc rẻ nhất để so ngang các bậc); chọn bậc rồi mới tới bảng kỳ hạn bên dưới, nơi %
 * tiết kiệm có nghĩa vì nó so với chính giá tháng của bậc đó.
 */
export function PlanPricingTable({
  state,
  label,
}: {
  state: PlanPurchaseState;
  /** Tên nhóm cho trình đọc màn hình — mỗi làn một tên ("Gói xe máy"), mặc định nhãn chung. */
  label?: string;
}) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();

  const { tiers, planId, selected, termMonths } = state;

  return (
    <div className={styles.wrap}>
      <div className={styles.tiers} role="radiogroup" aria-label={label ?? t('purchase.planLabel')}>
        {tiers.map((tier) => {
          const active = tier.plan.id === planId;
          const { headline } = tier.card;
          const TierIcon = TIER_ICONS[tier.card.icon];
          /* Bậc được đề xuất nổi bật SẴN, không chờ ai bấm — nó là gợi ý của nền tảng. */
          const featured = active || tier.card.recommended;
          /*
           * Bậc TƯ VẤN dùng ĐÚNG một thẻ như hai bậc kia — không tô nền chìm để "nó là lối khác".
           * Ba thẻ cùng hình dạng mới so sánh được với nhau, và thứ nói ra sự khác biệt là chỗ
           * đáng nói nhất: ô giá ghi "Liên hệ" thay vì một con số.
           */
          return (
            <article
              key={tier.plan.id}
              className={`${styles.tier} ${featured ? styles.tierFeatured : ''}`}
            >
              <div className={styles.tierHead}>
                <span className={styles.tierIcon} aria-hidden="true">
                  <TierIcon />
                </span>
                <h3 className={styles.tierName}>{tier.plan.name}</h3>
                {tier.card.recommended ? (
                  <span className={styles.recommendedTag}>{t('purchase.recommendedTag')}</span>
                ) : null}
              </div>
              {tier.plan.description ? (
                <p className={styles.tierDesc}>{tier.plan.description}</p>
              ) : null}

              <TierBenefits benefits={tier.card.benefits} scope={tier.plan.vehicleScope} />

              {headline ? (
                <p className={styles.tierPrice}>
                  <strong>{fmt.money(headline.price)}</strong>
                  <span>
                    {headline.months === 1
                      ? t('purchase.perMonth')
                      : t('purchase.perTerm', { months: headline.months })}
                  </span>
                </p>
              ) : (
                <p className={styles.tierPrice}>
                  <strong>{t('purchase.contactForQuote')}</strong>
                </p>
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
                  className={`${styles.tierAction} ${featured ? styles.tierActionPrimary : ''}`}
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
            </article>
          );
        })}
      </div>

      {selected?.selfServe ? (
        <div className={styles.terms}>
          <div className={styles.termsHead}>
            <h4 className={styles.termsTitle}>
              {t('purchase.termsTitleFor', { plan: selected.plan.name })}
            </h4>
            <p className={styles.termsHint}>{t('purchase.termsHint')}</p>
          </div>
          <div className={styles.termCards} role="radiogroup" aria-label={t('purchase.termsTitle')}>
            {selected.terms.map((choice) => {
              const picked = termMonths === choice.months;
              return (
                <button
                  key={choice.months}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`${styles.termCard} ${picked ? styles.termCardActive : ''}`}
                  onClick={() => state.setTermMonths(choice.months)}
                >
                  <span className={styles.termText}>
                    <span className={styles.termMonths}>
                      {t('purchase.termOption', { months: choice.months })}
                    </span>
                    <span className={styles.termTotal}>{fmt.money(String(choice.total))}</span>
                    {/*
                      % tiết kiệm là một phép SO SÁNH với giá tháng của chính bậc này, không phải
                      một khoản giảm trên hoá đơn (ADR 0041 điều 2). Bậc không bán kỳ 1 tháng thì
                      không có mốc để so và nhãn vắng mặt — im lặng đúng hơn một con số không
                      kiểm chứng được.
                    */}
                    {choice.savingPercent > 0 ? (
                      <Tag color="green" className={styles.termSaving}>
                        {t('purchase.termSaving', { percent: choice.savingPercent })}
                      </Tag>
                    ) : null}
                  </span>
                  {/*
                    Vòng tròn chọn là HÌNH ẢNH của `aria-checked` ở ngay trên nút — trình đọc màn
                    hình nghe từ thuộc tính, mắt đọc từ vòng tròn. Không phải một `<input radio>`
                    thứ hai: hai điều khiển cho một lựa chọn là hai chỗ để chúng lệch nhau.
                  */}
                  <span className={styles.termRadio} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Những gì bậc này cho — hai dòng HẠN MỨC rồi tới năng lực.
 *
 * Nhãn năng lực lấy từ `Domain.planFeature` (dịch cả vi lẫn en), cùng một bảng mà khối "còn
 * khoá" ở trên đang đọc: hai chỗ nói về cùng một cờ thì phải gọi nó bằng cùng một cái tên, nếu
 * không người dùng đọc thấy "Quản lý công nợ" ở một chỗ và "Theo dõi công nợ" ở chỗ kia rồi
 * tưởng đó là hai thứ.
 */
function TierBenefits({
  benefits,
  scope,
}: {
  benefits: readonly PlanBenefitLine[];
  /** Phạm vi của bậc — trần đọc theo đúng loại xe ("Tối đa 5 xe máy"), không phải "5 xe" chung chung. */
  scope: TenantPlan['vehicleScope'];
}) {
  const t = useTranslations('Subscription');
  const domainLabel = useDomainLabel();

  function label(line: Exclude<PlanBenefitLine, { kind: 'branches' }>): string {
    switch (line.kind) {
      case 'vehicles':
        if (line.count == null) return t('purchase.limitVehiclesUnlimited');
        return scope === PLAN_VEHICLE_SCOPE.MOTORBIKE
          ? t('purchase.limitMotorbikes', { count: line.count })
          : scope === PLAN_VEHICLE_SCOPE.CAR
            ? t('purchase.limitCars', { count: line.count })
            : t('purchase.limitVehicles', { count: line.count });
      case 'feature':
        return domainLabel('planFeature', line.feature);
    }
  }

  const lines = benefits;

  return (
    <ul className={styles.limits}>
      {lines.map((line) => (
        <li key={line.kind === 'feature' ? line.feature : line.kind}>
          <CheckCircleFilled aria-hidden="true" />
          {label(line)}
        </li>
      ))}
    </ul>
  );
}
