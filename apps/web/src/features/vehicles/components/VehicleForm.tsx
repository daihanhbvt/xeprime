'use client';

import { Alert, Button, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  SERVICE_TYPE, VEHICLE_OPERATION_STATUS, VEHICLE_SOURCE_TYPE, VEHICLE_TYPE, isVehicleFuelTypeAllowed, } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { discountedPriceVnd } from '../pricing';
import {
  BasicSection,
  CREATE_WIZARD_STEPS,
  MediaSection,
  SpecsSection,
  SourceTypeSection,
} from './VehicleFormSections';
import { VehicleReviewStep } from './VehicleReviewStep';
import { VehicleWizard } from './VehicleWizard';
import { CreateVehiclePricingStep } from './CreateVehiclePricingStep';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { branchLabel } from '@/features/branches/branch-label';
import styles from './VehicleForm.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để select bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  name: '',
  // Chọn sẵn ở runtime bằng chi nhánh MẶC ĐỊNH của gian hàng (xem `useEffect` bên dưới) — hằng số
  // này không thể biết id chi nhánh của một gian hàng cụ thể.
  branchId: '',
  vehicleType: VEHICLE_TYPE.CAR,
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
  monthlyPrice: null,
  withDriverDailyPrice: null,
  withDriverInterCityPrice: null,
  withDriverOneWayPrice: null,
  sourceType: VEHICLE_SOURCE_TYPE.OWNED,
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  plateNumber: '',
  brand: '',
  model: '',
  color: '',
  fuelType: null,
  bodyType: null,
  manufactureYear: null,
  seatCount: null,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  curbWeightKg: null,
  engineDisplacementCc: null,
  horsepowerHp: null,
  transmission: null,
  fuelConsumptionCity: null,
  fuelConsumptionHighway: null,
  fuelConsumptionCombined: null,
  weekdayPrice: null,
  weekendPrice: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  discountPercent: null,
  description: '',
  mainImageUrl: null,
  images: [],
  features: [],
};

export interface VehicleSubmitOptions {
  /** Bấm "Lưu & Gửi duyệt" thay vì "Lưu nháp" — trang quyết định gọi thêm `submit-public`. */
  submitForReview: boolean;
}

interface VehicleFormProps {
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (values: VehicleFormValues, options: VehicleSubmitOptions) => void;
  onCancel: () => void;
}

/**
 * Wizard tạo xe — Figma `236:2953`, `236:3176`, `236:3334` và responsive `241:2043`…`241:2733`.
 * Route chỉnh sửa cố ý dùng `VehicleEditWorkspace` dạng tab, không đi qua wizard này.
 *
 * ⚠️ Wizard là **thuần client**: mọi bước giữ giá trị trong cùng một form React Hook Form và chỉ
 * gọi API **một lần** ở bước cuối. Backend không có endpoint lưu từng phần, nên không chỗ nào ở
 * đây được nói "đã lưu nháp" giữa chừng.
 */
