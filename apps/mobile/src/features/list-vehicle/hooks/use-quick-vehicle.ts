import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { queryKeys } from '@xeprime/api-client';
import {
  POLICY_SOURCE,
  REGISTRATION_TRACK,
  SERVICE_TYPE,
  TENANT_TYPE,
  VEHICLE_PUBLIC_STATUS,
  type PublishRequirement,
} from '@xeprime/types';
import type { OwnerProfileValues } from '@xeprime/validators';
import { publishRequirementsFrom } from '@xeprime/domain';
import { quickVehicleToCreateInput, quickVehicleToPolicyInput } from '../quick-mappers';
import type { QuickVehicleValues } from '../quick-schema';
import { vehiclesApi, type VehicleDetail } from '@/api/vehicles/api';
import { vehicleSettingsApi } from '@/api/vehicle-settings/api';
import { tenantsApi, type MyShop } from '@/api/tenants/api';

/** Kết quả một lần chạy wizard — phân biệt "đã lưu nháp" với "đã gửi duyệt". */
export interface QuickRegistrationResult {
  vehicle: VehicleDetail;
  /** Đã tạo được phiếu duyệt công khai chưa. */
  submitted: boolean;
  /**
   * Phần CHƯA lưu được sau khi xe đã tồn tại (chính sách giá, thiết lập tự nhận, gửi duyệt).
   * Có giá trị = xe vẫn an toàn ở dạng nháp, người dùng thử lại không tạo xe thứ hai.
   */
  /**
   * Điều kiện lên chợ còn thiếu, dưới dạng MÃ (`PUBLISH_REQUIREMENT`).
   *
   * Chỉ có giá trị khi người dùng bấm "Lưu & gửi duyệt" mà server từ chối. Xe vẫn nằm nháp và sửa
   * lại được — đây là DANH SÁCH VIỆC PHẢI LÀM, không phải một lỗi kỹ thuật, và màn kết quả trình
   * bày nó như vậy.
   */
  missingRequirements: PublishRequirement[];
  partialError: string | null;
}

interface RunOptions {
  submitForReview: boolean;
  /**
   * Hồ sơ chủ xe CHƯA gửi — chỉ có khi người dùng chưa thuộc gian hàng nào.
   *
   * Có giá trị ⇒ `POST /tenants` chạy NGAY TRƯỚC `POST /vehicles`, trong cùng lần bấm. Đó là
   * điều quan trọng nhất của luồng này: xem docblock của hook.
   */
  ownerProfile?: OwnerProfileValues | null;
  /** Câu lỗi hiển thị cho người dùng — nơi gọi truyền hàm dịch mã lỗi API. */
  toMessage: (error: unknown) => string;
}

/**
 * Điều phối wizard đăng xe nhanh trên các API ĐÃ CÓ — bản native của `useQuickVehicleRegistration`.
 *
 * Thứ tự: tạo xe → lưu giá + chính sách → thiết lập tự nhận → gửi duyệt. Bốn bước, ba trong số
 * đó cần `vehicleId`, nên bước một là điểm không thể quay lui.
 *
 * ## GIAN HÀNG mở ở ĐÂY, không ở bước hồ sơ (17/09/2026)
 *
 * Nếu người dùng chưa thuộc gian hàng nào, `run` gọi `POST /tenants` ngay trước `POST /vehicles`
 * — cùng một lần bấm, cùng một hành động của người dùng.
 *
 * Trước đây `POST /tenants` chạy ở bước "Hồ sơ chủ xe", nên chỉ cần điền xong màn đó rồi thoát
 * ra là tài khoản đã thành chủ xe: có gian hàng, có chi nhánh mặc định, có gói hoa hồng, menu
 * tài khoản đổi hẳn — mà không có chiếc xe nào. Bỏ dở wizard giờ không để lại gì.
 *
 * `branchId` của chiếc xe lấy từ `defaultBranch` mà `POST /tenants` vừa trả về: chi nhánh mặc
 * định sinh ra từ chính địa chỉ người dùng khai ở bước hồ sơ, nên không có lần chọn thứ hai và
 * cũng không cần đợi `GET /branches`.
 *
 * **Chống tạo TRÙNG khi thử lại** là lý do hook này tồn tại: `createdShopRef`/`createdVehicleRef`
 * giữ thứ vừa tạo, và mọi lần bấm lại sau đó đi tiếp từ bước còn dở thay vì gọi lại
 * `POST /tenants` (409) hay `POST /vehicles` (xe thứ hai). Không có nó, một lỗi mạng ở bước lưu
 * giá sẽ đẻ ra chiếc xe thứ hai mỗi lần người dùng bấm "Thử lại" — và chủ xe phải tự dọn.
 */
