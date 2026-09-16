'use client';

import { InputNumber, Select, Tag } from 'antd';
import { useTranslations } from 'next-intl';

import { useAppFormat } from '@/i18n/use-app-format';

import type { PlanPurchaseState } from '../plan-purchase';
import styles from './PlanPurchaseFields.module.css';

/**
 * PHẦN VẼ của bộ chọn mua gói — số chỗ, kỳ hạn, tổng tiền. Dùng CHUNG cho hai màn:
 * `PurchaseModal` (gia hạn / mua thêm chỗ) và bước 2 của onboarding gian hàng trả phí.
 *
 * Không giữ state và không biết gì về tiền: cả hai nằm ở `usePlanPurchase`, và nơi gọi sở hữu
 * hook đó vì chính nó cần `selection` để bật/khoá nút "Tạo hoá đơn" của mình. Lý do đầy đủ ở
 * docblock của `plan-purchase.ts`.
 *
 * Nơi gọi tự xử nhánh "danh mục rỗng": câu chữ khác nhau giữa hai màn (một bên là "hiện chưa có
 * gói nào đang bán", một bên là một màn onboarding không đi tiếp được), và nó cũng đổi luôn cả
 * bố cục — nên trộn vào đây là buộc nơi gọi phải đoán component này có vẽ gì hay không.
 */
export function PlanPurchaseFields({ state }: { state: PlanPurchaseState }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const { purchasable, planId, selected, limits, termMonths, slots, termChoices } = state;

  return (
    <>
      {/*
        Bộ chọn GÓI chỉ hiện khi danh mục có từ hai bậc trở lên. Một `<Select>` một lựa chọn
        không phải là lựa chọn — nó là một bước bấm thừa đứng chắn trước thứ người dùng thật sự
        phải quyết định (bao nhiêu chỗ, cam kết mấy tháng). `usePlanPurchase` tự chọn bậc duy
        nhất đó.
      */}
      {purchasable.length > 1 ? (
        <Select
          className={styles.planSelect}
          size="large"
          placeholder={t('purchase.planLabel')}
          aria-label={t('purchase.planLabel')}
          value={planId}
          options={purchasable.map((p) => ({ value: p.id, label: p.name }))}
          onChange={state.selectPlan}
        />
      ) : null}

      {selected && limits ? (
        <div className={styles.fields}>
          {/*
            Đơn giá chỗ đứng TRƯỚC ô nhập số chỗ: nó là thứ biến "3 ô tô" thành một con số tiền,
            và đặt nó sau ô nhập nghĩa là người dùng gõ một con số rồi mới biết nó đáng bao nhiêu.
            Bậc gói không bán một loại chỗ thì dòng đó vắng mặt, không hiện "0đ".
          */}
          <div className={styles.unitPrices}>
            {limits.perVehiclePrice.car ? (
              <span>
                {t('purchase.unitPriceCar', { amount: fmt.money(limits.perVehiclePrice.car) })}
              </span>
            ) : null}
            {limits.perVehiclePrice.motorbike ? (
              <span>
                {t('purchase.unitPriceMotorbike', {
                  amount: fmt.money(limits.perVehiclePrice.motorbike),
                })}
              </span>
            ) : null}
          </div>

          <div className={styles.groupTitle}>{t('purchase.slotsTitle')}</div>
          <label className={styles.field}>
            <span>{t('purchase.carSlots')}</span>
            <InputNumber
              min={limits.includedCars}
              max={limits.maxCars ?? undefined}
              value={slots.car}
              onChange={state.setCarSlots}
            />
          </label>
          <label className={styles.field}>
            <span>{t('purchase.motorbikeSlots')}</span>
            <InputNumber
              min={limits.includedMotorbikes}
              max={limits.maxMotorbikes ?? undefined}
              value={slots.motorbike}
              onChange={state.setMotorbikeSlots}
            />
          </label>
          {limits.includedCars > 0 || limits.includedMotorbikes > 0 ? (
            <div className={styles.hint}>
              {t('purchase.includedHint', {
                car: limits.includedCars,
                motorbike: limits.includedMotorbikes,
              })}
            </div>
          ) : null}

          {/*
            BA lựa chọn mua, cạnh nhau, mỗi lựa chọn kèm tổng THẬT của số chỗ đang chọn.
            `radiogroup` chứ không phải danh sách nút: người dùng bàn phím phải đi qua ba thẻ
            bằng phím mũi tên như một bộ chọn, và trình đọc màn hình phải đọc được "1 trong 3".
          */}
          <div className={styles.groupTitle}>{t('purchase.termsTitle')}</div>
          <div className={styles.terms} role="radiogroup" aria-label={t('purchase.termsTitle')}>
            {termChoices.map((choice) => (
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
                <span className={styles.termTotal}>
                  {choice.total == null
                    ? tCommon('labels.emptyValue')
                    : t('purchase.termTotal', { amount: fmt.money(String(choice.total)) })}
                </span>
                {state.showPerMonth && choice.perMonth != null ? (
                  <span className={styles.termPerMonth}>
                    {t('purchase.termPerMonth', {
                      amount: fmt.money(String(Math.round(choice.perMonth))),
                    })}
                  </span>
                ) : null}
                {choice.discountPercent > 0 ? (
                  <Tag color="green" className={styles.termDiscount}>
                    {t('purchase.termDiscount', { percent: choice.discountPercent })}
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
              ? termMonths == null
                ? t('purchase.pickTerm')
                : t('purchase.unavailable')
              : t('purchase.total', { amount: fmt.money(String(state.total)) })}
          </div>
        </div>
      ) : null}
    </>
  );
}
