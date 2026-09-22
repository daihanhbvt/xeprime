'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_ERROR_CODE, PROMO_INELIGIBLE_REASON, promoTripKey } from '@xeprime/types';
import { getErrorCode } from '@/services/api-client';
import { previewPromoCode } from './api';
import type { PromoPreview, PromoTripParams } from './types';

export interface PromoCodeState {
  /** Mã ĐANG áp (đã chuẩn hoá) — đây là chuỗi gửi kèm khi tạo yêu cầu thuê. */
  appliedCode: string | null;
  /** Kết quả xem trước của mã đang áp — nguồn của số giảm và tổng khách trả. */
  applied: PromoPreview | null;
  checking: boolean;
  /** Lý do lần áp gần nhất thất bại (`PromoIneligibleReason`). */
  reason: string | null;
  /** Mã vừa bị BỎ vì điều kiện thuê đổi — giao diện phải nói ra, không im lặng. */
  droppedCode: string | null;
  apply: (code: string) => void;
  remove: () => void;
  /** Bỏ mã vì SERVER từ chối lúc gửi yêu cầu (`PROMO_CODE_*`). */
  rejectByServer: (error: unknown) => boolean;
}

/**
 * Trạng thái MÃ KHUYẾN MÃI của một luồng đặt xe — ADR 0046.
 *
 * ## Vì sao là một hook riêng, không phải vài `useState` trong `RequestBookingFlow`
 *
 * Nó giữ một bất biến khó: **mã đang áp phải luôn ứng với chuyến ĐANG hiển thị**. Khách đổi thời
 * gian, đổi dịch vụ, đổi lộ trình hay đổi gói là số giảm có thể đổi theo (hoặc mã hết đủ điều
 * kiện vì tụt dưới đơn tối thiểu). Giữ số cũ là hiện một tổng tiền không tồn tại; bỏ mã im lặng
 * là tăng tiền khách phải trả mà không nói. Cả hai đều bị cấm, nên cả hai nhánh phải nằm cùng
 * một chỗ với thứ theo dõi sự thay đổi.
 *
 * ## Ba cửa kiểm, hook này lo cửa thứ nhất
 *
 * Hook chỉ gọi `preview` (đọc thuần, không giữ lượt). Cửa thứ hai là lúc GỬI yêu cầu — server
 * đánh giá lại và giữ lượt, và nếu nó từ chối thì {@link PromoCodeState.rejectByServer} bỏ mã
 * rồi để luồng gửi lại. Cửa thứ ba là lúc chốt giá, hoàn toàn ở server.
 */
