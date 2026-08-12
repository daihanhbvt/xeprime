'use client';

import {
  BankOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Col, Form, Radio, Row, Skeleton, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  PERMISSION,
  VEHICLE_FINANCE_INTEREST_METHOD_LABEL,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_SOURCE_TYPE_DESCRIPTION,
  VEHICLE_SOURCE_TYPE_LABEL,
  VEHICLE_SOURCE_TYPE_VALUES,
  type VehicleSourceType,
} from '@xeprime/types';
import { vehicleSourceFormSchema, type VehicleSourceFormValues } from '@xeprime/validators';
import { DateTimeField } from '@/components/form/DateTimeField';
import { FileListField, type UploadedFileItem } from '@/components/form/FileListField';
import { NumberField } from '@/components/form/NumberField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { formatMoneyVnd } from '@/lib/money';
import { uploadToR2 } from '@/services/upload';
import {
  completeSourceContract,
  fetchSourceContractDownload,
  presignSourceContract,
} from '../api';
import { useSaveVehicleSource, useVehicleSource } from '../hooks/use-vehicle-source';
import {
  emptySourceFormValues,
  sourceDetailToFormValues,
  sourceFormValuesToInput,
} from '../source-mappers';
import type { VehicleDetail, VehicleSource } from '../types';
import styles from './VehicleSourceWorkspace.module.css';

const SOURCE_ICON: Record<VehicleSourceType, React.ReactNode> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: <HomeOutlined />,
  [VEHICLE_SOURCE_TYPE.FINANCED]: <BankOutlined />,
  [VEHICLE_SOURCE_TYPE.RENTED]: <KeyOutlined />,
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: <TeamOutlined />,
};

const SOURCE_CARD_HINT: Record<VehicleSourceType, string> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'Xe thuộc sở hữu trực tiếp của bạn',
  [VEHICLE_SOURCE_TYPE.FINANCED]: 'Đang mua xe trả góp qua ngân hàng',
  [VEHICLE_SOURCE_TYPE.RENTED]: 'Thuê xe từ bên thứ ba để kinh doanh',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: 'Hợp tác khai thác xe ăn chia doanh thu',
};

/** Nhãn dải trạng thái đầu tab (thiết kế: "Đang vay nợ" / "Xe của bạn"…). */
const SOURCE_STATUS_TAG: Record<VehicleSourceType, string> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'Xe của bạn',
  [VEHICLE_SOURCE_TYPE.FINANCED]: 'Đang vay nợ',
  [VEHICLE_SOURCE_TYPE.RENTED]: 'Đang thuê xe',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: 'Hợp tác kinh doanh',
};

interface VehicleSourceWorkspaceProps {
  vehicle: VehicleDetail;
  /** Báo dirty lên workspace để guard đổi tab/rời trang gộp cả tab này. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Tab "Nguồn xe & tài chính" (Wave 4).
 *
 * Quyền — khớp guard backend, FE chỉ phản chiếu:
 *  - thiếu `finance.view` → màn không có quyền, KHÔNG gọi API (gọi để nhận 403 là trải nghiệm tệ);
 *  - có `finance.view`, thiếu `vehicles.update` → chỉ xem (form khoá, không nút lưu);
 *  - đủ cả hai → chỉnh sửa đầy đủ.
 */
export function VehicleSourceWorkspace({ vehicle, onDirtyChange }: VehicleSourceWorkspaceProps) {
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.FINANCE_VIEW);
  const canEdit = canView && permissions.has(PERMISSION.VEHICLE_UPDATE);
  const source = useVehicleSource(vehicle.id, canView);

  if (!canView) {
    return (
      <PermissionState
        title="Không có quyền truy cập"
        description="Bạn không có quyền xem thông tin tài chính của xe này. Vui lòng liên hệ chủ gian hàng hoặc quản trị viên hệ thống để được cấp quyền."
        missingPermissions={[PERMISSION.FINANCE_VIEW]}
      />
    );
  }

