'use client';

import { BankOutlined, HomeOutlined, KeyOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, App, Button, Col, Form, Radio, Row, Skeleton } from 'antd';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_SOURCE_TYPE,
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
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { uploadToR2 } from '@/services/upload';
import { completeSourceContract, fetchSourceContractDownload, presignSourceContract } from '../api';
import { useSaveVehicleSource, useVehicleSource } from '../hooks/use-vehicle-source';
import {
  emptySourceFormValues,
  sourceDetailToFormValues,
  sourceFormValuesToInput,
} from '../source-mappers';
import type { VehicleDetail, VehicleSource } from '../types';
import { EditCard } from './edit/EditCard';
import { useEditForm } from './edit/edit-actions';
import styles from './VehicleSourceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

const SOURCE_ICON: Record<VehicleSourceType, React.ReactNode> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: <HomeOutlined />,
  [VEHICLE_SOURCE_TYPE.FINANCED]: <BankOutlined />,
  [VEHICLE_SOURCE_TYPE.RENTED]: <KeyOutlined />,
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: <TeamOutlined />,
};

/**
 * Gợi ý dưới tên từng hình thức trên thẻ chọn.
 *
 * Dựng lúc CHẠY trong một hook, không phải hằng module scope: hằng module scope tính một lần
 * cho cả tiến trình và sẽ đóng băng ngôn ngữ của request đầu tiên (ADR 0012). Liệt kê cả bốn
 * nhánh tường minh nên thêm một hình thức mới là lỗi biên dịch, không phải ô chữ trống.
 */
