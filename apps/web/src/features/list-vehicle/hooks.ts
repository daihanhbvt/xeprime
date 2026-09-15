'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import {
  isPublishRequirement,
  POLICY_SOURCE,
  SERVICE_TYPE,
  VEHICLE_PUBLIC_STATUS,
  type PublishRequirement,
} from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';

import { createVehicle, submitVehiclePublic } from '@/features/vehicles/api';
import type { VehicleDetail } from '@/features/vehicles/types';
import { fetchVehiclePricing, saveVehiclePricing } from '@/features/rental-policies/api';
import type { SaveRentalPolicyInput } from '@/features/rental-policies/types';
import { patchVehicleServiceSetting } from '@/features/vehicle-manage/api';
import { getErrorDetails } from '@/services/api-client';

import { quickVehicleToCreateInput, quickVehicleToPolicyInput } from './mappers';
import type { QuickVehicleValues } from './schema';

/** Kết quả một lần chạy wizard — phân biệt "đã lưu nháp" với "đã tạo phiếu duyệt xe thật". */
export interface QuickRegistrationResult {
  vehicle: VehicleDetail;
  /**
   * Đã tạo được phiếu duyệt công khai cho chính chiếc xe này chưa.
   *
   * `true` chỉ khi server trả về xe ở `pending_public_review` — tức phiếu duyệt CÓ THẬT. Màn kết
   * quả đọc thẳng cờ này, nên không có đường nào để nó nói "đã gửi duyệt" khi chưa có phiếu.
   */
  submitted: boolean;
  /**
   * Điều kiện lên chợ còn thiếu, dưới dạng MÃ (`PUBLISH_REQUIREMENT`).
   *
   * Chỉ có giá trị khi người dùng bấm "Lưu & gửi duyệt" mà server từ chối. Xe vẫn nằm nháp và
   * sửa lại được — đây là danh sách việc phải làm, không phải một lỗi kỹ thuật.
   */
  missingRequirements: PublishRequirement[];
  /**
   * Phần CHƯA lưu được sau khi xe đã tồn tại (chính sách giá, thiết lập tự nhận, gửi duyệt).
   * Có giá trị = xe vẫn an toàn ở dạng nháp, người dùng thử lại không tạo xe thứ hai.
   */
  partialError: string | null;
}

interface RunOptions {
  submitForReview: boolean;
  /** Câu lỗi hiển thị cho người dùng — nơi gọi truyền hàm dịch mã lỗi API. */
  toMessage: (error: unknown) => string;
}

/**
 * Điều phối wizard đăng xe nhanh trên các API ĐÃ CÓ — không có endpoint "đăng ký gộp" nào mới.
 *
 * Thứ tự: tạo xe → lưu giá + chính sách → thiết lập tự nhận → **gửi duyệt XE**. Bốn bước, ba
 * trong số đó cần `vehicleId`, nên bước một là điểm không thể quay lui.
 *
 * ## Chỉ còn MỘT đích cho nút "Gửi duyệt" (ADR 0036)
 *
 * Bản trước rẽ hai nhánh: gian hàng chưa `active` thì gửi HỒ SƠ GIAN HÀNG, `active` rồi thì gửi
 * XE — và xe được backend tự đẩy đi duyệt sau khi hồ sơ qua. Nó chạy được, nhưng vẫn là hai vòng
 * duyệt cho một người có một chiếc xe, và người dùng phải chờ hết vòng thứ nhất mới biết chiếc
 * xe của mình có vấn đề gì không.
 *
 * Giờ gian hàng mở ra đã `active` ngay, nên ở đây chỉ còn một lời gọi: `submit-public`. Không có
 * nhánh nào đọc `tenant.status` nữa — đọc nó chính là cách hai cổng cũ lẻn trở lại.
 *
 * **Chống tạo xe trùng khi thử lại** là lý do hook này tồn tại: `createdVehicleRef` giữ chiếc xe
 * vừa tạo, và mọi lần bấm lại sau đó đi tiếp từ bước còn dở thay vì gọi `POST /vehicles` lần
 * nữa. Không có nó, một lỗi mạng ở bước lưu giá sẽ đẻ ra chiếc xe thứ hai mỗi lần người dùng
 * bấm "Thử lại" — và chủ xe phải tự dọn.
 */
