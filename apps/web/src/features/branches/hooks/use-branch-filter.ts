'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { BRANCH_STATUS, PERMISSION } from '@xeprime/types';
import type { FilterField, FilterOption } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { branchLabel } from '../branch-label';
import { rememberBranch } from '../branch-memory';
import { useBranches } from './use-branches';

/**
 * Ô "Chi nhánh" của một danh sách — MỘT hook cho mọi màn lọc được.
 *
 * Bộ lọc chi nhánh sống trong thanh lọc của TỪNG màn và **chỉ** trên URL (ADR 0004 + 0051). Lý do
 * đầy đủ ở ADR 0052, tóm tắt:
 *
 *  - `vehicles` là bảng DUY NHẤT mang `branch_id`, nên chỉ những màn có dòng dữ liệu gắn với một
 *    chiếc xe mới lọc được. Ví điểm, khách hàng, hội thoại thì không — và một ô lọc hiện ở mọi
 *    trang khiến người dùng tin rằng chúng cũng đang bị lọc.
 *  - Lựa chọn ở Redux chết sau một lần F5 và không gửi link được, đúng hai điều ADR 0004 sinh ra
 *    để tránh.
 *
 * **URL là nguồn sự thật DUY NHẤT — không có bộ nhớ nào ở client.** Từng có một bản ghi nhớ ở
 * `localStorage` rồi điền lại trong effect; nó bị bỏ vì tạo ra hai nguồn và URL luôn về sau một
 * nhịp: màn hình kịp hỏi server "tất cả chi nhánh", vẽ N dòng, rồi mới co lại còn 0. Tiện lợi
 * "không phải chọn lại ở từng màn" nay do LINK điều hướng mang theo (`branch-link.ts`), nên đường
 * dẫn đích đã đúng ngay từ request đầu.
 *
 * `field === null` khi ô này không có việc gì để làm — chưa tải xong, không có `branches.view`,
 * hoặc gian hàng chỉ có một chi nhánh. Nhờ vậy khu Owner Lite (`/account/*`, chủ xe tuyến hoa
 * hồng trần 3 xe) dùng lại nguyên các màn này mà không phải thêm một nhánh điều kiện nào.
 */

/** Chỉ chi nhánh ĐANG HOẠT ĐỘNG mới chọn được — lọc theo một chi nhánh đã ngừng chỉ ra bảng rỗng. */
const BRANCH_FILTER_PARAMS = { status: BRANCH_STATUS.ACTIVE } as const;

export interface BranchFilterOptions {
  /** Chi nhánh đang lọc, đọc từ URL. `undefined` = tất cả chi nhánh. */
  value?: string;
  /**
   * Ghi chi nhánh lên URL.
   *
   * Hook gọi nó khi người dùng chọn, VÀ khi phải tự nhả một giá trị không dùng được (xem effect
   * bên dưới). Màn nào không truyền thì hook thành chỉ-đọc — không tự đổi URL của màn đó.
   */
  onChange?: (branchId: string | undefined) => void;
  /**
   * Giá trị sống ở STATE CỤC BỘ, không phải URL (hộp chọn xe của người bán).
   *
   * Vẫn cần `onChange` để ô đổi được và để hook tự nhả một giá trị không dùng được, nhưng một hộp
   * thoại KHÔNG phải một "chỗ đứng": ghi nó vào bộ nhớ menu là để một lần mở hộp thoại đổi luôn
   * chi nhánh của mọi link trên thanh điều hướng phía sau.
   */
  local?: boolean;
}

export interface BranchFilterState {
  /** Đưa vào `FilterBar.fields`; `null` = không hiện ô nào. */
  field: FilterField | null;
  /** Các chi nhánh chọn được, KHÔNG gồm mục "Tất cả" — cho thanh công cụ tự dựng (lịch). */
  options: FilterOption[];
  /** Có chi nhánh để chọn không (≥ 2 chi nhánh và có quyền xem — hoặc `locked`). */
  visible: boolean;
  /**
   * Người này bị GIỚI HẠN còn đúng một chi nhánh trong một gian hàng nhiều chi nhánh — ô vẫn
   * hiện (để họ biết mình đứng ở đâu) nhưng khoá lại. Thanh công cụ tự dựng Select (Tổng quan,
   * Lịch) phải đọc cờ này: khoá ô và KHÔNG chèn mục "Tất cả chi nhánh" — với họ không có "tất
   * cả" nào ngoài chi nhánh của mình.
   */
  locked: boolean;
  isLoading: boolean;
  /** Người dùng vừa chọn một giá trị. `ALL_FILTER` = tất cả. */
  select: (value: string | undefined) => void;
}

