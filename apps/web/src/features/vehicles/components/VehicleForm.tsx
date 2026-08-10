'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Card, Form, Tag } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SERVICE_TYPE, VEHICLE_OPERATION_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { decorativeIcon } from '@/lib/decorative-icon';
import { formatMoneyVnd } from '@/lib/money';
import { bodyTypeLabelOf, fuelTypeLabel, serviceTypeLabel, vehicleTypeLabel } from '../constants';
import { discountedPriceVnd } from '../pricing';
import { CompletenessLegend } from './VehicleCompleteness';
import {
  BasicSection,
  MediaSection,
  PricingSection,
  SpecsSection,
  VEHICLE_SECTIONS,
  sectionSummary,
} from './VehicleFormSections';
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
 * Dấu bắt buộc đặt SAU nhãn (Figma `60:89`+`60:90`: "Mã quản lý xe" rồi mới tới `*`).
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

interface VehicleFormProps {
  initialValues?: VehicleFormValues;
  submitLabel: string;
  submitting: boolean;
  errorMessage?: string | null;
  /**
   * `stepped` — wizard bốn bước cho **tạo mới** (Figma `60:7` → `60:490`).
   * `full` — hiện hết bốn phần một trang cho **sửa** (Figma `62:5` "Chỉnh sửa xe").
   *
   * Hai màn khác hình thái là **đúng thiết kế**, không phải quên làm: người tạo xe mới cần được
   * dẫn từng bước, người sửa xe đã có cần nhảy thẳng tới ô muốn đổi.
   */
  layout?: 'stepped' | 'full';
  onSubmit: (values: VehicleFormValues) => void;
  onCancel: () => void;
}

/**
 * Form tạo/sửa xe — **một composition dùng chung cho cả hai route**.
 *
 * Gộp được vì hợp đồng nghiệp vụ trùng khớp: cùng `vehicleFormSchema`, cùng `formValuesToInput`,
 * và `UpdateVehicleInput` là `Partial<CreateVehicleInput>` nên payload y hệt nhau.
 *
 * ⚠️ Wizard ở đây là **thuần client**: mọi bước giữ giá trị trong cùng một form React Hook Form
 * và chỉ gọi API **một lần** ở bước cuối. Figma vẽ mỗi bước "Đã lưu nháp" (`60:218`) — tức là có
 * lưu nháp giữa chừng — nhưng backend KHÔNG có endpoint lưu từng phần. Ghi "Đã lưu nháp" khi
 * chưa lưu gì là nói dối người dùng, nên hàng thu gọn ghi **"Đã điền"**. Ghi ở 08 §Wave 3A.
 */
