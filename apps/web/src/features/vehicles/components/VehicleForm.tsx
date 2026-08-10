'use client';

import { Alert, Button, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SERVICE_TYPE, VEHICLE_OPERATION_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatMoneyVnd } from '@/lib/money';
import { discountedPriceVnd } from '../pricing';
import { sensitiveChanges } from '../sensitive-changes';
import {
  BasicSection,
  CREATE_WIZARD_STEPS,
  EDIT_WIZARD_STEPS,
  FeaturesDescriptionSection,
  ImagesSection,
  MediaSection,
  PoliciesSection,
  PricesSection,
  PricingSection,
  SpecsSection,
} from './VehicleFormSections';
import { VehicleReviewStep } from './VehicleReviewStep';
import { VehicleWizard } from './VehicleWizard';
import styles from './VehicleForm.module.css';

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để select bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  name: '',
  vehicleType: VEHICLE_TYPE.CAR,
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  plateNumber: '',
  brand: '',
  model: '',
  color: '',
  fuelType: null,
  bodyType: null,
  manufactureYear: null,
  seatCount: null,
  weekdayPrice: null,
  weekendPrice: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  noCollateral: false,
  discountPercent: null,
  description: '',
  mainImageUrl: null,
  images: [],
  features: [],
};

/**
 * Dấu bắt buộc đặt SAU nhãn (Figma `193:1619`: "Tên xe" rồi mới tới `*`).
 * Mặc định của AntD là đặt trước nhãn — ngược với thiết kế.
 */