  if (source.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (source.isError || !source.data) {
    return (
      <Alert
        type="error"
        showIcon
        message="Không tải được hồ sơ nguồn xe"
        description={
          <Button size="small" onClick={() => void source.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  return (
    <VehicleSourceForm
      vehicle={vehicle}
      source={source.data}
      canEdit={canEdit}
      onDirtyChange={onDirtyChange}
    />
  );
}

function VehicleSourceForm({
  vehicle,
  source,
  canEdit,
  onDirtyChange,
}: {
  vehicle: VehicleDetail;
  source: VehicleSource;
  canEdit: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { message } = App.useApp();
  const save = useSaveVehicleSource(vehicle.id);
  const initialValues = useMemo(
    () =>
      source.detail
        ? sourceDetailToFormValues(source.detail)
        : emptySourceFormValues(source.sourceType),
    [source],
  );
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = useForm<VehicleSourceFormValues>({
    resolver: yupResolver(vehicleSourceFormSchema),
    defaultValues: initialValues,
  });
  const [confirmTypeChange, setConfirmTypeChange] = useState<VehicleSourceFormValues | null>(null);

  const sourceType = useWatch({ control, name: 'sourceType' }) as VehicleSourceType;
  const monthlyPrincipal = useWatch({ control, name: 'monthlyPrincipal' });
  const monthlyInterest = useWatch({ control, name: 'monthlyInterest' });
  const commissionPercent = useWatch({ control, name: 'commissionPercent' });

  // Tổng phải đóng mỗi tháng = gốc + lãi — preview cùng công thức backend, không lưu.
  const monthlyTotal =
    monthlyPrincipal != null || monthlyInterest != null
      ? (monthlyPrincipal ?? 0) + (monthlyInterest ?? 0)
      : null;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  // Rời tab/unmount thì không còn gì chưa lưu thuộc về tab này.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const savedType = (source.detail?.sourceType ?? source.sourceType) as VehicleSourceType;
  const errorCount = Object.keys(errors).length;

  /**
   * Flow tài liệu riêng tư (Wave 4.1): presign theo XE → PUT lên bucket riêng tư → gọi
   * complete để server xác minh (HEAD + chữ ký byte đầu) → nhận metadata `ready`.
   * Tải về: xin signed URL mới cho từng cú bấm — không có URL nào nằm trong form/DB.
   */
  async function uploadContract(
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<UploadedFileItem> {
    const ticket = await presignSourceContract(vehicle.id, file);
    await uploadToR2(ticket.uploadUrl, file, onProgress);
    const completed = await completeSourceContract(vehicle.id, ticket.fileId);
    return {
      id: completed.id ?? ticket.fileId,
      name: completed.name,
      size: completed.size,
      status: 'ready',
    };
  }

  async function contractDownloadUrl(item: UploadedFileItem): Promise<string> {
    const ticket = await fetchSourceContractDownload(vehicle.id, item.id!);
    return ticket.downloadUrl;
  }

  async function persist(values: VehicleSourceFormValues) {
    try {
      const next = await save.mutateAsync(sourceFormValuesToInput(values));
      reset(
        next.detail
          ? sourceDetailToFormValues(next.detail)
          : emptySourceFormValues(next.sourceType),
      );
      setConfirmTypeChange(null);
      message.success('Đã lưu hồ sơ nguồn xe');
    } catch (err) {
      // Giữ nguyên form để sửa/thử lại — giá trị đã nhập không được mất vì một lần lưu hỏng.
      message.error(getErrorMessage(err));
    }
  }

  function onSubmit(values: VehicleSourceFormValues) {
    // Đổi hình thức là thao tác nhạy cảm: hồ sơ biến thể cũ bị thay thế — phải xác nhận.
    if (source.detail && values.sourceType !== savedType) {
      setConfirmTypeChange(values);
      return;
    }
    void persist(values);
  }

  return (
    /*
     * `<Form component={false}>` chỉ cấp ngữ cảnh bố cục cho `Form.Item` (nhãn NẰM TRÊN ô nhập)
     * — form thật là thẻ bên trong với RHF (ADR 0004). `disabled` đi qua DisabledContext của
     * AntD: chế độ chỉ-đọc khoá TẤT CẢ control một chỗ, không rải prop từng field.
     */
    <Form component={false} layout="vertical" colon={false} disabled={!canEdit}>
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSubmit)();
      }}
    >
      <div className={styles.stack}>
        {/* Dải trạng thái đầu tab — nói ngay xe đang ở hình thức nào. */}
        <div className={styles.statusBanner}>
          <span className={styles.statusIcon} aria-hidden="true">
            {SOURCE_ICON[savedType]}
          </span>
          <div className={styles.statusCopy}>
            <strong>
              Hình thức sở hữu xe: {VEHICLE_SOURCE_TYPE_LABEL[savedType]}{' '}
              <Tag className={styles.statusTag} color="gold">
                {SOURCE_STATUS_TAG[savedType]}
              </Tag>
            </strong>
            <small>{VEHICLE_SOURCE_TYPE_DESCRIPTION[savedType]}</small>
          </div>
          <InfoCircleOutlined className={styles.statusInfo} aria-hidden="true" />
        </div>

        {!canEdit ? (
          <Alert
            type="info"
            showIcon
            message="Bạn đang xem ở chế độ chỉ đọc. Liên hệ quản lý để chỉnh sửa."
          />
        ) : null}

        {errorCount > 0 ? (
          <Alert type="error" showIcon message={`${errorCount} lỗi cần sửa trước khi lưu`} />
        ) : null}

        {!source.detail ? (
          <Alert
            type="warning"
            showIcon
            message="Xe chưa có hồ sơ nguồn chi tiết"
            description="Bổ sung thông tin bên dưới để đồng bộ với phân hệ kế toán và tính toán chi phí vận hành."
          />
        ) : null}

        <Card title="Hình thức nguồn xe" className={styles.card}>
          <Controller
            control={control}
            name="sourceType"
            render={({ field }) => (
              <Radio.Group
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                className={styles.typeGrid}
                disabled={!canEdit}
              >
                {VEHICLE_SOURCE_TYPE_VALUES.map((value) => (
                  <Radio key={value} value={value} className={styles.typeOption}>
                    <span className={styles.typeHead}>
                      <span aria-hidden="true">{SOURCE_ICON[value]}</span>
                      <strong>{VEHICLE_SOURCE_TYPE_LABEL[value]}</strong>
                    </span>
                    <small>{SOURCE_CARD_HINT[value]}</small>
                  </Radio>
                ))}
              </Radio.Group>
            )}
          />
        </Card>

        {sourceType === VEHICLE_SOURCE_TYPE.OWNED ? (
          <OwnedSection control={control} disabled={!canEdit} />
        ) : null}
        {sourceType === VEHICLE_SOURCE_TYPE.FINANCED ? (
          <FinancedSection control={control} disabled={!canEdit} monthlyTotal={monthlyTotal} />
        ) : null}
        {sourceType === VEHICLE_SOURCE_TYPE.RENTED ? (
          <RentedSection control={control} disabled={!canEdit} />
        ) : null}
        {sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP ? (
          <PartnershipSection
            control={control}
            disabled={!canEdit}
            commissionPercent={commissionPercent ?? null}
          />
        ) : null}

        {sourceType !== VEHICLE_SOURCE_TYPE.OWNED || canEdit ? (
          <Card
            title={
              sourceType === VEHICLE_SOURCE_TYPE.OWNED
                ? 'Hồ sơ đính kèm (tùy chọn)'
                : 'Hồ sơ hợp đồng'
            }
            className={styles.card}
          >
            <FileListField
              control={control}
              name="contractFiles"
              label={
                sourceType === VEHICLE_SOURCE_TYPE.FINANCED
                  ? 'Hợp đồng vay (đã tải lên)'
                  : sourceType === VEHICLE_SOURCE_TYPE.RENTED
                    ? 'Hợp đồng thuê xe (bản scan)'
                    : sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP
                      ? 'Hợp đồng hợp tác kinh doanh (mẫu đã ký)'
                      : 'Giấy tờ mua bán / hoá đơn (nếu có)'
              }
              upload={uploadContract}
              getDownloadUrl={contractDownloadUrl}
              disabled={!canEdit}
            />
            <TextAreaField
              control={control}
              name="notes"
              label="Ghi chú thêm"
              placeholder="Nhập ghi chú hoặc thông tin bổ sung về nguồn gốc xe…"
              rows={3}
              maxLength={4000}
            />
          </Card>
        ) : null}
      </div>

      {canEdit ? (
        <StickyFormActions
          submitLabel="Lưu thay đổi"
          cancelLabel={isDirty ? 'Hoàn tác' : 'Huỷ bỏ'}
          onCancel={() => reset(initialValues)}
          submitting={save.isPending}
          disabled={!isDirty}
        />
      ) : null}

      <ResponsiveDialog
        open={confirmTypeChange !== null}
        title="Đổi hình thức sở hữu xe?"
        size="sm"
        confirmLoading={save.isPending}
        onClose={() => setConfirmTypeChange(null)}
        onOk={() => confirmTypeChange && void persist(confirmTypeChange)}
        okText="Xác nhận & Lưu"
        cancelText="Huỷ"
        destructive
      >
        <p>
          Đổi từ <strong>{VEHICLE_SOURCE_TYPE_LABEL[savedType]}</strong> sang{' '}
          <strong>
            {confirmTypeChange
              ? VEHICLE_SOURCE_TYPE_LABEL[confirmTypeChange.sourceType as VehicleSourceType]
              : ''}
          </strong>{' '}
          sẽ thay thế toàn bộ hồ sơ tài chính hiện tại của xe.
        </p>
        <p>
          Lưu ý: việc này có thể làm thay đổi các bảng tính dòng tiền và khấu hao hiện tại. Hồ sơ
          cũ không thể khôi phục sau khi lưu.
        </p>
      </ResponsiveDialog>
    </form>
    </Form>
  );
}

type SectionProps = {
  control: ReturnType<typeof useForm<VehicleSourceFormValues>>['control'];
  disabled: boolean;
};

function OwnedSection({ control, disabled }: SectionProps) {
  return (
    <Card title="Thông tin mua xe (tùy chọn)" className={styles.card}>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <DateTimeField control={control} name="purchaseDate" label="Ngày mua xe" dateOnly />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="purchasePrice"
            label="Giá trị xe (VND)"
            money
            min={0}
            placeholder="VD: 560.000.000"
          />
        </Col>
        <Col xs={24}>
          <TextField
            control={control}
            name="purchasePlace"
            label="Nơi mua / Đại lý bàn giao"
            placeholder="VD: Toyota Đông Sài Gòn"
            disabled={disabled}
          />
        </Col>
      </Row>
    </Card>
  );
}

function FinancedSection({
  control,
  disabled,
  monthlyTotal,
}: SectionProps & { monthlyTotal: number | null }) {
  return (
    <Card title="Thông tin khoản vay mua xe" className={styles.card}>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <TextField
            control={control}
            name="bankName"
            label="Ngân hàng / Tổ chức tín dụng"
            placeholder="VD: VPBank"
            required
            disabled={disabled}
          />
        </Col>
        <Col xs={24} sm={12}>
          <TextField
            control={control}
            name="contractNumber"
            label="Số hợp đồng tín dụng"
            placeholder="VD: VPBL-2024-00123"
            disabled={disabled}
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="originalPrincipal"
            label="Dư nợ gốc ban đầu"
            money
            min={0}
            placeholder="VD: 450.000.000"
          />
        </Col>
        <Col xs={24} sm={12}>
          <DateTimeField control={control} name="startDate" label="Ngày giải ngân" dateOnly />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="termMonths"
            label="Thời hạn vay (Tháng)"
            min={1}
            max={600}
            placeholder="VD: 60"
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="interestRatePercent"
            label="Lãi suất cố định năm"
            percent
            precision={2}
            placeholder="VD: 8.5"
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="paymentDay"
            label="Ngày đến hạn đóng tiền hàng tháng"
            min={1}
            max={31}
            placeholder="VD: 15"
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="monthlyPrincipal"
            label="Nợ gốc cần trả mỗi tháng"
            money
            min={0}
            placeholder="VD: 7.500.000"
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="monthlyInterest"
            label="Lãi phát sinh mỗi tháng"
            money
            min={0}
            placeholder="VD: 3.187.500"
          />
        </Col>
        <Col xs={24} sm={12}>
          <DateTimeField
            control={control}
            name="endDate"
            label="Ngày kết thúc hợp đồng (nếu biết)"
            dateOnly
          />
        </Col>
        <Col xs={24} sm={12}>
          <InterestMethodField control={control} disabled={disabled} />
        </Col>
      </Row>
      {monthlyTotal != null ? (
        <Alert
          type="info"
          showIcon
          className={styles.totalPreview}
          message={`Tổng phải đóng mỗi tháng (gốc + lãi): ${formatMoneyVnd(String(monthlyTotal))}`}
        />
      ) : null}
    </Card>
  );
}

function InterestMethodField({ control, disabled }: SectionProps) {
  return (
    <Controller
      control={control}
      name="interestMethod"
      render={({ field }) => (
        <div className={styles.methodBlock}>
          <div className={styles.methodLabel} id="vehicle-source-interest-method">
            Phương pháp tính lãi
          </div>
          <Radio.Group
            aria-labelledby="vehicle-source-interest-method"
            value={field.value ?? null}
            onChange={(event) => field.onChange(event.target.value)}
            disabled={disabled}
          >
            {VEHICLE_FINANCE_INTEREST_METHOD_VALUES.map((value) => (
              <Radio key={value} value={value}>
                {VEHICLE_FINANCE_INTEREST_METHOD_LABEL[value]}
              </Radio>
            ))}
          </Radio.Group>
        </div>
      )}
    />
  );
}

function RentedSection({ control, disabled }: SectionProps) {
  return (
    <>
      <Card title="Thông tin chủ xe (Bên cho thuê)" className={styles.card}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerName"
              label="Tên chủ xe / Doanh nghiệp"
              placeholder="VD: Nguyễn Văn A"
              required
              disabled={disabled}
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerPhone"
              label="Số điện thoại liên hệ"
              placeholder="VD: 0909 123 456"
              disabled={disabled}
            />
          </Col>
          <Col xs={24}>
            <TextField
              control={control}
              name="ownerEmail"
              label="Email chủ xe (Tùy chọn)"
              type="email"
              placeholder="VD: nguyenvana@gmail.com"
              disabled={disabled}
            />
          </Col>
        </Row>
      </Card>
      <Card title="Thông tin hợp đồng thuê" className={styles.card}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="monthlyRent"
              label="Tiền thuê định kỳ (VND)"
              money
              min={0}
              required
              placeholder="VD: 12.000.000"
              help="Chu kỳ thanh toán theo tháng"
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="paymentDay"
              label="Ngày thanh toán hàng chu kỳ"
              min={1}
              max={31}
              placeholder="VD: 5"
            />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField
              control={control}
              name="startDate"
              label="Ngày bắt đầu hợp đồng"
              dateOnly
            />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField
              control={control}
              name="endDate"
              label="Ngày kết thúc hợp đồng"
              dateOnly
            />
          </Col>
        </Row>
      </Card>
    </>
  );
}

function PartnershipSection({
  control,
  disabled,
  commissionPercent,
}: SectionProps & { commissionPercent: number | null }) {
  return (
    <>
      <Card title="Thông tin đối tác (Chủ xe ký gửi)" className={styles.card}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerName"
              label="Họ tên đối tác sở hữu"
              placeholder="VD: Trần Thị B"
              required
              disabled={disabled}
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerPhone"
              label="Số điện thoại"
              placeholder="VD: 0912 999 888"
              disabled={disabled}
            />
          </Col>
          <Col xs={24}>
            <TextField
              control={control}
              name="ownerEmail"
              label="Địa chỉ email nhận đối soát"
              type="email"
              placeholder="VD: tranthib@gmail.com"
              disabled={disabled}
            />
          </Col>
        </Row>
      </Card>
      <Card title="Điều khoản hợp tác & Phân chia doanh thu" className={styles.card}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="commissionPercent"
              label="Tỷ lệ chia sẻ doanh thu cho chủ xe"
              percent
              required
              placeholder="VD: 30"
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className={styles.shopShare}>
              Phần giữ lại của gian hàng:{' '}
              <strong>{commissionPercent == null ? '—' : `${100 - commissionPercent}%`}</strong>
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField
              control={control}
              name="startDate"
              label="Ngày hợp đồng bắt đầu có hiệu lực"
              dateOnly
            />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField
              control={control}
              name="endDate"
              label="Ngày kết thúc hợp đồng"
              dateOnly
            />
          </Col>
        </Row>
        {/*
          Cơ sở chia doanh thu (chốt ở wave 4): CHỈ tiền thuê sau giảm giá. Cọc hoàn lại,
          phí giao nhận, phí quá giờ, phạt/bồi thường đều đứng ngoài — khớp quy tắc giảm giá
          chỉ áp lên tiền thuê cơ bản của rental_policies.
        */}
        <Alert
          type="info"
          showIcon
          className={styles.totalPreview}
          message="Công thức tính: Doanh thu được chia = tiền thuê sau giảm giá. Không bao gồm: tiền cọc hoàn lại, phí giao nhận, phí quá giờ, phạt/phí bồi thường hư hỏng và các khoản thu hộ khác."
        />
      </Card>
    </>
  );
}
