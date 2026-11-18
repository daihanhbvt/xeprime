import { memo, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, VEHICLE_DOCUMENT_TYPE, missingVehicleImageTypes } from '@xeprime/types';
import { useVehicleDocuments } from '@/features/vehicle-documents/hooks/use-documents';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import { vehicleEditNavGroups } from '../edit-nav';
import { useVehicle } from '../hooks/use-vehicle';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { publishCompleteness } from '../publication';

/** Figma "Chỉnh sửa xe" MB (`24228:103820`): thanh tiến độ rộng 80, cao 6, xanh dương trên nền `shape/gray-100`. */
const PROGRESS_WIDTH = 80;
const PROGRESS_HEIGHT = 6;

/** Ba giấy tờ CỐT LÕI của số "2/3" — web `STANDARD_VEHICLE_DOCUMENT_TYPES`. */
const CORE_DOCUMENT_TYPES = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
] as const;

/**
 * Mục NÀO của dải tab sáng lên với một route sửa xe — các route con của "Dịch vụ & giá" /
 * "Chính sách thuê" (nhận chuyến, giao xe, thời gian giao nhận…) cùng thuộc một tab của web.
 */
export function editNavTabOf(tab: VehicleEditTab): VehicleEditTab {
  switch (tab) {
    case VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION:
    case VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION:
    case VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES:
      return VEHICLE_EDIT_TAB.PRICING;
    case VEHICLE_EDIT_TAB.OPERATIONS:
    case VEHICLE_EDIT_TAB.HANDOVER_TIME:
    case VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS:
    case VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS:
      return VEHICLE_EDIT_TAB.POLICY;
    default:
      return tab;
  }
}

/**
 * Thanh đầu của MÀN SỬA XE ở cổng quản lý (Figma "Chỉnh sửa xe" MB `24228:103820`): ← + "Chỉnh sửa xe"
 * + thanh % hoàn thiện, dải tab gạch chân ngay dưới. Thay màn menu hub cũ — mỗi tab là một route
 * (`ROUTES.manage.vehicleEditTab`), nên thanh này đứng đầu MỖI màn con và đổi tab bằng `replace`.
 *
 * Tab chia theo NHÓM của web (`vehicleEditNavGroups`, ledger §3.6 E1): Thông tin chung · Hình ảnh ·
 * Giấy tờ · Dịch vụ & giá · Chính sách thuê · Bảo dưỡng & KM · Nguồn gốc & tài chính — mục nào người
 * này không có năng lực thì ẩn, như menu trái của web.
 *
 * `guard` là `useLeaveGuard().guard` của màn đang đứng: đổi tab khi form còn dở phải hỏi "bỏ thay
 * đổi?" như nút Lui. Màn không có form (Hình ảnh, Giấy tờ, Bảo dưỡng) để trống.
 */
export const VehicleEditHeader = memo(function VehicleEditHeader({
  vehicleId,
  tab,
  title,
  guard,
  onBack,
}: {
  vehicleId: string;
  tab: VehicleEditTab;
  title: string;
  guard?: (go: () => void) => void;
  /** Mặc định về Chi tiết xe. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const tEditor = useTranslations('Vehicles.editor');
  const tSummary = useTranslations('Vehicles.editor.summary');
  const { has } = usePermissions();
  const can = useVehicleCapabilities();
  const vehicle = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));

  const run = useCallback(
    (go: () => void) => (guard ? guard(go) : go()),
    [guard],
  );
  const back = useCallback(
    () => run(onBack ?? (() => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId)))),
    [run, onBack, router, vehicleId],
  );

  /*
   * Nhãn trên tab (web `VehicleEditWorkspace`, bù 17/11/2026): góc ảnh bắt buộc còn thiếu ở "Hình
   * ảnh", giấy tờ cốt lõi đã có / 3 ở "Giấy tờ".
   */
  const missingImages = vehicle.data
    ? missingVehicleImageTypes(vehicle.data.vehicleType, vehicle.data.media ?? []).length
    : 0;
  const documents = useVehicleDocuments(vehicleId, can.documents);
  const docsPresent = CORE_DOCUMENT_TYPES.filter((type) =>
    (documents.data ?? []).some((doc) => doc.type === type && doc.hasFile),
  ).length;
  const hasDocuments = Boolean(documents.data);

  const items = useMemo(
    () =>
      vehicleEditNavGroups({
        enabled: (entry) => {
          if (entry === VEHICLE_EDIT_TAB.SOURCE) return can.source;
          if (entry === VEHICLE_EDIT_TAB.DOCUMENTS) return can.documents;
          if (entry === VEHICLE_EDIT_TAB.MAINTENANCE) return can.maintenance;
          // "Lịch sử chuyến" chỉ ở tuyến hoa hồng — gian hàng đã có màn Đơn thuê lọc theo xe.
          if (entry === VEHICLE_EDIT_TAB.TRIP_HISTORY) return false;
          return true;
        },
      })
        .flatMap((group) => group.items)
        .map((entry) => ({
          key: entry.tab,
          label: tEditor(`menu.items.${entry.labelKey}`),
          ...(entry.tab === VEHICLE_EDIT_TAB.MEDIA && missingImages > 0
            ? {
                badge: {
                  text: tEditor('menu.missingBadge', { count: missingImages }),
                  label: tEditor('menu.missingImages', { count: missingImages }),
                  warn: true,
                },
              }
            : {}),
          ...(entry.tab === VEHICLE_EDIT_TAB.DOCUMENTS && hasDocuments
            ? {
                badge: {
                  text: `${docsPresent}/${CORE_DOCUMENT_TYPES.length}`,
                  label: tEditor('menu.documentsCount', {
                    count: docsPresent,
                    total: CORE_DOCUMENT_TYPES.length,
                  }),
                  warn: docsPresent < CORE_DOCUMENT_TYPES.length,
                },
              }
            : {}),
        })),
    [can.documents, can.maintenance, can.source, tEditor, missingImages, docsPresent, hasDocuments],
  );

  const select = useCallback(
    (next: VehicleEditTab) => {
      if (next === editNavTabOf(tab)) return;
      run(() => router.replace(ROUTES.manage.vehicleEditTab(vehicleId, next)));
    },
    [router, run, tab, vehicleId],
  );

  const completeness = vehicle.data ? publishCompleteness(vehicle.data) : null;
  const percent =
    completeness && completeness.total > 0
      ? Math.round((completeness.done / completeness.total) * 100)
      : completeness
        ? 100
        : null;

  return (
    <PageTopBar
      title={title}
      onBack={back}
      actions={percent != null ? <Progress percent={percent} label={tSummary('completeness')} /> : null}
      below={<UnderlineTabs items={items} value={editNavTabOf(tab)} onChange={select} />}
    />
  );
});

/** Thanh tiến độ + "55%" (Figma `24228:103821`): vạch xanh dương, chữ 12/18 `text/gray/low`. */
const Progress = memo(function Progress({ percent, label }: { percent: number; label: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={8} accessibilityLabel={`${label} ${percent}%`}>
      <YStack w={PROGRESS_WIDTH} h={PROGRESS_HEIGHT} br={radius.pill} bg={colors.surfaceMuted} ov="hidden">
        <YStack h={PROGRESS_HEIGHT} w={`${percent}%`} br={radius.pill} bg={colors.infoStrong} />
      </YStack>
      <Text
        col={colors.placeholder}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.regular}
      >
        {`${percent}%`}
      </Text>
    </XStack>
  );
});
