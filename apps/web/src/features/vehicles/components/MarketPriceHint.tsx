'use client';

import { Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { MARKET_PRICE_BASIS } from '@xeprime/domain';

import { useAppFormat } from '@/i18n/use-app-format';

import { useMarketPriceSuggestion } from '../hooks/use-market-price';
import type { MarketPriceParams } from '../types';
import styles from './MarketPriceHint.module.css';

interface Props extends MarketPriceParams {
  /** Tên tỉnh để nói rõ gợi ý đang nói về đâu — thiếu thì câu phụ lùi về mức toàn quốc. */
  provinceName?: string | null;
  /** Bấm "dùng giá này" → điền số vào ô giá. Không truyền = chỉ hiển thị, không có nút. */
  onApply?: (price: number) => void;
}

/**
 * Khoảng giá tham khảo hiện ngay dưới ô "Giá thuê mỗi ngày".
 *
 * Vì sao cần: chủ xe đăng lần đầu không có cách nào biết xe mình đáng bao nhiêu, và một ô trống
 * không gợi ý gì sẽ được điền bằng phỏng đoán — quá cao thì không ai thuê, quá thấp thì chính họ
 * lỗ. Đây là chỗ duy nhất trong luồng đăng xe mà một con số đúng lúc thay đổi được kết quả.
 *
 * Ba kỷ luật của khối này:
 *
 *  1. **Nói rõ nguồn.** `basis` quyết định câu phụ: "trung vị của 42 xe cùng phân khúc tại Đà
 *     Nẵng" và "mức khởi điểm gợi ý" là hai lời khuyên khác hẳn nhau dù cùng hiện một con số.
 *  2. **Không tự điền.** Nút "dùng giá này" là một hành động của người dùng; ghi đè ô giá mà
 *     không ai bấm là đặt giá hộ chủ xe.
 *  3. **Hỏng thì biến mất.** Gợi ý là trợ giúp, lỗi mạng ở đây không được chặn việc đăng xe —
 *     nên không có trạng thái lỗi nào hiện ra.
 */
export function MarketPriceHint({ provinceName, onApply, ...params }: Props) {
  const t = useTranslations('Vehicles.form.marketPrice');
  const fmt = useAppFormat();
  const { data, isLoading } = useMarketPriceSuggestion(params);

  if (isLoading) return <Skeleton.Input active size="small" className={styles.skeleton} />;
  if (!data) return null;

  const median = Number(data.median);
  const isBaseline = data.basis === MARKET_PRICE_BASIS.BASELINE;
  const range = t('range', { low: fmt.money(data.low), high: fmt.money(data.high) });

  /*
   * Câu phụ theo tập dữ liệu — bốn nhánh của một luật hiển thị, không phải bốn cách xếp chữ.
   * Khai trong thân component để `t` giữ nguyên kiểu đã hẹp theo namespace: nhận `t` qua tham số
   * làm generic của next-intl nở ra tới mức TS bỏ cuộc (TS2589).
   */
  const basisText = (): string => {
    const count = data.sampleSize;
    if (data.basis === MARKET_PRICE_BASIS.PROVINCE_SEGMENT && provinceName) {
      return t('basisProvinceSegment', { count, province: provinceName });
    }
    // Thiếu tên tỉnh thì lùi về bản toàn quốc — nói "tại {province}" với một chỗ trống thì tệ hơn.
    if (
      data.basis === MARKET_PRICE_BASIS.PROVINCE_SEGMENT ||
      data.basis === MARKET_PRICE_BASIS.SEGMENT
    ) {
      return t('basisSegment', { count });
    }
    if (data.basis === MARKET_PRICE_BASIS.VEHICLE_TYPE) return t('basisVehicleType', { count });
    return t('basisBaseline');
  };

  return (
    <div className={styles.box}>
      <p className={styles.range}>{range}</p>
      <p className={styles.basis}>{basisText()}</p>
      {onApply && Number.isFinite(median) ? (
        <Button type="link" size="small" className={styles.apply} onClick={() => onApply(median)}>
          {t(isBaseline ? 'applyBaseline' : 'apply', { price: fmt.money(data.median) })}
        </Button>
      ) : null}
    </div>
  );
}