export function useBranchFilter(options: BranchFilterOptions = {}): BranchFilterState {
  const { value, onChange, local } = options;
  const t = useTranslations('Branches');
  const permissions = usePermissions();
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id ?? null;

  /*
   * Chỉ hỏi server khi người dùng THẬT SỰ đứng trong một gian hàng. `platform_admin` có sẵn
   * `branches.view` trong bộ quyền nhưng không thuộc tenant nào, và một lần 403 `NO_TENANT_SCOPE`
   * ở đây chỉ biến thành cảnh báo trên màn hình của đúng người không có chi nhánh nào.
   */
  /*
   * Phiên hỗ trợ (ADR 0050): nhân sự nền tảng không thuộc tenant nào nên `user.tenant` rỗng,
   * nhưng transport phiên hỗ trợ vẫn trỏ `/branches` vào đúng gian hàng đang hỗ trợ — không mở
   * cổng này thì họ mất ô lọc và mọi `?branchId=` trên URL bị nhả (ADR 0052 phần Hệ quả).
   */
  const support = useSupportSession();
  const canView = permissions.has(PERMISSION.BRANCH_VIEW) && (Boolean(tenantId) || support !== null);
  const query = useBranches(BRANCH_FILTER_PARAMS, canView);
  const noProvince = t('labels.noProvince');

  const branches = useMemo(
    () => (canView && !query.isError ? (query.data?.items ?? []) : []),
    [canView, query.isError, query.data],
  );

  const branchOptions = useMemo<FilterOption[]>(
    () =>
      branches.map((branch) => {
        const label = branchLabel(branch, noProvince);
        return {
          value: branch.id,
          label: branch.isDefault ? t('scope.defaultOption', { label }) : label,
        };
      }),
    [branches, noProvince, t],
  );

  /*
   * Đúng một chi nhánh có HAI nghĩa khác hẳn nhau:
   *
   * - Gian hàng CHỈ CÓ một chi nhánh (`activeCount` ≤ 1): ẩn ô — một dropdown chỉ có một mục
   *   chọn được là điều khiển chết.
   * - Gian hàng nhiều chi nhánh nhưng NGƯỜI NÀY bị giới hạn còn một (`/branches` đã thu hẹp
   *   theo phạm vi, còn `activeCount` đếm cả gian hàng): vẫn hiện ô, KHOÁ lại, mang tên chi
   *   nhánh — để họ biết mọi con số đang xem là của đâu, thay vì một màn hình im lặng.
   */
  const tenantActiveCount = query.data?.activeCount ?? 0;
  const limitedToOne = branchOptions.length === 1 && tenantActiveCount > 1;
  const visible = branchOptions.length > 1 || limitedToOne;

  const field = useMemo<FilterField | null>(() => {
    if (!visible) return null;
    if (limitedToOne) {
      const sole = branchOptions[0]!;
      return {
        kind: 'select',
        key: 'branchId',
        label: t('filter.label'),
        allowClear: false,
        wideDropdown: true,
        disabled: true,
        /*
         * Với người bị giới hạn, "tất cả (phần tôi thấy)" CHÍNH LÀ chi nhánh của họ — server đã
         * thu hẹp sẵn. Nên cả `ALL_FILTER` (URL không mang gì) lẫn id thật (đến từ một link)
         * đều hiện cùng một nhãn.
         */
        options: [{ value: ALL_FILTER, label: sole.label }, sole],
      };
    }
    return {
            kind: 'select',
            key: 'branchId',
            label: t('filter.label'),
            // `allowClear: false` vì mục "Tất cả chi nhánh" ĐÃ là đường về; thêm dấu × là hai
            // điều khiển cho cùng một hành động.
            allowClear: false,
            // Gian hàng nhiều chi nhánh thì danh sách dài — cho gõ để lọc.
            searchable: branchOptions.length > 8,
            // Nhãn là `Tên · Tỉnh`, dài hơn hẳn ô lọc — để panel bám bề rộng ô thì mọi mục đều
            // thành "Chi nhánh Quận 5 · …" và hai chi nhánh cùng tỉnh trông y hệt nhau.
            wideDropdown: true,
      options: [{ value: ALL_FILTER, label: t('scope.all') }, ...branchOptions],
    };
  }, [visible, limitedToOne, branchOptions, t]);

  const select = useCallback(
    (next: string | undefined) => {
      onChange?.(next && next !== ALL_FILTER ? next : undefined);
    },
    [onChange],
  );

  /*
   * `onChange` thường là arrow inline nên đổi identity mỗi render; giữ bản mới nhất trong ref để
   * effect dưới không chạy lại chỉ vì lý do đó.
   *
   * Gán trong effect chứ không thẳng trong thân hàm: ghi vào ref lúc render là hành vi không an
   * toàn với render đồng thời của React (`react-hooks/refs`). Effect này khai TRƯỚC effect dùng
   * nó nên luôn chạy trước trong cùng một lượt commit.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /*
   * Ghi bộ nhớ menu theo URL (xem `branch-memory.ts`): đứng ở màn lọc được thì bộ nhớ luôn khớp
   * với đường dẫn — kể cả khi người dùng chủ động về "Tất cả" (value = undefined ⇒ null).
   * CHỈ khi hook đang gắn với URL (có `onChange`): các chỗ dùng chỉ-đọc (ô chọn xe trong hộp
   * thoại lập đơn) không phải một "chỗ đứng" — mở hộp thoại mà xoá mất bộ nhớ là sai người.
   */
  const standing = Boolean(onChange) && !local;
  useEffect(() => {
    if (standing) rememberBranch(tenantId, value ?? null);
  }, [standing, tenantId, value]);

  /**
   * NHẢ một `branchId` không dùng được — về "Tất cả chi nhánh".
   *
   * Bốn đường dẫn tới đây, và cả bốn đều có thật:
   *
   *  1. **Người dùng sửa tay URL** (`?branchId=xxxxx…`). Không nhả thì họ nhìn một bảng rỗng và
   *     không có cách nào biết vì sao.
   *  2. **Chi nhánh vừa bị ngừng hoạt động** trong lúc tab còn mở, hoặc link cũ trỏ vào nó.
   *  3. **Link của gian hàng khác** — id hợp lệ nhưng không thuộc gian hàng này. Server đã trả
   *     rỗng (ranh giới thật là `tenantId`), nhưng màn hình vẫn phải giải thích được.
   *  4. **Ô lọc không hiện** (thiếu `branches.view`, hoặc gian hàng một chi nhánh) mà URL vẫn
   *     mang tham số: dữ liệu bị thu hẹp bởi một điều khiển KHÔNG tồn tại trên màn hình.
   *
   * Điều kiện `!query.isLoading`: lúc đang tải, `branchOptions` còn rỗng nên MỌI giá trị đều
   * trông như không hợp lệ — nhả ở đó là xoá đúng lựa chọn người dùng vừa gửi link tới.
   */
  /*
   * Chỉ nhả khi câu trả lời ĐÃ CHỐT: query thành công (danh sách là sự thật) hoặc query bị TẮT
   * (thiếu quyền/tenant — không bao giờ có danh sách để đối chiếu). Một lượt 500 tạm thời làm
   * options rỗng KHÔNG được tính: nhả ở đó là xoá đúng lựa chọn của người dùng vì mạng chập.
   */
  const settled = !canView || (!query.isLoading && !query.isError);
  useEffect(() => {
    if (!onChangeRef.current || !value || !settled) return;
    if (visible && branchOptions.some((option) => option.value === value)) return;
    onChangeRef.current(undefined);
  }, [value, visible, branchOptions, settled]);

  return { field, options: branchOptions, visible, locked: limitedToOne, isLoading: query.isLoading, select };
}
