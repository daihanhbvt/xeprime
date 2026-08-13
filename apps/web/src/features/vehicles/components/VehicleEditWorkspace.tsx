'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Collapse, Form, Skeleton, Tabs, Tag } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { VEHICLE_EDIT_TAB, VEHICLE_EDIT_TAB_VALUES, vehiclePath } from '@/constants/routes';
import { getErrorMessage } from '@/services/api-client';
import { VehiclePricingWorkspace } from '@/features/rental-policies/components/VehiclePricingWorkspace';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { informationValuesToInput, mediaValuesToInput, vehicleToFormValues } from '../mappers';
import { sensitiveChanges } from '../sensitive-changes';
import type { UpdateVehicleInput, VehicleDetail } from '../types';
import {
  AdvancedSpecsSection,
  BasicSection,
  FeaturesDescriptionSection,
  ImagesSection,
  SpecsSection,
  StatusSection,
  VEHICLE_SECTIONS,
} from './VehicleFormSections';
import { VehicleDocumentsWorkspace } from '@/features/vehicle-documents/components/VehicleDocumentsWorkspace';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace';
import { VehicleSourceWorkspace } from './VehicleSourceWorkspace';
import styles from './VehicleEditWorkspace.module.css';

type EditableTab = 'information' | 'media';
type WorkspaceTab = EditableTab | 'pricing' | 'source' | 'documents' | 'maintenance';

interface VehicleEditWorkspaceProps {
  vehicle: VehicleDetail;
  submitting: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateVehicleInput) => Promise<VehicleDetail>;
  onCancel: () => void;
}

const INFORMATION_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'name',
  'vehicleType',
  'serviceType',
  'operationStatus',
  'plateNumber',
  'brand',
  'model',
  'bodyType',
  'manufactureYear',
  'seatCount',
  'fuelType',
  'color',
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'engineDisplacementCc',
  'horsepowerHp',
  'transmission',
  'fuelConsumptionCity',
  'fuelConsumptionHighway',
  'fuelConsumptionCombined',
];
const MEDIA_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'mainImageUrl',
  'images',
  'features',
  'description',
];

/** Các trường nằm TRONG vùng thu gọn "Thông số kỹ thuật nâng cao" — cần mở vùng khi chúng lỗi. */
const ADVANCED_SPEC_FIELDS = VEHICLE_SECTIONS.find((section) => section.key === 'specs')!.fields;

/**
 * Giá trị `?tab=` hợp lệ đọc từ hằng số CHUNG (Wave 8) — cùng bảng mà Hồ sơ 360 và cảnh báo
 * dùng để sinh link. Trước đây danh sách này gõ tay ở đây, nên thêm tab mới là thêm một chỗ
 * phải nhớ sửa. Giá trị lạ rơi về "Thông tin" như cũ.
 */
function parseTab(value: string | null): WorkspaceTab {
  return (VEHICLE_EDIT_TAB_VALUES as string[]).includes(value ?? '')
    ? (value as WorkspaceTab)
    : VEHICLE_EDIT_TAB.INFORMATION;
}

