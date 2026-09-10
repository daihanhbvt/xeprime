import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BRANCH_STATUS,
  BRANCH_STATUS_META,
  STATUS_COLOR,
  type BranchStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { IconLine } from '@/components/ui/IconLine';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { BRANCH_ACTION, type Branch, type BranchAction } from '../api';

export interface BranchCardActionState {
  /** Có được bấm không. `reason` chỉ có nghĩa khi `false`. */
  enabled: boolean;
  reason?: string;
}

/**
 * MỘT chi nhánh trong danh sách — bản native của một hàng `DataTable` bên web.
 *
 * **Thẻ CHẬT, đúng nhịp của `VehicleCard`: đệm 8, khe 4.** Một chi nhánh là một bản ghi ngắn —
 * tên, mã, tỉnh, số xe, số điện thoại — và một gian hàng có vài chi nhánh chứ không vài chục,
 * nên thứ đáng tối ưu là thấy được HẾT chúng trong một màn. Bản trước dùng đệm 16 / khe 8 cùng
 * một đĩa 32pt và một khối chỉ số hai cột: cao 220pt cho ngần ấy chữ, tức chưa đầy ba chi nhánh
 * mỗi màn.
 *
 * Định danh gộp thành MỘT dòng meta `mã · tỉnh · số xe · điện thoại` ở bậc `meta` (11px) — đúng
 * vai mà token đó có tên. Bốn mẩu ấy từng là một khối `FactRow` hai cột cao 34pt để nói đúng hai
 * con số, mà cả hai đều tự xưng tên ("4 xe" không cần nhãn "Số xe" ở trên).
 *
 * Màu để dành cho hai chỗ mang tin: VẠCH trạng thái ở mép trái (lướt bằng mắt) và dải viên nhãn
 * (đọc thành chữ). Bản trước còn thêm một đĩa tròn tô theo trạng thái ở đầu thẻ — nói đúng thứ
 * mà vạch và viên nhãn đã nói, mà tốn cả một hàng 34pt.
 *
 * Nút bị khoá vẫn HIỆN kèm LÝ DO ngay dưới, không ẩn đi: "không ngừng được vì đây là chi nhánh
 * mặc định" là một luật nghiệp vụ mà người dùng cần biết, và một nút biến mất không nói được điều
 * đó. Web nói cùng câu ấy bằng tooltip — trên cảm ứng không có hover, nên nó xuống thành chữ.
 *
 * Thiếu `branches.manage` thì KHÔNG có thanh thao tác nào cả: đó là chuyện quyền, không phải luật
 * nghiệp vụ, và bày ra ba ô mờ chỉ làm màn hình ồn.
 */