export function VehicleForm({
  initialValues,
  submitLabel,
  submitting,
  errorMessage,
  layout = 'full',
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const { control, handleSubmit, setValue, trigger, getValues } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: initialValues ?? EMPTY_DEFAULTS,
  });

  const stepped = layout === 'stepped';
  const lastStep = VEHICLE_SECTIONS.length - 1;
  const [step, setStep] = useState(0);

  // Kiểu dáng thân xe chỉ có nghĩa với ô tô — đổi sang xe máy thì ẩn field và xoá giá trị.
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
  }, [isCar, setValue]);

  // Giá hiển thị trên sàn sau khi trừ khuyến mãi (Figma `60:327`). Chỉ để xem — KHÔNG gửi lên API,
  // backend tự tính lại khi dựng `public_listings` (ADR 0008).
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
        description={`Giảm ${formatMoneyVnd(String(weekdayPrice! - Number(discounted)))} so với giá ngày thường`}
      />
    ) : null;

  const finalSubmit = handleSubmit((values) => onSubmit(values));

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

    if (stepped && step < lastStep) {
      // Chỉ validate các trường của BƯỚC ĐANG MỞ — validate cả schema sẽ chặn người dùng bằng
      // lỗi của phần họ còn chưa nhìn thấy.
      const valid = await trigger([...VEHICLE_SECTIONS[step]!.fields]);
      if (valid) setStep(step + 1);
      return;
    }

    void finalSubmit(event);
  }

  function renderBody(index: number) {
    const props = { control, isCar };
    switch (VEHICLE_SECTIONS[index]!.key) {
      case 'basic':
        return <BasicSection {...props} />;
      case 'specs':
        return <SpecsSection {...props} />;
      case 'pricing':
        return <PricingSection {...props} pricePreview={pricePreview} />;
      default:
        return <MediaSection {...props} />;
    }
  }

  function summaryOf(index: number) {
    const values = getValues();
    return sectionSummary(VEHICLE_SECTIONS[index]!.key, values, {
      vehicleType: vehicleTypeLabel(values.vehicleType),
      serviceType: serviceTypeLabel(values.serviceType),
      bodyType: values.bodyType ? bodyTypeLabelOf(values.bodyType) : '',
      fuelType: values.fuelType ? fuelTypeLabel(values.fuelType) : '',
    });
  }

  return (
    /*
     * `<Form component={false}>` chỉ cấp NGỮ CẢNH bố cục cho `Form.Item`, không dựng thêm thẻ
     * `<form>` — form thật vẫn là thẻ dưới đây với `onSubmit` của React Hook Form (ADR 0004:
     * state form ở RHF, AntD chỉ lo trình bày).
     *
     * Không có ngữ cảnh này, `Form.Item` rơi về layout NGANG mặc định: nhãn nằm bên trái kèm dấu
     * hai chấm và ô nhập co lại theo phần thừa — sai hẳn Figma (`60:87` nhãn NẰM TRÊN ô nhập).
     */
    <Form component={false} layout="vertical" colon={false} requiredMark={requiredMark}>
      <form onSubmit={handleFormSubmit} noValidate className={styles.form}>
        {errorMessage ? (
          <Alert type="error" showIcon message={errorMessage} className={styles.alert} />
        ) : null}

        <CompletenessLegend />

        {VEHICLE_SECTIONS.map((section, index) => {
          const heading = `${index + 1}. ${section.title}`;

          if (!stepped || index === step) {
            return (
              <Card
                key={section.key}
                title={heading}
                className={styles.section}
                extra={stepped ? <Tag color="processing">Đang điền</Tag> : undefined}
              >
                {renderBody(index)}
              </Card>
            );
          }

          // Phần đã đi qua: thu gọn thành một dòng tóm tắt + lối quay lại sửa (Figma `60:213`).
          if (index < step) {
            return (
              <Card key={section.key} className={styles.stepDone}>
                <div className={styles.stepDoneRow}>
                  <span className={styles.stepDoneIcon}>
                    {decorativeIcon(<CheckCircleFilled />)}
                  </span>
                  <div className={styles.stepDoneText}>
                    <p className={styles.stepDoneTitle}>{heading} (Đã điền)</p>
                    <p className={styles.stepDoneSummary}>{summaryOf(index)}</p>
                  </div>
                  <Button type="link" onClick={() => setStep(index)}>
                    Chỉnh sửa
                  </Button>
                </div>
              </Card>
            );
          }

          // Phần chưa tới: chỉ còn tiêu đề, nêu rõ vì sao chưa mở (Figma `60:131`).
          return (
            <Card key={section.key} className={styles.stepFuture}>
              <div className={styles.stepFutureRow}>
                <p className={styles.stepFutureTitle}>{heading}</p>
                <Tag>Chưa tới bước này</Tag>
              </div>
            </Card>
          );
        })}

        <StickyFormActions
          submitLabel={stepped && step < lastStep ? 'Tiếp tục' : submitLabel}
          // KHÔNG đặt là "Quay lại": `ManagePageHeader` đã có một nút tên y hệt, hai nút cùng tên
          // trên một màn khiến người dùng trình đọc màn hình không phân biệt được cái nào lùi bước
          // và cái nào rời trang.
          cancelLabel={stepped && step > 0 ? 'Quay lại bước trước' : 'Huỷ bỏ'}
          onCancel={stepped && step > 0 ? () => setStep(step - 1) : onCancel}
          submitting={submitting}
        />
      </form>
    </Form>
  );
}