export function usePromoCode(trip: PromoTripParams | null): PromoCodeState {
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [applied, setApplied] = useState<PromoPreview | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [droppedCode, setDroppedCode] = useState<string | null>(null);

  const previewM = useMutation({
    mutationFn: ({ code, forTrip }: { code: string; forTrip: PromoTripParams }) =>
      previewPromoCode(code, forTrip),
  });

  const apply = useCallback(
    (code: string) => {
      if (!trip) return;
      setDroppedCode(null);
      setReason(null);
      previewM.mutate(
        { code, forTrip: trip },
        {
          onSuccess: (result) => {
            if (result.applicable) {
              setAppliedCode(result.code);
              setApplied(result);
              setReason(null);
              return;
            }
            /*
             * Không áp được KHÔNG phải một lỗi: server đã trả lời, và câu trả lời là lý do. Giữ
             * `appliedCode = null` để không có mã nào đi kèm lượt gửi yêu cầu.
             */
            setAppliedCode(null);
            setApplied(null);
            setReason(result.reason ?? PROMO_INELIGIBLE_REASON.NOT_FOUND);
          },
          onError: () => {
            setAppliedCode(null);
            setApplied(null);
            setReason(PROMO_INELIGIBLE_REASON.NOT_FOUND);
          },
        },
      );
    },
    [previewM, trip],
  );

  const remove = useCallback(() => {
    setAppliedCode(null);
    setApplied(null);
    setReason(null);
    setDroppedCode(null);
  }, []);

  const rejectByServer = useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      if (
        code !== API_ERROR_CODE.PROMO_CODE_NOT_APPLICABLE &&
        code !== API_ERROR_CODE.PROMO_CODE_EXHAUSTED
      ) {
        return false;
      }
      /*
       * Server từ chối ở cửa GỬI — hai ca thật: mã vừa hết lượt giữa lúc khách xem và lúc bấm,
       * hoặc điều kiện vừa đổi. Bỏ mã và NÓI ra; lượt gửi không đi tiếp, khách bấm lại với con
       * số đã cập nhật.
       */
      setDroppedCode(appliedCode);
      setAppliedCode(null);
      setApplied(null);
      setReason(null);
      return true;
    },
    [appliedCode],
  );

  /*
   * XÁC MINH LẠI khi chuyến đổi.
   *
   * Khoá so sánh là bộ tham số ĐÃ SERIALIZE, không phải một danh sách dependency: `trip` là một
   * object dựng lại mỗi lần render, nên để nó trong deps sẽ gọi lại server mỗi nhịp nhập liệu.
   *
   * Lần đầu áp mã KHÔNG kích hoạt nhánh này (`lastTripKey` được đặt ngay lúc áp), nên không có
   * lượt gọi kép.
   */
  const tripKey = trip ? promoTripKey(trip) : null;
  const lastTripKey = useRef<string | null>(null);

  useEffect(() => {
    if (!appliedCode) {
      lastTripKey.current = tripKey;
      return;
    }
    if (tripKey === lastTripKey.current) return;
    lastTripKey.current = tripKey;
    /*
     * Chuyến không còn báo giá được (khách xoá thời gian) — KHÔNG ghi state ở đây.
     *
     * Trạng thái báo ra được DẪN XUẤT ở cuối hook (`trip ? … : null`): ghi state trong thân
     * effect là một vòng render phụ mà React 19 cảnh báo, và ở đây nó cũng không cần thiết —
     * "mã không ứng với chuyến nào" là một hệ quả của việc `trip` rỗng, không phải một sự kiện
     * cần ghi lại.
     */
    if (!trip || !tripKey) return;

    previewM.mutate(
      { code: appliedCode, forTrip: trip },
      {
        onSuccess: (result) => {
          if (result.applicable) {
            // Số giảm có thể ĐỔI theo chuyến mới — ghi lại bằng con số vừa nhận, không giữ số cũ.
            setApplied(result);
            setDroppedCode(null);
            return;
          }
          setDroppedCode(appliedCode);
          setAppliedCode(null);
          setApplied(null);
          setReason(result.reason ?? null);
        },
        onError: () => {
          setDroppedCode(appliedCode);
          setAppliedCode(null);
          setApplied(null);
        },
      },
    );
    // `previewM` là một object mutation ổn định của TanStack Query; đưa nó vào deps không đổi gì
    // nhưng làm lint không đọc được ý định của khoá `tripKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, appliedCode]);

  /*
   * DẪN XUẤT theo `trip`: chưa có chuyến báo giá được thì không có mã nào đang áp, và hook nói
   * ra điều đó thay vì giữ một `appliedCode` treo.
   *
   * Giữ giá trị trong state (không xoá) là có chủ đích: khách xoá thời gian rồi chọn lại đúng
   * khoảng cũ thì mã của họ sống lại sau một lượt xác minh, không phải gõ lại.
   */
  const hasTrip = trip != null && tripKey != null;

  return {
    appliedCode: hasTrip ? appliedCode : null,
    applied: hasTrip ? applied : null,
    checking: previewM.isPending,
    reason: hasTrip ? reason : null,
    /* Mã đang áp mà chuyến biến mất ⇒ nói cho khách biết mã đang tạm không áp vào đâu cả. */
    droppedCode: hasTrip ? droppedCode : (appliedCode ?? droppedCode),
    apply,
    remove,
    rejectByServer,
  };
}
