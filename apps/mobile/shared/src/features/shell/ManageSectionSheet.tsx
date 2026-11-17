import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { ManageNavLeaf } from './manage-nav';
import { drawnLeavesOf, leafActiveHref, type ResolvedSection } from './manage-menu';
import { ManageMenuRow, NeedsActionPill, menuLeafLook } from './ManageMenuRow';
import type { PartnerTrack } from './partner-track';

/**
 * Tấm danh sách mục của MỘT khối menu — mở khi chạm ô Vận hành / Xe & Tài xế / Doanh thu của thanh
 * dưới đáy (Figma `_Filter Modal` `24175:57561` · `24238:63687`): tiêu đề khối + nút đóng, mỗi mục
 * một dòng (ô icon màu · tên · mô tả · "N cần xử lý" · ›).
 *
 * Mục và thứ tự đến NGUYÊN từ `resolveSections` (đã lọc quyền / sở hữu / cờ gói / tuyến) — tấm này
 * không tự quyết mục nào hiện.
 */
export function ManageSectionSheet({
  section,
  track,
  onClose,
  onSelect,
  activeHref,
}: {
  /** Href của trang đang mở (`useManageMenu`) - dòng khớp hiện trạng thái đang chọn. */
  activeHref: string | null;
  /** Khối đang mở; `null` ⇒ tấm đóng. */
  section: ResolvedSection | null;
  track: PartnerTrack;
  onClose: () => void;
  onSelect: (leaf: ManageNavLeaf) => void;
}) {
  const t = useTranslations('Navigation');
  const tMenu = useTranslations('MobileShell.manageMenu');
  const tShell = useTranslations('ManageCommon.shell');
  const leaves = section ? drawnLeavesOf(section.nodes) : [];

  return (
    <BottomSheet
      open={section !== null}
      onClose={onClose}
      title={section ? t(section.section.labelKey as never) : undefined}
      padded={false}
      /*
        Vẽ trong cây chứ không qua `Modal` (xem `BottomSheet.presentation`): tấm phủ tới mép dưới màn
        hình, không để lộ trang + viên thanh tab dưới nó. Đầu tấm theo Figma "_Filter Modal" (`v2`).
      */
      presentation="overlay"
      chrome="v2"
    >
      {/* Figma "Filter Form" `24175:57563`: đệm 16 bốn phía. */}
      <YStack p={FORM_PAD}>
        {leaves.map(({ leaf, badge, urgent }, index) => {
          const look = menuLeafLook(leaf, track);
          const title = t(leaf.labelKey as never);
          const a11yLabel =
            badge > 0
              ? `${title}, ${
                  urgent
                    ? tShell('needsActionUrgent', { count: badge })
                    : tShell('needsAction', { count: badge })
                }`
              : title;
          return (
            <ManageMenuRow
              key={leaf.key}
              icon={look.icon}
              tone={look.tone}
              title={title}
              description={look.description ? tMenu(`descriptions.${look.description}`) : null}
              trailing={badge > 0 ? <NeedsActionPill count={badge} /> : null}
              a11yLabel={a11yLabel}
              last={index === leaves.length - 1}
              active={activeHref !== null && leafActiveHref(leaf) === activeHref}
              onPress={() => onSelect(leaf)}
            />
          );
        })}
      </YStack>
    </BottomSheet>
  );
}

const FORM_PAD = 16;