function requiredMark(label: ReactNode, { required }: { required: boolean }) {
  return (
    <>
      {label}
      {required ? (
        <span className={styles.requiredMark} aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );
}

export interface VehicleSubmitOptions {
  /** Bấm "Lưu & Gửi duyệt" thay vì "Lưu nháp" — trang quyết định gọi thêm `submit-public`. */
  submitForReview: boolean;
}

interface VehicleFormProps {
  mode: 'create' | 'edit';
  initialValues?: VehicleFormValues;
  submitting: boolean;
  errorMessage?: string | null;
  /** Xe đang hiển thị công khai → cảnh báo và hỏi lại khi đụng trường nhạy cảm (ADR 0008). */
  isPublic?: boolean;
  onSubmit: (values: VehicleFormValues, options: VehicleSubmitOptions) => void;
  onCancel: () => void;
}

/**
 * Wizard tạo/sửa xe — Figma `193:1553`…`193:2009` (tạo) và `193:2297` (sửa).
 *
 * Một component cho cả hai route vì hợp đồng nghiệp vụ trùng khớp (cùng `vehicleFormSchema`,
 * `UpdateVehicleInput` là `Partial<CreateVehicleInput>`), nhưng **các bước thì khác nhau**:
 * người tạo đi theo trình tự hồ sơ, người sửa nhảy thẳng tới thứ muốn đổi. Danh sách bước lấy
 * từ `CREATE_WIZARD_STEPS` / `EDIT_WIZARD_STEPS`.
 *
 * ⚠️ Wizard là **thuần client**: mọi bước giữ giá trị trong cùng một form React Hook Form và chỉ
 * gọi API **một lần** ở bước cuối. Backend không có endpoint lưu từng phần, nên không chỗ nào ở
 * đây được nói "đã lưu nháp" giữa chừng.
 */
export function VehicleForm({
  mode,
  initialValues,
  submitting,
  errorMessage,
  isPublic = false,
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const {
    control,
    handleSubmit,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: initialValues ?? EMPTY_DEFAULTS,
  });

  const isCreate = mode === 'create';
  const steps = isCreate ? CREATE_WIZARD_STEPS : EDIT_WIZARD_STEPS;
  const lastStep = steps.length - 1;
  const [step, setStep] = useState(0);
  const [pendingReview, setPendingReview] = useState<VehicleSubmitOptions | null>(null);

  // Kiểu dáng thân xe chỉ có nghĩa với ô tô — đổi sang xe máy thì ẩn field và xoá giá trị.
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
  }, [isCar, setValue]);

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
        message={`Giá hiển thị trên sàn: ${formatMoneyVnd(discounted)}`}
      />
    ) : null;

  /** Lỗi của RIÊNG bước đang mở — dùng cho dải tổng hợp đầu thẻ (Figma `193:2687`). */
  const stepErrors = steps[step]!.fields.filter((field) => errors[field]).length;

  const values = getValues();
  const changes = isCreate ? [] : sensitiveChanges(initialValues, values);
  const needsConfirm = !isCreate && isPublic && changes.length > 0;

  function submitNow(options: VehicleSubmitOptions) {
    setPendingReview(null);
    void handleSubmit(
      (formValues) => onSubmit(formValues, options),
      /*
       * Gửi mà schema không hợp lệ → **nhảy về bước chứa lỗi đầu tiên**.
       *
       * Bắt buộc phải có khi thanh bước cho nhảy tự do (luồng sửa): người dùng có thể bỏ trống
       * một trường ở bước 1 rồi nhảy thẳng tới bước 5, và nếu không đưa họ về đúng chỗ thì màn
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

    const options: VehicleSubmitOptions = { submitForReview: isCreate };
    if (needsConfirm) {
      setPendingReview(options);
      return;
    }
    submitNow(options);
  }

  function renderStep() {
    const props = { control, isCar };
    switch (steps[step]!.key) {
      case 'basic':
        return <BasicSection {...props} />;
      case 'specs':
        return <SpecsSection {...props} />;
      case 'pricing':
        return <PricingSection {...props} pricePreview={pricePreview} />;
      case 'media':
        return <MediaSection {...props} />;
      case 'general':
        return (
          <>
            <BasicSection {...props} />
            <SpecsSection {...props} />
          </>
        );
      case 'images':
        return <ImagesSection {...props} />;
      case 'prices':
        return <PricesSection {...props} pricePreview={pricePreview} />;
      case 'terms':
        return (
          <>
            <PoliciesSection {...props} />
            <FeaturesDescriptionSection {...props} />
          </>
        );
      default:
        return (
          <VehicleReviewStep
            values={values}
            initialValues={isCreate ? undefined : initialValues}
            onEditStep={setStep}
          />
        );
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
          onClick={step > 0 ? () => setStep(step - 1) : onCancel}
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
          {isCreate ? (
            <Button loading={submitting} onClick={() => submitNow({ submitForReview: false })}>
              Lưu nháp
            </Button>
          ) : null}
          <Button type="primary" htmlType="submit" loading={submitting}>
            {isCreate ? 'Lưu & Gửi duyệt' : 'Lưu thay đổi'}
          </Button>
        </div>
      </>
    );

  const notice =
    !isCreate && isPublic ? (
      <Alert
        type="warning"
        showIcon
        className={styles.alert}
        message="Xe này đang được công khai. Thay đổi các trường nhạy cảm (giá, biển số, loại xe, loại dịch vụ, ảnh đại diện) sẽ đưa xe về trạng thái chờ duyệt lại."
      />
    ) : null;

  return (
    /*
     * `<Form component={false}>` chỉ cấp NGỮ CẢNH bố cục cho `Form.Item`, không dựng thêm thẻ
     * `<form>` — form thật vẫn là thẻ dưới đây với `onSubmit` của React Hook Form (ADR 0004:
     * state form ở RHF, AntD chỉ lo trình bày).
     *
     * Không có ngữ cảnh này, `Form.Item` rơi về layout NGANG mặc định: nhãn nằm bên trái kèm dấu
     * hai chấm và ô nhập co lại theo phần thừa — sai hẳn Figma (nhãn NẰM TRÊN ô nhập).
     */
    <Form component={false} layout="vertical" colon={false} requiredMark={requiredMark}>
      <form onSubmit={handleFormSubmit} noValidate>
        <VehicleWizard
          steps={steps}
          current={step}
          onStepChange={setStep}
          // Sửa: mọi giá trị đã có sẵn nên cho nhảy thẳng tới bước cần đổi. Tạo: đi tuần tự.
          navigation={isCreate ? 'sequential' : 'free'}
          heading={steps[step]!.heading}
          description={
            isCreate ? undefined : 'Điền đầy đủ thông tin của xe để chuyển qua bước tiếp theo.'
          }
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
              {notice}
            </>
          }
          footer={footer}
        >
          {renderStep()}
        </VehicleWizard>
      </form>

      {/*
       * Hộp xác nhận thay đổi nhạy cảm — Figma `193:2568`.
       *
       * Danh sách trường lấy từ `VEHICLE_PUBLIC_SENSITIVE_FIELDS` ở `packages/types`, đúng hằng
       * số mà `vehicles.service` dùng để quyết định đẩy xe về chờ duyệt lại. Câu hệ quả nói
       * đúng thứ backend làm, không phải lời hứa của FE.
       */}
      <ResponsiveDialog
        open={pendingReview !== null}
        title="Xác nhận thay đổi nhạy cảm"
        size="sm"
        confirmLoading={submitting}
        onClose={() => setPendingReview(null)}
        onOk={() => pendingReview && submitNow(pendingReview)}
        okText="Xác nhận & Lưu"
        cancelText="Huỷ"
      >
        <p>Bạn đã thay đổi các trường nhạy cảm sau:</p>
        <ul className={styles.sensitiveList}>
          {changes.map((change) => (
            <li key={change.field}>
              {change.label}: <span className={styles.before}>{change.before}</span> →{' '}
              <b>{change.after}</b>
            </li>
          ))}
        </ul>
        <p>Xe sẽ được đưa về trạng thái chờ duyệt lại và tạm ẩn khỏi marketplace.</p>
      </ResponsiveDialog>
    </Form>
  );
}
