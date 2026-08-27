'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Collapse, Form, Skeleton, Tabs } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
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
import { useSensitiveChangeLabels } from '../hooks/use-publication-labels';
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
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { branchLabel } from '@/features/branches/branch-label';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './VehicleEditWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

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
  // Chi nhánh giữ xe = vị trí công khai của xe, ô nằm ngay ở tab này nên phải được validate và
  // đếm lỗi cùng các trường khác — không thì lưu với chi nhánh rỗng mà không có báo lỗi nào.
  'branchId',
  'vehicleType',
  'serviceTypes',
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
  const t = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const sensitiveLabels = useSensitiveChangeLabels();
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

  /**
   * Options chi nhánh cho tab Thông tin. Danh sách chỉ có chi nhánh ĐANG HOẠT ĐỘNG (không cho
   * chuyển xe vào chi nhánh đã ngừng), nhưng phải BỔ SUNG chi nhánh hiện tại của xe nếu nó vừa
   * bị ngừng — thiếu bước này thì mở form sửa sẽ thấy ô chi nhánh trống và người dùng tưởng xe
   * mất vị trí.
   */
  const permissions = usePermissions();
  const canUpdate = permissions.has(PERMISSION.VEHICLE_UPDATE);
  const branches = useActiveBranches();
  // Nhãn "chưa có tỉnh/thành" thuộc về màn Chi nhánh — một khoá, một bản dịch.
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(() => {
    const options = (branches.data?.items ?? []).map((b) => ({
      value: b.id,
      label: branchLabel(b, noProvince),
    }));
    const current = vehicle.branch;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({
        value: current.id,
        label: t('branchInactive', { label: branchLabel(current, noProvince) }),
      });
    }
    return options;
  }, [branches.data, t, noProvince, vehicle.branch]);

  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  /**
   * Danh sách thay đổi nhạy cảm — gọi ở HAI chỗ (chặn lưu và liệt kê trong hộp xác nhận), nên
   * gói lại một lần thay vì truyền năm tham số ở cả hai nơi.
   */
  const changesOf = (values: VehicleFormValues) =>
    sensitiveChanges(initialValues, values, fmt, domainLabel, sensitiveLabels);
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
    if (isPublic && changesOf(values).length > 0) {
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
    { key: 'information', label: t('tabs.information') },
    { key: 'media', label: t('tabs.media') },
    {
      key: 'pricing',
      label: t('tabs.pricing'),
      children: <VehiclePricingTab vehicle={vehicle} />,
    },
    {
      key: 'source',
      label: t('tabs.source'),
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
      label: t('tabs.documents'),
      children: <VehicleDocumentsWorkspace vehicle={vehicle} />,
    },
    {
      key: 'maintenance',
      label: t('tabs.maintenance'),
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
        {/* Cùng `StatusTag` với danh sách và Hồ sơ 360 — nhãn theo ngôn ngữ, màu theo META. */}
        <div className={styles.statuses}>
          <StatusTag
            value={vehicle.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
            group="vehicleOperationStatus"
          />
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
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
                message={t('errors', { count: activeErrors })}
              />
            ) : null}
            {isPublic ? (
              <Alert
                className={styles.formAlert}
                type="warning"
                showIcon
                message={t('publicWarning')}
              />
            ) : null}

            {activeTab === 'information' ? (
              <div className={styles.sectionStack}>
                <Card title={t('cards.basic')} className={styles.formCard}>
                  <BasicSection
                    control={control}
                    isCar={vehicleType === VEHICLE_TYPE.CAR}
                    codeReadOnly
                    branchOptions={branchOptions}
                    branchLoading={branches.isLoading}
                    branchDisabled={!canUpdate}
                  />
                </Card>
                <Card title={t('cards.status')} className={styles.formCard}>
                  <StatusSection control={control} />
                </Card>
                <Card title={t('cards.specs')} className={styles.formCard}>
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
                          <strong>{t('advanced.title')}</strong>
                          <small>{t('advanced.hint')}</small>
                        </span>
                      ),
                      children: <AdvancedSpecsSection control={control} />,
                    },
                  ]}
                />
              </div>
            ) : (
              <div className={styles.sectionStack}>
                <Card title={t('cards.images')} className={styles.formCard}>
                  <ImagesSection control={control} isCar={vehicleType === VEHICLE_TYPE.CAR} />
                </Card>
                <Card title={t('cards.featuresDescription')} className={styles.formCard}>
                  <FeaturesDescriptionSection
                    control={control}
                    isCar={vehicleType === VEHICLE_TYPE.CAR}
                  />
                </Card>
              </div>
            )}

            <StickyFormActions
              submitLabel={tActions('saveChanges')}
              cancelLabel={isDirty ? t('revert') : tActions('cancel')}
              onCancel={isDirty ? () => reset(initialValues) : onCancel}
              submitting={submitting}
              disabled={!isDirty}
            />
          </form>
        </Form>
      ) : null}

      <ResponsiveDialog
        open={pendingTab !== null}
        title={t('discard.title')}
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
        okText={t('discard.ok')}
        cancelText={t('discard.cancel')}
        destructive
      >
        {t('discard.body')}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={confirmSensitive}
        title={t('sensitive.title')}
        size="sm"
        confirmLoading={submitting}
        onClose={() => setConfirmSensitive(false)}
        onOk={() => void submitCurrent(getValues())}
        okText={t('sensitive.ok')}
        cancelText={tActions('cancel')}
      >
        <p>{t('sensitive.body')}</p>
        <ul className={styles.changeList}>
          {changesOf(getValues()).map((change) => (
            <li key={change.field}>
              <strong>{t('sensitive.change', { label: change.label })}</strong> {change.before} →{' '}
              {change.after}
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
    </div>
  );
}

function VehiclePricingTab({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  const { message } = App.useApp();
  const pricing = useVehiclePricing(vehicle.id);
  const save = useSaveVehiclePricing(vehicle.id);

  if (pricing.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (pricing.isError || !pricing.data) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('loadError')}
        description={
          <Button size="small" onClick={() => void pricing.refetch()}>
            {tActions('retry')}
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
          onSuccess: () => message.success(t('saved')),
          onError: (error) => message.error(getErrorMessage(error)),
        })
      }
    />
  );
}
