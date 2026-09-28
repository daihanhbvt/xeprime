import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_ERROR_CODE, PROMO_INELIGIBLE_REASON, promoTripKey } from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import { previewPromoCode, type PromoPreview, type PromoTripParams } from '@/api/promo-codes/api';

export interface PromoCodeState {
  /** Mã ĐANG áp (đã chuẩn hoá) — chuỗi gửi kèm khi tạo yêu cầu thuê. */
  appliedCode: string | null;
  applied: PromoPreview | null;
  checking: boolean;
  /** Lý do lần áp gần nhất thất bại (`PromoIneligibleReason`). */
  reason: string | null;
  /** Mã vừa bị BỎ vì điều kiện thuê đổi — màn hình phải nói ra, không im lặng. */
  droppedCode: string | null;
  apply: (code: string) => void;
  remove: () => void;
  /** Bỏ mã vì SERVER từ chối lúc gửi yêu cầu (`PROMO_CODE_*`). */
  rejectByServer: (error: unknown) => boolean;
}

/**
 * Trạng thái MÃ KHUYẾN MÃI của luồng đặt xe trên APP — ADR 0046.
 *
 * ⚠️ Web có bản song song ở `apps/web/src/features/promo-codes/use-promo-code.ts` (ADR 0031: mỗi
 * app một tầng gọi API, và hook này nằm trên tầng đó). Hai bản KHÔNG tự đồng bộ — sửa hành vi ở
 * một bên là phải sửa cả bên kia.
 *
 * Phần KHÔNG được phép lệch đã được đưa xuống `@xeprime/types`:
 *   - công thức số giảm và các trần → `computePromoDiscount` (chỉ server gọi);
 *   - lý do không áp được → `PROMO_INELIGIBLE_REASON`;
 *   - **khoá nhận diện chuyến** → `promoTripKey`. Đây là thứ dễ lệch nhất và đắt nhất: một bên
 *     canh 7 trường còn bên kia canh 5 thì bên kia âm thầm giữ số giảm của chuyến CŨ.
 *
 * Bất biến hook giữ: **mã đang áp phải luôn ứng với chuyến ĐANG hiển thị.** Giữ số cũ là hiện
 * một tổng tiền không tồn tại; bỏ mã im lặng là tăng tiền khách phải trả mà không nói.
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
       * Server từ chối ở cửa GỬI — mã vừa hết lượt giữa lúc khách xem và lúc bấm, hoặc điều kiện
       * vừa đổi. Bỏ mã và NÓI ra; lượt gửi không đi tiếp.
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
   * XÁC MINH LẠI khi chuyến đổi. Khoá so sánh là chuỗi đã serialize (`promoTripKey`), không phải
   * một danh sách dependency: `trip` là object dựng lại mỗi lần render, nên để nó trong deps sẽ
   * gọi lại server mỗi nhịp nhập liệu.
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
    // Chuyến không còn báo giá được — trạng thái báo ra được DẪN XUẤT ở cuối hook, không ghi state.
    if (!trip || !tripKey) return;

    previewM.mutate(
      { code: appliedCode, forTrip: trip },
      {
        onSuccess: (result) => {
          if (result.applicable) {
            // Số giảm có thể ĐỔI theo chuyến mới — ghi lại bằng con số vừa nhận.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, appliedCode]);

  const hasTrip = trip != null && tripKey != null;

  return {
    appliedCode: hasTrip ? appliedCode : null,
    applied: hasTrip ? applied : null,
    checking: previewM.isPending,
    reason: hasTrip ? reason : null,
    droppedCode: hasTrip ? droppedCode : (appliedCode ?? droppedCode),
    apply,
    remove,
    rejectByServer,
  };
}