export function useQuickVehicleRegistration() {
  const queryClient = useQueryClient();
  const createdVehicleRef = useRef<VehicleDetail | null>(null);
  /** Gian hàng vừa mở trong CHÍNH lần chạy này — giữ để lần thử lại không gọi `POST /tenants` lần hai. */
  const createdShopRef = useRef<MyShop | null>(null);
  /*
   * Cùng một chiếc xe ở hai chỗ có chủ đích: `ref` để `run` đọc ĐỒNG BỘ (closure của lần bấm
   * trước không được nhìn thấy một giá trị cũ), `state` để giao diện render lại khi nó xuất
   * hiện. Đọc ref trong lúc render là hành vi không xác định ở React 19.
   */
  const [createdVehicle, setCreatedVehicle] = useState<VehicleDetail | null>(null);
  const [pending, setPending] = useState(false);
  /*
   * Cờ chống chạy trùng phải là REF, không phải state: hai lần chạm trong CÙNG một tick đều đọc
   * `pending` của lần render trước và cùng thấy `false` — đúng lúc đó `POST /vehicles` chạy hai
   * lần và chủ xe có hai chiếc xe giống hệt nhau.
   */
  const runningRef = useRef(false);

  /**
   * Mở gian hàng nếu người dùng chưa có — ĐÚNG MỘT LẦN cho cả vòng đời wizard.
   *
   * Gọi từ hai chỗ:
   *  - bước lưu (`run`), đường chính;
   *  - lần tải ẢNH đầu tiên. `POST /uploads/vehicle-images/presign` là tenant-scoped (khoá đối
   *    tượng nằm dưới `tenants/<id>/vehicles`), nên người chưa có gian hàng sẽ nhận 403 ngay khi
   *    chọn tấm ảnh đầu tiên. Mở gian hàng ở đúng thao tác đó giữ được nguyên tắc của đợt sửa:
   *    server chỉ có dữ liệu khi người dùng thật sự làm một việc, không phải khi họ bấm "Tiếp tục".
   *
   * `ownerProfile` rỗng ⇒ người dùng đã có gian hàng, không có gì để làm.
   */
  const ensureShop = useCallback(
    async (ownerProfile: OwnerProfileValues | null): Promise<MyShop | null> => {
      if (createdShopRef.current) return createdShopRef.current;
      if (!ownerProfile) return null;

      const shop = await tenantsApi.register({
        name: ownerProfile.name,
        tenantType: TENANT_TYPE.INDIVIDUAL,
        /*
         * CỬA VÀO tường minh (ADR 0040) — wizard này LÀ tuyến hoa hồng, và nói ra điều đó rẻ hơn
         * hẳn so với dựa vào giá trị mặc định của server: nếu mặc định đổi, một chủ xe cá nhân sẽ
         * âm thầm rơi vào luồng chờ thanh toán gói.
         */
        registrationTrack: REGISTRATION_TRACK.COMMISSION,
        provinceCode: ownerProfile.provinceCode,
        /*
         * Chuỗi RỖNG không được gửi: DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
         * chỉ bỏ qua `null`/`undefined`. Từ ADR 0042 form không còn ô Xã/phường.
         */
        ...(ownerProfile.wardCode ? { wardCode: ownerProfile.wardCode } : {}),
        ...(ownerProfile.addressLine ? { addressLine: ownerProfile.addressLine } : {}),
        // Ghim toạ độ đi kèm địa chỉ: nó quyết định phí giao xe và chỗ tài xế lái tới.
        ...(ownerProfile.placeId ? { placeId: ownerProfile.placeId } : {}),
        ...(ownerProfile.latitude == null ? {} : { latitude: ownerProfile.latitude }),
        ...(ownerProfile.longitude == null ? {} : { longitude: ownerProfile.longitude }),
        ...(ownerProfile.locationSource ? { locationSource: ownerProfile.locationSource } : {}),
        ...(ownerProfile.email ? { email: ownerProfile.email } : {}),
      });
      createdShopRef.current = shop;
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      /*
       * Phiên vừa có thêm gian hàng: quyền, scope và menu đọc từ `/auth/me`, chi nhánh mặc định
       * vừa sinh ra. Không chờ (`void`) — backend đọc membership từ DB ở mỗi request, không phụ
       * thuộc cache của app.
       */
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });

      /*
       * Giới thiệu ngắn KHÔNG nằm trong `POST /tenants`: DTO đăng ký chỉ nhận những thứ bắt buộc
       * để mở được hồ sơ. Hỏng ở bước này cố ý KHÔNG chặn luồng — hồ sơ đã tồn tại, xe vẫn đăng
       * được, và đoạn giới thiệu sửa lại lúc nào cũng được.
       */
      if (ownerProfile.bio) {
        try {
          await tenantsApi.updateProfile({ bio: ownerProfile.bio });
        } catch {
          // Bỏ qua có chủ đích — xem docblock ngay trên.
        }
      }
      return shop;
    },
    [queryClient],
  );

  const run = useCallback(
    async (
      values: QuickVehicleValues,
      { submitForReview, toMessage, ownerProfile }: RunOptions,
    ): Promise<QuickRegistrationResult> => {
      if (runningRef.current) throw new Error('busy');
      runningRef.current = true;
      setPending(true);
      try {
        /*
         * MỞ GIAN HÀNG — chỉ khi người dùng chưa có. Lỗi ở đây KHÔNG được nuốt: chưa có gian
         * hàng thì không có gì để gắn chiếc xe vào, nên nó ném lên cho wizard hiện câu lỗi.
         */
        const shop = await ensureShop(ownerProfile ?? null);

        let vehicle = createdVehicleRef.current;
        if (!vehicle) {
          /*
           * Chi nhánh mặc định của gian hàng vừa mở thắng `values.branchId`: người đăng ký lần
           * đầu không có bộ chọn chi nhánh nào ở bước 2, nên trường đó còn rỗng.
           */
          const branchId = shop?.defaultBranch?.id ?? values.branchId;
          vehicle = await vehiclesApi.create(quickVehicleToCreateInput({ ...values, branchId }));
          createdVehicleRef.current = vehicle;
          setCreatedVehicle(vehicle);
        }

        let partialError: string | null = null;
        let missingRequirements: PublishRequirement[] = [];
        let submitted = false;

        try {
          /*
           * Giá + chính sách trong MỘT lần ghi (`PUT /vehicles/:id/pricing`). Đọc chính sách
           * hiệu lực trước rồi merge: gửi một bộ chính sách rỗng sẽ xoá cọc/quá giờ/ưu đãi mà
           * gian hàng đã cấu hình — wizard này chỉ được đụng đúng phần nó hỏi.
           */
          const current = await vehiclesApi.pricing(vehicle.id);
          const base = current.policy ?? current.shopPolicy ?? null;
          await vehiclesApi.savePricing(vehicle.id, {
            source: POLICY_SOURCE.VEHICLE,
            weekdayPrice: values.weekdayPrice != null ? String(values.weekdayPrice) : undefined,
            discountPercent: values.discountEnabled ? (values.discountPercent ?? null) : null,
            policy: quickVehicleToPolicyInput(values, base),
          });

          /*
           * Tự động nhận chuyến ghi vào thiết lập THẬT của dịch vụ tự lái
           * (`vehicle_service_settings`) — cùng bản ghi mà không gian quản lý xe và orchestration
           * duyệt yêu cầu đang đọc. Chỉ gọi khi người dùng bật: mặc định của server đã là tắt.
           */
          if (values.autoAcceptEnabled || values.termsText.trim()) {
            await vehicleSettingsApi.patchServiceSetting(vehicle.id, SERVICE_TYPE.SELF_DRIVE, {
              ...(values.autoAcceptEnabled ? { autoAcceptEnabled: true } : {}),
              ...(values.termsText.trim() ? { termsText: values.termsText.trim() } : {}),
            });
          }
        } catch (err) {
          partialError = toMessage(err);
        }

        if (submitForReview && !partialError) {
          try {
            vehicle = await vehiclesApi.submitPublic(vehicle.id);
            createdVehicleRef.current = vehicle;
            setCreatedVehicle(vehicle);
            submitted = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
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
         * Bậc chủ xe (`resolveOwnerStage`) đọc `publicVehicleCount` từ `/auth/me`, và menu tài
         * khoản đổi theo nó. Chiếc xe vừa vào hàng đợi chưa làm bậc đổi, nhưng phiên có thể đã cũ
         * từ trước — làm mới ở đây rẻ hơn nhiều so với việc chủ xe thấy một menu sai.
         *
         * `ensureShop` cũng làm mới `auth`, nhưng CHỈ khi nó thật sự mở gian hàng. Chủ xe đã có
         * gian hàng đăng chiếc xe công khai đầu tiên không đi qua nhánh đó, và đúng họ là người
         * vừa đổi bậc.
         */
        await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        return { vehicle, submitted, missingRequirements, partialError };
      } finally {
        runningRef.current = false;
        setPending(false);
      }
    },
    [ensureShop, queryClient],
  );

  return {
    run,
    ensureShop,
    pending,
    /** Xe đã tạo ở lần chạy trước (nếu có) — dùng để hiện lối "quản lý xe" khi lỗi giữa chừng. */
    createdVehicle,
  };
}