export function BranchCard({
  branch,
  canManage,
  pendingAction,
  onEdit,
  onAction,
  actionState,
}: {
  branch: Branch;
  canManage: boolean;
  /** Thao tác đang chạy trên CHÍNH chi nhánh này — ô tương ứng quay, phần còn lại khoá. */
  pendingAction: BranchAction | null;
  onEdit: (branch: Branch) => void;
  onAction: (branch: Branch, action: BranchAction) => void;
  /** Luật nghiệp vụ chặn từng thao tác — do màn hình tính, xem `BranchListScreen`. */
  actionState: Readonly<Record<BranchAction, BranchCardActionState>>;
}) {
  const t = useTranslations('Branches');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();

  const isActive = branch.status === BRANCH_STATUS.ACTIVE;
  const toggle: BranchAction = isActive ? BRANCH_ACTION.DEACTIVATE : BRANCH_ACTION.ACTIVATE;
  const meta = BRANCH_STATUS_META[branch.status as BranchStatus];
  const statusLabel = domainLabel('branchStatus', branch.status, meta.label);

  const blockedReasons = useMemo(() => {
    if (!canManage) return [];
    const shown: BranchAction[] = branch.isDefault
      ? [toggle]
      : [BRANCH_ACTION.SET_DEFAULT, toggle];
    return shown
      .filter((action) => !actionState[action].enabled)
      .map((action) => actionState[action].reason)
      .filter((reason): reason is string => Boolean(reason));
  }, [actionState, branch.isDefault, canManage, toggle]);

  /*
   * "Chi nhánh này Ở ĐÂU" — tỉnh và địa chỉ là MỘT câu, không hai dòng: đọc rời nhau thì tỉnh
   * thành một mẩu lơ lửng, mà nó vốn là phần cuối của chính cái địa chỉ ngay trên nó.
   *
   * Tỉnh vắng mặt khi chi nhánh chưa có tỉnh — chỗ của nó là một viên nhãn CẢNH BÁO ở dải chip,
   * vì đó là việc phải xử lý (xe của chi nhánh không lên chợ được), không phải một ô trống.
   */
  const location = [branch.address, branch.provinceName].filter(Boolean).join(LIST_SEPARATOR);

  const badges: BadgeRowItem[] = [
    ...(branch.isDefault
      ? [
          {
            key: 'default',
            label: t('labels.default'),
            node: (
              <StatusBadge label={t('labels.default')} color={STATUS_COLOR.WAITING} size="sm" />
            ),
          },
        ]
      : []),
    ...(branch.provinceName
      ? []
      : [
          {
            key: 'noProvince',
            label: t('labels.noProvince'),
            node: (
              <StatusBadge label={t('labels.noProvince')} color={STATUS_COLOR.WARNING} size="sm" />
            ),
          },
        ]),
  ];

  /*
   * ĐÚNG ba thao tác của `BranchesView`, cùng thứ tự và cùng luật hiện/ẩn — kể cả việc "Đặt làm
   * mặc định" biến mất ở chính chi nhánh đang là mặc định (không phải khoá lại: nó vô nghĩa, chứ
   * không phải bị chặn).
   *
   * Không có "Xoá": chi nhánh còn xe/đơn là dữ liệu lịch sử và FK ở DB chặn xoá cứng — vòng đời
   * đúng là ngừng hoạt động.
   */
  const actions: CardAction[] = canManage
    ? [
        {
          key: 'edit',
          label: tActions('edit'),
          icon: 'create-outline' as IconName,
          disabled: pendingAction !== null,
          onPress: () => onEdit(branch),
        },
        ...(branch.isDefault
          ? []
          : [
              {
                key: BRANCH_ACTION.SET_DEFAULT,
                label: t('actions.setDefault'),
                icon: 'checkmark-circle-outline' as IconName,
                disabled:
                  pendingAction !== null || !actionState[BRANCH_ACTION.SET_DEFAULT].enabled,
                loading: pendingAction === BRANCH_ACTION.SET_DEFAULT,
                onPress: () => onAction(branch, BRANCH_ACTION.SET_DEFAULT),
              },
            ]),
        {
          key: toggle,
          label: isActive ? t('actions.deactivate') : t('actions.activate'),
          icon: (isActive ? 'pause-circle-outline' : 'play-circle-outline') as IconName,
          /* Ngừng một chi nhánh là thao tác PHÁ — cùng sắc đỏ mà web dùng cho `danger`. */
          ...(isActive ? { tone: 'danger' as const } : {}),
          disabled: pendingAction !== null || !actionState[toggle].enabled,
          loading: pendingAction === toggle,
          onPress: () => onAction(branch, toggle),
        },
      ]
    : [];

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={meta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            {/*
              TRẠNG THÁI ở góc trên phải; MÃ chi nhánh xuống dòng phụ dưới tên.

              Trạng thái là thứ quyết định chi nhánh này còn nhận xe, nhận đơn được hay không —
              nó xứng đáng vị trí đắt nhất thẻ. Mã ("CN01") thì chỉ là khoá tra cứu: cần khi đối
              chiếu với một chứng từ, không cần khi lướt danh sách. Đứng thành dòng phụ dưới tên,
              nó vẫn ở nguyên chỗ mắt tìm mà không tranh chỗ với thứ mang tin — cùng khuôn
              tên/email của `MemberCard` và tên/vai của thẻ tài xế.
            */}
            <XStack ai="center" gap={space.xs}>
              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {branch.name}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
                  {branch.code}
                </Text>
              </YStack>
              <StatusBadge label={statusLabel} color={meta.color} size="sm" />
            </XStack>

            {/*
              Dải nhãn giờ chỉ còn các NGOẠI LỆ: chi nhánh mặc định, và chi nhánh chưa có tỉnh.
              Chi nhánh bình thường không có viên nào ⇒ `BadgeRows` không dựng gì và thẻ ngắn lại
              đúng một hàng — thứ đáng giá trên một danh sách cuộn dài.
            */}
            <BadgeRows items={badges} />

            {/*
              Hai mẩu người ta mở màn này ra để LẤY: xe đang đỗ ở đây, và gọi cho ai.

              Chúng đứng thành một hàng riêng chữ đậm có hình mang màu, không lẫn vào dòng chữ mờ
              bên dưới — đó là khác biệt giữa "dữ liệu" và "ngữ cảnh". Xanh dương cho số xe theo
              đúng vai `info` mà dải chỉ số của `VehicleCard` dùng cho một con số đếm; xanh lá cho
              điện thoại vì đó là màu nút gọi trên cả hai nền tảng, không phải một màu tự chọn.
            */}
            <XStack gap={space.sm}>
              <YStack f={1} minWidth={0}>
                <IconLine icon="car-outline" iconTone={colors.info} strong>
                  {t('labels.vehicles', { count: branch.vehicleCount })}
                </IconLine>
              </YStack>
              {branch.phone ? (
                <YStack f={1} minWidth={0}>
                  <IconLine icon="call-outline" iconTone={colors.success} strong>
                    {branch.phone}
                  </IconLine>
                </YStack>
              ) : null}
            </XStack>

            {location ? <IconLine icon="location-outline">{location}</IconLine> : null}

            {/* Vì sao một ô ở thanh dưới đang khoá — nằm sát trên chính thanh đó. */}
            {blockedReasons.map((reason) => (
              <IconLine key={reason} icon="information-circle-outline">
                {reason}
              </IconLine>
            ))}
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}
