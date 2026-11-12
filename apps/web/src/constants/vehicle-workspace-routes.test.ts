import { describe, expect, it } from 'vitest';

import { isCommissionPage } from '@/features/auth/post-auth-destination';

import {
  VEHICLE_EDIT_TAB,
  VEHICLE_MANAGE_SECTION,
  WORKSPACE,
  workspaceVehiclePaths,
} from './routes';

/**
 * ĐƯỜNG DẪN TỚI MỘT CHIẾC XE PHẢI Ở LẠI TRONG KHU CỦA NGƯỜI DÙNG.
 *
 * Vì sao bộ test này tồn tại: mỗi link phải dẫn tới một trang mà `AppShell` cho tuyến đó ở lại —
 * một link tới trang tuyến kia là **một ngõ cụt** (bị đá về trang chủ). Từ 03/11/2026 hai tuyến
 * dùng CHUNG trang chi tiết và màn sửa xe (`/vehicles/<id>`, `/vehicles/<id>/edit`); phần chỉ tuyến
 * gói có (nguồn xe, bảo dưỡng) thì tuyến hoa hồng không có lối vào nào.
 *
 * Đây là phép kiểm THUẦN — không render, không mock — vì luật nằm trọn trong bảng đường dẫn.
 */
describe('workspaceVehiclePaths - mỗi khu dẫn về chính nó', () => {
  const manage = workspaceVehiclePaths(WORKSPACE.MANAGE);
  const account = workspaceVehiclePaths(WORKSPACE.ACCOUNT);
  const ID = '01M0GSW2002RRX9QAAPZ4WM9VB';

  /*
   * 03/11/2026 (sổ cái §3.6 E24): hai tuyến dùng CHUNG trang chi tiết và màn sửa xe — mọi đích của
   * tuyến hoa hồng là trang họ được ở (không có cú đá ngược), không còn không gian "Quản lý xe" cũ
   * (nó chỉ còn chuyển hướng).
   */
  it('Owner Lite dẫn vào trang chi tiết + màn sửa CHUNG, đều là trang tuyến hoa hồng được ở', () => {
    const hrefs = [
      account.detail(ID),
      account.profile(ID),
      account.pricing(ID),
      account.optimization(ID),
      account.manageSection(ID, VEHICLE_MANAGE_SECTION.DOCUMENTS),
      account.part(ID, VEHICLE_EDIT_TAB.INFORMATION, VEHICLE_MANAGE_SECTION.INFORMATION),
      account.part(ID, VEHICLE_EDIT_TAB.MEDIA, VEHICLE_MANAGE_SECTION.IMAGES),
      account.part(ID, VEHICLE_EDIT_TAB.DOCUMENTS, VEHICLE_MANAGE_SECTION.DOCUMENTS),
    ];

    for (const href of hrefs) {
      expect(href).not.toBeNull();
      expect(href).toMatch(new RegExp(`^/manage/vehicles/${ID}(/edit(\\?tab=[a-z-]+)?|/manage/.+)?$`));
      // Mọi đích đều là trang tuyến hoa hồng được ở — không có link nào dẫn tới cú đá ngược.
      expect(isCommissionPage(href as string), href as string).toBe(true);
    }
  });

  it('cổng quản lý giữ nguyên hành vi cũ - tab của màn sửa xe', () => {
    expect(manage.detail(ID)).toBe(`/manage/vehicles/${ID}`);
    // `profile` là Ý ĐỊNH "nơi sửa hồ sơ xe"; ở cổng quản lý nó vẫn là route sửa trần, không
    // kèm `?tab=` — link cũ và bookmark cũ không đổi.
    expect(manage.profile(ID)).toBe(`/manage/vehicles/${ID}/edit`);
    /*
     * Giá và tối ưu nhận chuyến trỏ vào MỤC của màn sửa xe, không vào hai route cũ: từ
     * 29/09/2026 hai route đó chỉ còn là một lần chuyển hướng tới đúng hai mục này, và bắt link
     * mới đi qua chúng là một nhịp thừa.
     */
    expect(manage.pricing(ID)).toBe(`/manage/vehicles/${ID}/edit?tab=pricing`);
    expect(manage.optimization(ID)).toBe(
      `/manage/vehicles/${ID}/edit?tab=self-drive-optimization`,
    );
    expect(manage.part(ID, VEHICLE_EDIT_TAB.DOCUMENTS, VEHICLE_MANAGE_SECTION.DOCUMENTS)).toBe(
      `/manage/vehicles/${ID}/edit?tab=documents`,
    );
  });

  it('phần chỉ có ở cổng quản lý trả `null` ở khu tài khoản, KHÔNG rơi về một tab bừa', () => {
    // Nguồn xe và bảo dưỡng thuộc tuyến GÓI (`@SubscriptionTrackOnly` ở backend). Trả một
    // đường dẫn `/manage` ở đây nghĩa là dựng một link chắc chắn dẫn tới cú đá ngược.
    expect(account.part(ID, VEHICLE_EDIT_TAB.SOURCE, null)).toBeNull();
    expect(account.part(ID, VEHICLE_EDIT_TAB.MAINTENANCE, null)).toBeNull();
    // Cùng hai phần đó ở cổng quản lý thì vẫn có đích.
    expect(manage.part(ID, VEHICLE_EDIT_TAB.SOURCE, null)).toBe(
      `/manage/vehicles/${ID}/edit?tab=source`,
    );
  });

  it('giá và tối ưu nhận chuyến có ở CẢ HAI khu - không khu nào mất tính năng', () => {
    expect(account.pricing(ID)).toBe(manage.pricing(ID));
    expect(account.optimization(ID)).toBe(manage.optimization(ID));
    // Phần chỉ tuyến gói có (nguồn xe) vẫn không có lối vào ở tuyến hoa hồng.
    expect(account.part(ID, VEHICLE_EDIT_TAB.SOURCE, null)).toBeNull();
  });
});
