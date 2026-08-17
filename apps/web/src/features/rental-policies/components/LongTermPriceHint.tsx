'use client';

import { Alert } from 'antd';
import {
  LONG_TERM_SUGGEST_RATIO,
  longTermDailyRate,
  longTermSavingsPercent,
} from '@xeprime/types';
import { formatMoneyVnd } from '@/lib/money';

/** Làm tròn gợi ý về trăm nghìn cho dễ đọc — gợi ý là con số để tham khảo, không phải để khớp lẻ. */
function roundSuggest(value: number): number {
  return Math.round(value / 100_000) * 100_000;
}

/**
 * Gợi ý giá tháng cho chủ xe (17/08 đợt 3): nói rõ giá tự lái hiện tại /ngày, giá dài hạn
 * quy ra /ngày (giảm bao nhiêu %), và dải giá tháng nên điền (65–80% × giá ngày × 30 — vùng
 * chiết khấu 20–35% phổ biến của thuê dài hạn). Giá tháng CAO HƠN thuê theo ngày thì cảnh
 * báo — khách không có lý do chọn dài hạn.
 *
 * Dùng ở CẢ hai bề mặt giá (tab Giá & chính sách + bước Giá khi tạo xe) — một component,
 * hai chỗ không lệch lời khuyên.
 */
export function LongTermPriceHint({
  weekdayPrice,
  monthlyPrice,
}: {
  /** Giá ngày thường đang nhập/đang có (VND, number từ form hoặc string từ API). */
  weekdayPrice: number | string | null | undefined;
  monthlyPrice: number | string | null | undefined;
}) {
  const weekday = weekdayPrice == null ? null : Number(weekdayPrice);
  if (weekday == null || !Number.isFinite(weekday) || weekday <= 0) return null;

  const suggestMin = roundSuggest(weekday * 30 * LONG_TERM_SUGGEST_RATIO.min);
  const suggestMax = roundSuggest(weekday * 30 * LONG_TERM_SUGGEST_RATIO.max);
  const suggestion = `Gợi ý: ${formatMoneyVnd(String(suggestMin))} – ${formatMoneyVnd(String(suggestMax))}/tháng (giảm 20–35% so với thuê theo ngày) để khách có lý do chọn dài hạn.`;

  const monthly = monthlyPrice == null ? null : Number(monthlyPrice);
  if (monthly == null || !Number.isFinite(monthly) || monthly <= 0) {
    return (
      <Alert
        type="info"
        showIcon
        message={`Giá tự lái hiện tại: ${formatMoneyVnd(String(weekday))}/ngày — chưa có giá tháng`}
        description={suggestion}
      />
    );
  }

  const rate = longTermDailyRate(monthly);
  const percent = longTermSavingsPercent(weekday, monthly);
  if (percent == null) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`Giá tháng đang KHÔNG rẻ hơn thuê theo ngày (${formatMoneyVnd(String(rate))}/ngày ≥ ${formatMoneyVnd(String(weekday))}/ngày)`}
        description={`Khách không có lý do chọn dài hạn với mức này. ${suggestion}`}
      />
    );
  }

  return (
    <Alert
      type="success"
      showIcon
      message={`Tự lái ${formatMoneyVnd(String(weekday))}/ngày · dài hạn ${formatMoneyVnd(String(rate))}/ngày (giảm ${percent}%)`}
      description={`Khách thuê dài hạn thấy đúng mức giảm này trên tab dịch vụ. ${suggestion}`}
    />
  );
}