export function useQuickVehicleRegistration() {
  const queryClient = useQueryClient();
  const createdVehicleRef = useRef<VehicleDetail | null>(null);
  /*
   * Cùng một chiếc xe ở hai chỗ có chủ đích: `ref` để `run` đọc ĐỒNG BỘ (closure của lần bấm
   * trước không được nhìn thấy một giá trị cũ), `state` để giao diện render lại khi nó xuất
   * hiện. Đọc ref trong lúc render là hành vi không xác định ở React 19.
   */
  const [createdVehicle, setCreatedVehicle] = useState<VehicleDetail | null>(null);
  const [pending, setPending] = useState(false);
  /*
   * Cờ chống chạy trùng phải là REF, không phải state: hai lần bấm trong CÙNG một tick (chuột
   * nhanh, hoặc Enter kèm click) đều đọc `pending` của lần render trước và cùng thấy `false` —
   * đúng lúc đó `POST /vehicles` chạy hai lần và chủ xe có hai chiếc xe giống hệt nhau.
   */
  const runningRef = useRef(false);

  const run = useCallback(
    async (
      values: QuickVehicleValues,
      { submitForReview, toMessage }: RunOptions,
    ): Promise<QuickRegistrationResult> => {
      // Chặn gửi trùng do bấm nhanh/Enter: nút `loading` chỉ nuốt sự kiện chuột.
      if (runningRef.current) throw new Error('busy');
      runningRef.current = true;
      setPending(true);
      try {
        let vehicle = createdVehicleRef.current;
        if (!vehicle) {
          vehicle = await createVehicle(quickVehicleToCreateInput(values));
          createdVehicleRef.current = vehicle;
          setCreatedVehicle(vehicle);
        }

        let partialError: string | null = null;
        let missingRequirements: PublishRequirement[] = [];

        try {
          /*
           * Giá + chính sách trong MỘT lần ghi (`PUT /vehicles/:id/pricing`). Đọc chính sách
           * hiệu lực trước rồi merge: gửi một bộ chính sách rỗng sẽ xoá cọc/quá giờ/ưu đãi mà
           * gian hàng đã cấu hình — wizard này chỉ được đụng đúng phần nó hỏi.
           */
          const current = await fetchVehiclePricing(vehicle.id);
          const base = current.policy ?? current.shopPolicy ?? null;
          await saveVehiclePricing(vehicle.id, {
            source: POLICY_SOURCE.VEHICLE,
            weekdayPrice: values.weekdayPrice != null ? String(values.weekdayPrice) : undefined,
            discountPercent: values.discountEnabled ? (values.discountPercent ?? null) : null,
            policy: quickVehicleToPolicyInput(values, base) as SaveRentalPolicyInput,
          });

          /*
           * Tự động nhận chuyến ghi vào thiết lập THẬT của dịch vụ tự lái (`vehicle_service_settings`)
           * — cùng bản ghi mà không gian quản lý xe và orchestration duyệt yêu cầu đang đọc.
           * Chỉ gọi khi người dùng bật: mặc định của server đã là tắt.
           */
          if (values.autoAcceptEnabled || values.termsText.trim()) {
            await patchVehicleServiceSetting(vehicle.id, SERVICE_TYPE.SELF_DRIVE, {
              ...(values.autoAcceptEnabled ? { autoAcceptEnabled: true } : {}),
              ...(values.termsText.trim() ? { termsText: values.termsText.trim() } : {}),
            });
          }
        } catch (err) {
          partialError = toMessage(err);
        }

        if (submitForReview && !partialError) {
          try {
            vehicle = await submitVehiclePublic(vehicle.id);
            createdVehicleRef.current = vehicle;
            setCreatedVehicle(vehicle);
          } catch (err) {
            /*
             * "Còn thiếu điều kiện" KHÔNG phải lỗi kỹ thuật — nó là danh sách việc phải làm, và
             * màn kết quả trình bày nó như vậy. Tách khỏi `partialError` vì hai thứ dẫn tới hai
             * hành động khác hẳn: một cái là "bổ sung rồi gửi lại", cái kia là "thử lại".
             */
            const missing = publishRequirementsFrom(err);
            if (missing.length > 0) missingRequirements = missing;
            // Xe ĐÃ tồn tại ở dạng nháp — nói đúng điều đó thay vì "tạo xe thất bại".
            else partialError = toMessage(err);
          }
        }

        await queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
        /*
         * Bậc chủ xe (`resolveOwnerStage`) đọc `publicVehicleCount` từ `/auth/me`, và menu
         * `/account` đổi theo nó. Chiếc xe vừa vào hàng đợi chưa làm bậc đổi, nhưng phiên có thể
         * đã cũ từ trước — làm mới ở đây rẻ hơn nhiều so với việc chủ xe thấy một menu sai.
         */
        await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });

        return {
          vehicle,
          submitted: vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
          missingRequirements,
          partialError,
        };
      } finally {
        runningRef.current = false;
        setPending(false);
      }
    },
    [queryClient],
  );

  return {
    run,
    pending,
    /** Xe đã tạo ở lần chạy trước (nếu có) — dùng để hiện lối "quản lý xe" khi lỗi giữa chừng. */
    createdVehicle,
  };
}

/**
 * `details.missing[]` của `VEHICLE_PUBLISH_INCOMPLETE` → danh sách mã đã lọc.
 *
 * Lọc qua `isPublishRequirement` chứ không tin thẳng mảng từ mạng: một mã lạ (backend mới hơn
 * web) sẽ thành `t('requirements.<mã lạ>')` và next-intl ném ra giữa lúc render. Thà hiện thiếu
 * một dòng còn hơn làm trắng màn hình của người vừa điền xong cả wizard.
 */
function publishRequirementsFrom(error: unknown): PublishRequirement[] {
  const missing = getErrorDetails(error)?.missing;
  return Array.isArray(missing) ? missing.filter(isPublishRequirement) : [];
}
