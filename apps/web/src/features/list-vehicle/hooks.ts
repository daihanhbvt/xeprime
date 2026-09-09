'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { POLICY_SOURCE, SERVICE_TYPE, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';

import { createVehicle, submitVehiclePublic } from '@/features/vehicles/api';
import type { VehicleDetail } from '@/features/vehicles/types';
import { fetchVehiclePricing, saveVehiclePricing } from '@/features/rental-policies/api';
import type { SaveRentalPolicyInput } from '@/features/rental-policies/types';
import { patchVehicleServiceSetting } from '@/features/vehicle-manage/api';

import { quickVehicleToCreateInput, quickVehicleToPolicyInput } from './mappers';
import type { QuickVehicleValues } from './schema';

/** Kết quả một lần chạy wizard — phân biệt "đã lưu nháp" với "đã gửi duyệt". */
export interface QuickRegistrationResult {
  vehicle: VehicleDetail;
  /** Đã tạo được phiếu duyệt công khai chưa. */
  submitted: boolean;
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
 * Thứ tự: tạo xe → lưu giá + chính sách → thiết lập tự nhận → gửi duyệt. Bốn bước, ba trong số
 * đó cần `vehicleId`, nên bước một là điểm không thể quay lui.
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
        let submitted = false;

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
            submitted = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
          } catch (err) {
            // Xe ĐÃ tồn tại ở dạng nháp — nói đúng điều đó thay vì "tạo xe thất bại".
            partialError = toMessage(err);
          }
        }

        await queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
        return { vehicle, submitted, partialError };
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