export function VehicleEditWorkspace({
  vehicle,
  submitting,
  errorMessage,
  onSave,
  onCancel,
}: VehicleEditWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => parseTab(searchParams.get('tab')));
  const [pendingTab, setPendingTab] = useState<WorkspaceTab | null>(null);
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /**
   * Tab Nguồn xe có form RIÊNG (không chung RHF với info/media) — nó tự báo dirty lên đây
   * để guard đổi tab gộp cả nó. Bỏ thay đổi = remount tab nguồn qua `sourceResetKey`.
   */
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceResetKey, setSourceResetKey] = useState(0);
  const {
    control,
    getFieldState,
    getValues,
    handleSubmit,
    reset,
    setValue,
    trigger,
    formState: { isDirty, errors },
  } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: initialValues,
  });
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const operationMeta =
    VEHICLE_OPERATION_STATUS_META[vehicle.operationStatus as VehicleOperationStatus];
  const publicMeta = VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus];
  const activeFields = activeTab === 'media' ? MEDIA_FIELDS : INFORMATION_FIELDS;
  const activeErrors = activeFields.filter((field) => errors[field]).length;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (vehicleType !== VEHICLE_TYPE.CAR) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, setValue, vehicleType]);

  function goToTab(next: WorkspaceTab) {
    if (next !== 'information') setAdvancedOpen(false);
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${vehiclePath.edit(vehicle.id)}?${params.toString()}`, { scroll: false });
  }

  function requestTab(next: string) {
    const target = next as WorkspaceTab;
    if (!isDirty && !sourceDirty) {
      goToTab(target);
      return;
    }
    setPendingTab(target);
  }

  async function saveCurrent() {
    const valid = await trigger([...activeFields]);
    if (!valid) {
      // Lỗi validate không được nằm khuất sau vùng thu gọn đang đóng — mở nó ra cho thấy.
      if (ADVANCED_SPEC_FIELDS.some((field) => getFieldState(field).invalid)) {
        setAdvancedOpen(true);
      }
      return;
    }
    const values = getValues();
    if (isPublic && sensitiveChanges(initialValues, values).length > 0) {
      setConfirmSensitive(true);
      return;
    }
    await submitCurrent(values);
  }

  async function submitCurrent(values: VehicleFormValues) {
    const body =
      activeTab === 'media' ? mediaValuesToInput(values) : informationValuesToInput(values);
    try {
      const updated = await onSave(body);
      reset(vehicleToFormValues(updated));
      setAdvancedOpen(false);
      setConfirmSensitive(false);
    } catch {
      // Mutation owner hiển thị lỗi chuẩn hoá; giữ nguyên form để người dùng sửa/thử lại.
    }
  }

  const tabItems = [
    { key: 'information', label: 'Thông tin xe' },
    { key: 'media', label: 'Hình ảnh & tiện ích' },
    {
      key: 'pricing',
      label: 'Giá & chính sách',
      children: <VehiclePricingTab vehicle={vehicle} />,
    },
    {
      key: 'source',
      label: 'Nguồn xe & tài chính',
      children: (
        <VehicleSourceWorkspace
          key={sourceResetKey}
          vehicle={vehicle}
          onDirtyChange={setSourceDirty}
        />
      ),
    },
    {
      key: 'documents',
      label: 'Giấy tờ',
      children: <VehicleDocumentsWorkspace vehicle={vehicle} />,
    },
    {
      key: 'maintenance',
      label: 'Bảo dưỡng & KM',
      children: <VehicleMaintenanceWorkspace vehicle={vehicle} />,
    },
  ];

  return (
    <div className={styles.workspace}>
      <header className={styles.vehicleHeader}>
        <div>
          <h1>{vehicle.name}</h1>
          <p>{[vehicle.code, vehicle.plateNumber].filter(Boolean).join(' · ')}</p>
        </div>
        <div className={styles.statuses}>
          <Tag color={operationMeta?.color}>{operationMeta?.label ?? vehicle.operationStatus}</Tag>
          <Tag color={publicMeta?.color}>{publicMeta?.label ?? vehicle.publicStatus}</Tag>
        </div>
      </header>

      <Tabs className={styles.tabs} activeKey={activeTab} onChange={requestTab} items={tabItems} />

      {activeTab === 'information' || activeTab === 'media' ? (
        <Form component={false} layout="vertical" colon={false}>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit(() => saveCurrent())();
            }}
          >
            {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
            {activeErrors > 0 ? (
              <Alert
                className={styles.formAlert}
                type="error"
                showIcon
                message={`${activeErrors} lỗi cần sửa trước khi lưu`}
              />
            ) : null}
            {isPublic ? (
              <Alert
                className={styles.formAlert}
                type="warning"
                showIcon
                message="Xe đang công khai. Thay đổi thông tin nhạy cảm sẽ đưa xe về chờ duyệt lại và tạm ẩn khỏi marketplace."
              />
            ) : null}

            {activeTab === 'information' ? (
              <div className={styles.sectionStack}>
                <Card title="Thông tin cơ bản" className={styles.formCard}>
                  <BasicSection
                    control={control}
                    isCar={vehicleType === VEHICLE_TYPE.CAR}
                    codeReadOnly
                  />
                </Card>
                <Card title="Quản lý trạng thái" className={styles.formCard}>
                  <StatusSection control={control} />
                </Card>
                <Card title="Thông số kỹ thuật xe" className={styles.formCard}>
                  <SpecsSection control={control} isCar={vehicleType === VEHICLE_TYPE.CAR} />
                </Card>
                <Collapse
                  accordion
                  className={styles.advancedCollapse}
                  activeKey={advancedOpen ? ['advanced-specs'] : []}
                  onChange={(key) =>
                    setAdvancedOpen(Array.isArray(key) ? key.length > 0 : Boolean(key))
                  }
                  items={[
                    {
                      key: 'advanced-specs',
                      label: (
                        <span>
                          <strong>Thông số kỹ thuật nâng cao</strong>
                          <small>Kích thước, động cơ và mức tiêu hao — không bắt buộc</small>
                        </span>
                      ),
                      children: <AdvancedSpecsSection control={control} />,
                    },
                  ]}
                />
              </div>
            ) : (
              <div className={styles.sectionStack}>
                <Card title="Hình ảnh xe" className={styles.formCard}>
                  <ImagesSection control={control} isCar={vehicleType === VEHICLE_TYPE.CAR} />
                </Card>
                <Card title="Tiện ích & mô tả" className={styles.formCard}>
                  <FeaturesDescriptionSection
                    control={control}
                    isCar={vehicleType === VEHICLE_TYPE.CAR}
                  />
                </Card>
              </div>
            )}

            <StickyFormActions
              submitLabel="Lưu thay đổi"
              cancelLabel={isDirty ? 'Hoàn tác' : 'Huỷ bỏ'}
              onCancel={isDirty ? () => reset(initialValues) : onCancel}
              submitting={submitting}
              disabled={!isDirty}
            />
          </form>
        </Form>
      ) : null}

      <ResponsiveDialog
        open={pendingTab !== null}
        title="Bỏ các thay đổi chưa lưu?"
        size="sm"
        onClose={() => setPendingTab(null)}
        onOk={() => {
          reset(initialValues);
          // Bỏ thay đổi của tab Nguồn xe: remount để form con dựng lại từ dữ liệu đã lưu.
          if (sourceDirty) {
            setSourceDirty(false);
            setSourceResetKey((key) => key + 1);
          }
          const next = pendingTab;
          setPendingTab(null);
          if (next) goToTab(next);
        }}
        okText="Bỏ thay đổi"
        cancelText="Tiếp tục chỉnh sửa"
        destructive
      >
        Dữ liệu bạn vừa thay đổi trong tab này chưa được lưu.
      </ResponsiveDialog>

      <ResponsiveDialog
        open={confirmSensitive}
        title="Xác nhận thay đổi nhạy cảm"
        size="sm"
        confirmLoading={submitting}
        onClose={() => setConfirmSensitive(false)}
        onOk={() => void submitCurrent(getValues())}
        okText="Xác nhận & Lưu"
        cancelText="Huỷ"
      >
        <p>Xe sẽ chuyển về trạng thái chờ duyệt lại và tạm ẩn khỏi marketplace.</p>
        <ul className={styles.changeList}>
          {sensitiveChanges(initialValues, getValues()).map((change) => (
            <li key={change.field}>
              <strong>{change.label}:</strong> {change.before} → {change.after}
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
    </div>
  );
}

function VehiclePricingTab({ vehicle }: { vehicle: VehicleDetail }) {
  const { message } = App.useApp();
  const pricing = useVehiclePricing(vehicle.id);
  const save = useSaveVehiclePricing(vehicle.id);

  if (pricing.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (pricing.isError || !pricing.data) {
    return (
      <Alert
        type="error"
        showIcon
        message="Không tải được giá & chính sách"
        description={
          <Button size="small" onClick={() => void pricing.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  return (
    <VehiclePricingWorkspace
      vehicleName={vehicle.name}
      vehiclePlate={vehicle.plateNumber ?? null}
      pricing={pricing.data}
      canEdit
      submitting={save.isPending}
      onSave={(body) =>
        save.mutate(body, {
          onSuccess: () => message.success('Đã lưu giá & chính sách của xe'),
          onError: (error) => message.error(getErrorMessage(error)),
        })
      }
    />
  );
}