function useSourceCardHints(): Record<VehicleSourceType, string> {
  const t = useTranslations('Vehicles.source');

  return {
    [VEHICLE_SOURCE_TYPE.OWNED]: t('cardHint.owned'),
    [VEHICLE_SOURCE_TYPE.FINANCED]: t('cardHint.financed'),
    [VEHICLE_SOURCE_TYPE.RENTED]: t('cardHint.rented'),
    [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: t('cardHint.partnership'),
  };
}

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
  const t = useTranslations('Vehicles.source');
  const tActions = useTranslations('Common.actions');
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.FINANCE_VIEW);
  const canEdit = canView && permissions.has(PERMISSION.VEHICLE_UPDATE);
  const source = useVehicleSource(vehicle.id, canView);

  if (!canView) {
    return (
      <PermissionState
        description={t('noPermission')}
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
        title={t('loadError')}
        description={
          <Button size="small" onClick={() => void source.refetch()}>
            {tActions('retry')}
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
  const t = useTranslations('Vehicles.source');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const cardHint = useSourceCardHints();
  const { message } = App.useApp();
  const save = useSaveVehicleSource(vehicle.id);
  const initialValues = useMemo(
    () =>
      source.detail
        ? sourceDetailToFormValues(source.detail)
        : emptySourceFormValues(source.sourceType),
    [source],
  );
  const resolver = useValidationResolver<VehicleSourceFormValues>(
    vehicleSourceFormSchema,
    'Vehicles.source.validation',
  );
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isDirty, errors },
  } = useForm<VehicleSourceFormValues>({
    resolver,
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

  /** Lời hứa của lượt lưu từ cột phải màn sửa xe — hộp xác nhận đổi hình thức trả lời nó. */
  const pendingResolve = useRef<((ok: boolean) => void) | null>(null);
  const settle = (ok: boolean) => {
    pendingResolve.current?.(ok);
    pendingResolve.current = null;
  };

  async function persist(values: VehicleSourceFormValues): Promise<boolean> {
    try {
      const next = await save.mutateAsync(sourceFormValuesToInput(values));
      reset(
        next.detail
          ? sourceDetailToFormValues(next.detail)
          : emptySourceFormValues(next.sourceType),
      );
      setConfirmTypeChange(null);
      message.success(t('saved'));
      settle(true);
      return true;
    } catch (err) {
      // Giữ nguyên form để sửa/thử lại — giá trị đã nhập không được mất vì một lần lưu hỏng.
      message.error(getErrorMessage(err));
      settle(false);
      return false;
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

  /*
   * Nút Lưu ở cột phải màn sửa xe: validate → (đổi hình thức thì hỏi) → ghi. Ngoài màn sửa form giữ
   * nút riêng của nó.
   */
  const registered = useEditForm('source', {
    dirty: isDirty,
    submitting: save.isPending,
    reset: () => reset(initialValues),
    submit: () =>
      new Promise<boolean>((resolve) => {
        void handleSubmit(
          (values) => {
            pendingResolve.current = resolve;
            onSubmit(values);
          },
          () => resolve(false),
        )();
      }),
  });

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
          {!canEdit ? <Alert type="info" showIcon title={t('readOnly')} /> : null}

          {errorCount > 0 ? (
            <Alert type="error" showIcon title={t('errors', { count: errorCount })} />
          ) : null}

          {!source.detail ? (
            <Alert
              type="warning"
              showIcon
              title={t('noDetailTitle')}
              description={t('noDetailBody')}
            />
          ) : null}

          {/*
           * Hình thức ĐANG ÁP DỤNG (bản đã lưu) mang nhãn riêng; thẻ sáng vàng chỉ là lựa chọn
           * trong form. Hai thứ lệch nhau thì nói thẳng là chưa lưu, kèm lối giữ nguyên — trước đây
           * dải đầu trang và thẻ đang chọn cùng "sáng" ở hai hình thức khác nhau.
           */}
          <EditCard title={t('typeCard')}>
            <Controller
              control={control}
              name="sourceType"
              render={({ field }) => (
                <Radio.Group
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  className={styles.typeGrid}
                  disabled={!canEdit}
                  aria-label={t('typeCard')}
                >
                  {VEHICLE_SOURCE_TYPE_VALUES.map((value) => (
                    <Radio key={value} value={value} className={styles.typeOption}>
                      <span className={styles.typeBody}>
                        <span className={styles.typeIcon} aria-hidden="true">
                          {SOURCE_ICON[value]}
                        </span>
                        <span className={styles.typeText}>
                          <span className={styles.typeTitle}>
                            {domainLabel('vehicleSourceType', value)}
                            {value === savedType ? (
                              <span className={styles.currentTag}>{t('typeCurrent')}</span>
                            ) : null}
                          </span>
                          <small>{cardHint[value]}</small>
                        </span>
                      </span>
                    </Radio>
                  ))}
                </Radio.Group>
              )}
            />
            {sourceType !== savedType ? (
              <div className={styles.typeChange} role="status">
                <span>
                  {t.rich('typeChange', {
                    from: domainLabel('vehicleSourceType', savedType),
                    to: domainLabel('vehicleSourceType', sourceType),
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
                <Button
                  type="link"
                  size="small"
                  className={styles.typeKeep}
                  onClick={() => setValue('sourceType', savedType, { shouldDirty: true })}
                >
                  {t('typeKeep', { label: domainLabel('vehicleSourceType', savedType) })}
                </Button>
              </div>
            ) : null}
          </EditCard>

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
            <EditCard
              title={
                sourceType === VEHICLE_SOURCE_TYPE.OWNED
                  ? t('contract.titleOptional')
                  : t('contract.title')
              }
              subtitle={
                sourceType === VEHICLE_SOURCE_TYPE.FINANCED
                  ? t('contract.fileFinanced')
                  : sourceType === VEHICLE_SOURCE_TYPE.RENTED
                    ? t('contract.fileRented')
                    : sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP
                      ? t('contract.filePartnership')
                      : t('contract.fileOwned')
              }
            >
              <FileListField
                control={control}
                name="contractFiles"
                upload={uploadContract}
                getDownloadUrl={contractDownloadUrl}
                disabled={!canEdit}
              />
              <TextAreaField
                control={control}
                name="notes"
                label={t('contract.notes')}
                hideLabel
                placeholder={t('contract.notesPlaceholder')}
                rows={3}
                maxLength={4000}
              />
            </EditCard>
          ) : null}
        </div>

        {canEdit && !registered ? (
          <StickyFormActions
            submitLabel={tActions('saveChanges')}
            cancelLabel={isDirty ? t('revert') : tActions('cancel')}
            onCancel={() => reset(initialValues)}
            submitting={save.isPending}
            disabled={!isDirty}
          />
        ) : null}

        <ResponsiveDialog
          open={confirmTypeChange !== null}
          title={t('confirmType.title')}
          size="sm"
          confirmLoading={save.isPending}
          onClose={() => {
            setConfirmTypeChange(null);
            settle(false);
          }}
          onOk={() => confirmTypeChange && void persist(confirmTypeChange)}
          okText={t('confirmType.ok')}
          cancelText={tActions('cancel')}
          destructive
        >
          <p>
            {t.rich('confirmType.body', {
              from: domainLabel('vehicleSourceType', savedType),
              to: confirmTypeChange
                ? domainLabel('vehicleSourceType', confirmTypeChange.sourceType)
                : '',
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p>{t('confirmType.note')}</p>
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
  const t = useTranslations('Vehicles.source.owned');

  return (
    <EditCard title={t('title')}>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <DateTimeField control={control} name="purchaseDate" label={t('purchaseDate')} dateOnly />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="purchasePrice"
            label={t('purchasePrice')}
            money
            min={0}
            placeholder={t('purchasePricePlaceholder')}
          />
        </Col>
        <Col xs={24}>
          <TextField
            control={control}
            name="purchasePlace"
            label={t('purchasePlace')}
            placeholder={t('purchasePlacePlaceholder')}
            disabled={disabled}
          />
        </Col>
      </Row>
    </EditCard>
  );
}

function FinancedSection({
  control,
  disabled,
  monthlyTotal,
}: SectionProps & { monthlyTotal: number | null }) {
  const t = useTranslations('Vehicles.source.financed');
  const fmt = useAppFormat();

  return (
    <EditCard title={t('title')}>
      {/* Nhãn dài xuống dòng ở cột hẹp — canh đáy để các ô nhập trên một hàng vẫn thẳng nhau. */}
      <Row gutter={16} align="bottom">
        <Col xs={24} sm={12}>
          <TextField
            control={control}
            name="bankName"
            label={t('bankName')}
            placeholder={t('bankPlaceholder')}
            required
            disabled={disabled}
          />
        </Col>
        <Col xs={24} sm={12}>
          <TextField
            control={control}
            name="contractNumber"
            label={t('contractNumber')}
            placeholder={t('contractNumberPlaceholder')}
            disabled={disabled}
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="originalPrincipal"
            label={t('originalPrincipal')}
            money
            min={0}
            placeholder={t('originalPrincipalPlaceholder')}
          />
        </Col>
        <Col xs={24} sm={12}>
          <DateTimeField control={control} name="startDate" label={t('startDate')} dateOnly />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="termMonths"
            label={t('termMonths')}
            min={1}
            max={600}
            placeholder={t('termMonthsPlaceholder')}
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="interestRatePercent"
            label={t('interestRate')}
            percent
            precision={2}
            placeholder={t('interestRatePlaceholder')}
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="paymentDay"
            label={t('paymentDay')}
            min={1}
            max={31}
            placeholder={t('paymentDayPlaceholder')}
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="monthlyPrincipal"
            label={t('monthlyPrincipal')}
            money
            min={0}
            placeholder={t('monthlyPrincipalPlaceholder')}
          />
        </Col>
        <Col xs={24} sm={8}>
          <NumberField
            control={control}
            name="monthlyInterest"
            label={t('monthlyInterest')}
            money
            min={0}
            placeholder={t('monthlyInterestPlaceholder')}
          />
        </Col>
        <Col xs={24} sm={8}>
          <DateTimeField control={control} name="endDate" label={t('endDate')} dateOnly />
        </Col>
        <Col xs={24}>
          <InterestMethodField control={control} disabled={disabled} />
        </Col>
      </Row>
      {monthlyTotal != null ? (
        <p className={styles.totalLine}>
          {t.rich('monthlyTotalRich', {
            amount: fmt.money(String(monthlyTotal)),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      ) : null}
    </EditCard>
  );
}

function InterestMethodField({ control, disabled }: SectionProps) {
  const t = useTranslations('Vehicles.source.financed');
  const domainLabel = useDomainLabel();

  return (
    <Controller
      control={control}
      name="interestMethod"
      render={({ field }) => (
        <div className={styles.methodRow}>
          <span className={styles.methodLabel} id="vehicle-source-interest-method">
            {t('interestMethod')}
          </span>
          <Radio.Group
            aria-labelledby="vehicle-source-interest-method"
            value={field.value ?? null}
            onChange={(event) => field.onChange(event.target.value)}
            disabled={disabled}
          >
            {VEHICLE_FINANCE_INTEREST_METHOD_VALUES.map((value) => (
              <Radio key={value} value={value}>
                {domainLabel('vehicleFinanceInterestMethod', value)}
              </Radio>
            ))}
          </Radio.Group>
        </div>
      )}
    />
  );
}

function RentedSection({ control, disabled }: SectionProps) {
  const t = useTranslations('Vehicles.source.rented');

  return (
    <>
      <EditCard title={t('ownerTitle')}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerName"
              label={t('ownerName')}
              placeholder={t('ownerNamePlaceholder')}
              required
              disabled={disabled}
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerPhone"
              label={t('ownerPhone')}
              placeholder={t('ownerPhonePlaceholder')}
              disabled={disabled}
            />
          </Col>
          <Col xs={24}>
            <TextField
              control={control}
              name="ownerEmail"
              label={t('ownerEmail')}
              type="email"
              placeholder={t('ownerEmailPlaceholder')}
              disabled={disabled}
            />
          </Col>
        </Row>
      </EditCard>
      <EditCard title={t('contractTitle')}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="monthlyRent"
              label={t('monthlyRent')}
              money
              min={0}
              required
              placeholder={t('monthlyRentPlaceholder')}
              help={t('monthlyRentHelp')}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="paymentDay"
              label={t('paymentDay')}
              min={1}
              max={31}
              placeholder={t('paymentDayPlaceholder')}
            />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField control={control} name="startDate" label={t('startDate')} dateOnly />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField control={control} name="endDate" label={t('endDate')} dateOnly />
          </Col>
        </Row>
      </EditCard>
    </>
  );
}

function PartnershipSection({
  control,
  disabled,
  commissionPercent,
}: SectionProps & { commissionPercent: number | null }) {
  const t = useTranslations('Vehicles.source.partnership');
  const tLabels = useTranslations('Common.labels');

  return (
    <>
      <EditCard title={t('ownerTitle')}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerName"
              label={t('ownerName')}
              placeholder={t('ownerNamePlaceholder')}
              required
              disabled={disabled}
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="ownerPhone"
              label={t('ownerPhone')}
              placeholder={t('ownerPhonePlaceholder')}
              disabled={disabled}
            />
          </Col>
          <Col xs={24}>
            <TextField
              control={control}
              name="ownerEmail"
              label={t('ownerEmail')}
              type="email"
              placeholder={t('ownerEmailPlaceholder')}
              disabled={disabled}
            />
          </Col>
        </Row>
      </EditCard>
      {/*
        Cơ sở chia doanh thu (chốt ở wave 4): CHỈ tiền thuê sau giảm giá. Cọc hoàn lại, phí giao
        nhận, phí quá giờ, phạt/bồi thường đều đứng ngoài — khớp quy tắc giảm giá chỉ áp lên tiền
        thuê cơ bản của rental_policies. Công thức là giải thích nên vào icon ⓘ cạnh tiêu đề.
      */}
      <EditCard
        title={
          <span className={styles.titleWithTip}>
            {t('termsTitle')}
            <PolicyInfoTip label={t('formulaTip')}>{t('formula')}</PolicyInfoTip>
          </span>
        }
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="commissionPercent"
              label={t('commission')}
              percent
              required
              placeholder={t('commissionPlaceholder')}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className={styles.shopShare}>
              {t.rich('shopShare', {
                percent:
                  commissionPercent == null ? tLabels('emptyValue') : `${100 - commissionPercent}%`,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField control={control} name="startDate" label={t('startDate')} dateOnly />
          </Col>
          <Col xs={24} sm={12}>
            <DateTimeField control={control} name="endDate" label={t('endDate')} dateOnly />
          </Col>
        </Row>
      </EditCard>
    </>
  );
}
