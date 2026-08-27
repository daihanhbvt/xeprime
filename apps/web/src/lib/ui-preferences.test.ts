import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_NAV_PREFERENCES,
  parseNavPreferences,
  persistNavPreferences,
  serializeNavPreferences,
  UI_PREFERENCES_COOKIE,
} from './ui-preferences';

/**
 * Cookie tuỳ chọn điều hướng.
 *
 * Đây là dữ liệu ĐẾN TỪ CLIENT — người dùng sửa tay được, bản cũ có thể mang định dạng khác,
 * và trình duyệt có thể cắt cụt. Không giá trị nào trong đó được phép làm vỡ lần render đầu
 * của cả cổng quản lý, nên mọi nhánh lạ đều rơi về mặc định thay vì ném lỗi.
 */

afterEach(() => {
  document.cookie = `${UI_PREFERENCES_COOKIE}=; path=/; max-age=0`;
});

describe('ui-preferences — đọc/ghi', () => {
  it('ghi rồi đọc lại ra đúng thứ đã ghi', () => {
    const value = { sidebarCollapsed: true, navSectionsCollapsed: ['business', 'settings'] };

    expect(parseNavPreferences(serializeNavPreferences(value))).toEqual(value);
  });

  it('không có cookie → mặc định: sidebar mở, không khối nào bị gập', () => {
    expect(parseNavPreferences(undefined)).toEqual(DEFAULT_NAV_PREFERENCES);
    expect(parseNavPreferences('')).toEqual(DEFAULT_NAV_PREFERENCES);
  });

  it('cookie hỏng/lạ không nổ, chỉ rơi về mặc định', () => {
    for (const raw of ['rác', 'sidebar', 'sidebar=maybe&sections', '{"json":true}']) {
      expect(() => parseNavPreferences(raw)).not.toThrow();
      expect(parseNavPreferences(raw).sidebarCollapsed).toBe(false);
    }
  });

  it('danh sách khối rỗng không sinh ra chuỗi rỗng giả trong mảng', () => {
    expect(parseNavPreferences('sidebar=1&sections=').navSectionsCollapsed).toEqual([]);
  });

  it('đọc được cả bản chỉ có một nửa thông tin (bản cũ, hoặc bị cắt)', () => {
    expect(parseNavPreferences('sidebar=1')).toEqual({
      sidebarCollapsed: true,
      navSectionsCollapsed: [],
    });
    expect(parseNavPreferences('sections=settings')).toEqual({
      sidebarCollapsed: false,
      navSectionsCollapsed: ['settings'],
    });
  });

  it('persist ghi ra chính cookie mà server đọc', () => {
    persistNavPreferences({ sidebarCollapsed: true, navSectionsCollapsed: ['settings'] });

    expect(document.cookie).toContain(`${UI_PREFERENCES_COOKIE}=`);
    const raw = decodeURIComponent(
      document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${UI_PREFERENCES_COOKIE}=`))!
        .split('=')
        .slice(1)
        .join('='),
    );
    expect(parseNavPreferences(raw)).toEqual({
      sidebarCollapsed: true,
      navSectionsCollapsed: ['settings'],
    });
  });

  it('KHÔNG mang gì cần bảo vệ — chỉ hai tuỳ chọn giao diện', () => {
    // Cookie này đọc được bằng JavaScript (client phải tự ghi). Ghi lại đây để không ai nhét
    // danh tính, quyền hay phạm vi dữ liệu vào — những thứ đó thuộc `XP_SESSION` httpOnly.
    const serialized = serializeNavPreferences({
      sidebarCollapsed: true,
      navSectionsCollapsed: ['settings'],
    });
    expect(serialized).toBe('sidebar=1&sections=settings');
  });
});