export function VehicleForm({ submitting, errorMessage, onSubmit, onCancel }: VehicleFormProps) {
  const fmt = useAppFormat();

  const {
    control,
    handleSubmit,
    setValue,
    trigger,
    getValues,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const steps = CREATE_WIZARD_STEPS;
  const lastStep = steps.length - 1;
  const [step, setStep] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  /**
   * Chi nhánh: chọn sẵn cái MẶC ĐỊNH để thao tác vẫn một bước như trước, nhưng vẫn là một trường
   * thật trên form — người dùng thấy xe sẽ nằm ở đâu và đổi được ngay tại đây.
   *
   * Chỉ điền khi ô còn trống: người dùng đã chọn tay rồi thì dữ liệu tới muộn không được ghi đè.
   */
  const branches = useActiveBranches();
  const branchId = useWatch({ control, name: 'branchId' });
  const branchOptions = useMemo(
    () => (branches.data?.items ?? []).map((b) => ({ value: b.id, label: branchLabel(b) })),
    [branches.data],
  );
  useEffect(() => {
    if (branchId) return;
    const preferred =
      branches.data?.items.find((b) => b.isDefault) ?? branches.data?.items[0] ?? null;
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: true });
  }, [branchId, branches.data, setValue]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  // Kiểu dáng thân xe chỉ có nghĩa với ô tô. Nguồn năng lượng cũng phụ thuộc loại phương tiện:
  // xe máy chỉ nhận xăng/điện, nên đổi từ ô tô dầu/hybrid phải xoá lựa chọn không còn hợp lệ.
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, isCar, setValue, vehicleType]);

  // Giá hiển thị trên sàn sau khi trừ khuyến mãi. Chỉ để xem — KHÔNG gửi lên API, backend tự
  // tính lại khi dựng `public_listings` (ADR 0008).
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const discounted = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const pricePreview =
    discounted != null ? (
      <Alert
        type="info"
        showIcon
        className={styles.pricePreview}
        message={`Giá hiển thị trên sàn: ${fmt.money(discounted)}`}
      />
    ) : null;

  /** Lỗi của RIÊNG bước đang mở — dùng cho dải tổng hợp đầu thẻ (Figma `193:2687`). */
  const stepErrors = steps[step]!.fields.filter((field) => errors[field]).length;

  const values = getValues();
  function submitNow(options: VehicleSubmitOptions) {
    void handleSubmit(
      (formValues) => onSubmit(formValues, options),
      /*
       * Gửi mà schema không hợp lệ → **nhảy về bước chứa lỗi đầu tiên**.
       *
       * Bắt buộc phải có khi thanh bước cho nhảy tự do (luồng sửa): người dùng có thể bỏ trống
       * một trường ở bước 1 rồi nhảy thẳng tới bước xác nhận, và nếu không đưa họ về đúng chỗ thì màn
       * xác nhận chỉ đứng im không giải thích gì.
       */
      (formErrors) => {
        const target = steps.findIndex((candidate) =>
          candidate.fields.some((field) => formErrors[field]),
        );
        if (target >= 0) setStep(target);
      },
    )();
  }

  /**
   * Bước chưa phải bước cuối thì nút chính **đi tiếp**, không gửi API.
   *
   * Vẫn đi qua `onSubmit` của thẻ `<form>` để phím Enter trong ô nhập cũng đi tiếp — nếu gắn
   * `onClick` lên nút thì Enter sẽ gửi form và tạo xe ngay từ bước 1.
   */
  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Chặn gửi trùng: nút `loading` chỉ nuốt sự kiện chuột, không chặn Enter.
    if (submitting) return;

    if (step < lastStep) {
      // Chỉ validate trường của BƯỚC ĐANG MỞ — validate cả schema sẽ chặn người dùng bằng lỗi
      // của phần họ còn chưa nhìn thấy.
      const valid = await trigger([...steps[step]!.fields]);
      if (valid) setStep(step + 1);
      return;
    }

    submitNow({ submitForReview: true });
  }

  function renderStep() {
    const props = { control, isCar };
    switch (steps[step]!.key) {
      case 'basic':
        // Ba nhóm có tiêu đề riêng theo thiết kế: Thông tin cơ bản → Thông số vận hành →
        // Hình thức nguồn xe. Trạng thái vận hành KHÔNG hỏi lúc tạo (mặc định "Sẵn sàng").
        return (
          <div className={styles.sectionStack}>
            <section className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Thông tin cơ bản</h3>
              <BasicSection
                {...props}
                branchOptions={branchOptions}
                branchLoading={branches.isLoading}
                branchDisabled={branches.isError}
              />
            </section>
            <section className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Thông số vận hành</h3>
              <SpecsSection {...props} />
            </section>
            <SourceTypeSection control={control} />
          </div>
        );
      case 'pricing':
        return (
          <CreateVehiclePricingStep control={control} isCar={isCar} pricePreview={pricePreview} />
        );
      case 'media':
        return <MediaSection {...props} />;
      default:
        return <VehicleReviewStep values={values} onEditStep={setStep} />;
    }
  }

  /**
   * Hàng nút cuối thẻ.
   *
   * Bước cuối của luồng TẠO có hai hành động (Figma `193:2132`): "Lưu nháp" tạo xe ở trạng thái
   * nháp, "Lưu & Gửi duyệt" tạo rồi gửi đi duyệt. Cả hai đều là hành vi backend có thật —
   * `POST /vehicles` rồi `POST /vehicles/:id/submit-public`.
   */
  const footer =
    step < lastStep ? (
      <>
        {/*
          Chữ hiện ra là "Quay lại" đúng Figma `193:2134`, nhưng TÊN KHẢ TRUY CẬP phải khác:
          `ManagePageHeader` đã dựng sẵn một nút "Quay lại" để rời trang, và hai nút trùng tên
          trên một màn khiến người dùng trình đọc màn hình không phân biệt được lùi bước với
          thoát trang.
        */}
        <Button
          onClick={
            step > 0
              ? () => setStep(step - 1)
              : () => (isDirty ? setConfirmCancel(true) : onCancel())
          }
          aria-label={step > 0 ? 'Quay lại bước trước' : undefined}
        >
          {step > 0 ? 'Quay lại' : 'Huỷ bỏ'}
        </Button>
        <Button type="primary" htmlType="submit" loading={submitting}>
          Tiếp tục
        </Button>
      </>
    ) : (
      <>
        <Button onClick={() => setStep(step - 1)} aria-label="Quay lại bước trước">
          Quay lại
        </Button>
        <div className={styles.finalActions}>
          <Button loading={submitting} onClick={() => submitNow({ submitForReview: false })}>
            Lưu nháp
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            Lưu & Gửi duyệt
          </Button>
        </div>
      </>
    );

  return (
    /*
     * `<Form component={false}>` chỉ cấp NGỮ CẢNH bố cục cho `Form.Item`, không dựng thêm thẻ
     * `<form>` — form thật vẫn là thẻ dưới đây với `onSubmit` của React Hook Form (ADR 0004:
     * state form ở RHF, AntD chỉ lo trình bày).
     *
     * Không có ngữ cảnh này, `Form.Item` rơi về layout NGANG mặc định: nhãn nằm bên trái kèm dấu
     * hai chấm và ô nhập co lại theo phần thừa — sai hẳn Figma (nhãn NẰM TRÊN ô nhập).
     */
    <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
      <form onSubmit={handleFormSubmit} noValidate>
        <VehicleWizard
          steps={steps}
          current={step}
          onStepChange={setStep}
          navigation="sequential"
          heading={steps[step]!.heading}
          notice={
            <>
              {errorMessage ? (
                <Alert type="error" showIcon message={errorMessage} className={styles.alert} />
              ) : null}
              {stepErrors > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  className={styles.alert}
                  message={`${stepErrors} lỗi cần sửa trước khi tiếp tục`}
                />
              ) : null}
            </>
          }
          footer={footer}
        >
          {renderStep()}
        </VehicleWizard>
      </form>

      <ResponsiveDialog
        open={confirmCancel}
        title="Huỷ thông tin xe đang nhập?"
        size="sm"
        onClose={() => setConfirmCancel(false)}
        onOk={onCancel}
        okText="Huỷ và thoát"
        cancelText="Tiếp tục nhập"
        destructive
      >
        Các thay đổi chưa lưu trong wizard sẽ bị mất.
      </ResponsiveDialog>
    </Form>
  );
}
