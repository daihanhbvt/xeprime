import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOVER_CONDITION, HANDOVER_PHOTO_SLOT, HANDOVER_TYPE } from '@xeprime/types';

import { TripHandoverEvidence } from './TripHandoverEvidence';
import type { CustomerTripHandoverEvidence } from '../types';

/**
 * Biên bản bàn giao phía KHÁCH.
 *
 * Khối này là bằng chứng, nên các test dưới đây khoá đúng những chỗ mà một lần "làm đẹp giao
 * diện" có thể biến nó thành lời nói dối: thiếu Odo hoá thành `0 km`, ảnh bổ sung muộn trông
 * như ảnh chụp lúc bàn giao, lỗi mạng trông như "gian hàng không lưu gì cả". Cộng thêm hai
 * ràng buộc về chi phí: khối thu gọn sẵn, và chưa mở thì không nạp gì.
 */
const evidenceQ = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  calls: [] as boolean[],
}));
const photosQ = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  calls: [] as boolean[],
}));

vi.mock('../hooks', () => ({
  photoKey: (type: string, slot: string) => `${type}:${slot}`,
  useTripHandoverEvidence: (_id: string, enabled: boolean) => {
    evidenceQ.calls.push(enabled);
    return enabled
      ? evidenceQ
      : { data: undefined, isLoading: false, isError: false, error: undefined };
  },
  useTripHandoverPhotos: (_id: string, _records: unknown, enabled: boolean) => {
    photosQ.calls.push(enabled);
    return enabled ? photosQ : { data: undefined, isFetching: false };
  },
}));

const FRONT_KEY = `${HANDOVER_TYPE.PICKUP}:${HANDOVER_PHOTO_SLOT.FRONT}`;

const PICKUP: CustomerTripHandoverEvidence = {
  type: HANDOVER_TYPE.PICKUP,
  occurredAt: '2026-08-09T02:00:00.000Z',
  confirmedAt: '2026-08-09T02:00:00.000Z',
  odometerKm: 45230,
  odometerMissing: false,
  condition: HANDOVER_CONDITION.NORMAL,
  photos: [
    {
      slot: HANDOVER_PHOTO_SLOT.FRONT,
      uploadedAt: '2026-08-09T01:58:00.000Z',
      addedAfterConfirmation: false,
    },
  ],
};

afterEach(cleanup);
beforeEach(() => {
  evidenceQ.data = [PICKUP];
  evidenceQ.isLoading = false;
  evidenceQ.isError = false;
  evidenceQ.error = undefined;
  evidenceQ.calls = [];
  photosQ.data = { [FRONT_KEY]: 'https://r2/a.jpg' };
  photosQ.isFetching = false;
  photosQ.calls = [];
});

const mount = (enabled = true) => render(<TripHandoverEvidence tripId="RQ1" enabled={enabled} />);

/** Mở panel — đúng thao tác của người dùng, không chọc vào state. */
function openPanel() {
  fireEvent.click(screen.getByText('Biên bản bàn giao'));
}

describe('Thu gọn sẵn', () => {
  it('chuyến chưa có mốc bàn giao thì không dựng gì cả', () => {
    const { container } = mount(false);
    expect(container.innerHTML).toBe('');
  });

  it('mặc định đóng: thấy tiêu đề, chưa thấy nội dung, và chưa nạp gì', () => {
    mount();
    expect(screen.getByText('Biên bản bàn giao')).toBeTruthy();
    expect(screen.queryByText('45.230 km')).toBeNull();
    // Khoá chi phí: cả hai truy vấn đều nhận `enabled` false khi khối còn đóng.
    expect(evidenceQ.calls.every((enabled) => enabled === false)).toBe(true);
    expect(photosQ.calls.every((enabled) => enabled === false)).toBe(true);
  });

  it('mở ra mới nạp dữ liệu và ảnh', () => {
    mount();
    openPanel();
    expect(evidenceQ.calls.at(-1)).toBe(true);
    expect(photosQ.calls.at(-1)).toBe(true);
    expect(screen.getByText('45.230 km')).toBeTruthy();
  });
});

describe('Nói đúng sự thật của bản ghi', () => {
  it('không có biên bản nào đã xác nhận thì nói thẳng, không để trống', () => {
    evidenceQ.data = [];
    mount();
    openPanel();
    expect(
      screen.getByText('Gian hàng chưa xác nhận biên bản bàn giao nào cho chuyến này.'),
    ).toBeTruthy();
  });

  /*
   * Lỗi tải KHÁC "không có biên bản". Nếu hai trường hợp cùng ra một câu, khách đọc sự cố mạng
   * thành "gian hàng không lưu bằng chứng nào" — sai hẳn nghĩa, đúng lúc họ cần đối chiếu nhất.
   */
  it('lỗi tải nói rõ là lỗi', () => {
    evidenceQ.data = undefined;
    evidenceQ.isError = true;
    mount();
    openPanel();
    expect(screen.getByText('Không tải được biên bản bàn giao')).toBeTruthy();
  });

  it('thiếu Odo hiện câu "chưa ghi nhận", tuyệt đối không phải 0 km', () => {
    evidenceQ.data = [{ ...PICKUP, odometerKm: null, odometerMissing: true }];
    mount();
    openPanel();
    expect(screen.getByText('Chưa ghi nhận chỉ số Odo')).toBeTruthy();
    expect(screen.queryByText(/\b0 km\b/)).toBeNull();
  });

  it('ảnh bổ sung sau xác nhận mang nhãn riêng; ảnh chụp lúc bàn giao thì không', () => {
    evidenceQ.data = [
      {
        ...PICKUP,
        photos: [
          ...PICKUP.photos,
          {
            slot: HANDOVER_PHOTO_SLOT.REAR,
            uploadedAt: '2026-08-12T02:00:00.000Z',
            addedAfterConfirmation: true,
          },
        ],
      },
    ];
    mount();
    openPanel();
    expect(screen.getAllByText('Bổ sung sau khi xác nhận bàn giao')).toHaveLength(1);
  });

  /*
   * Mốc ghi nhận chỉ đáng hiện khi nó KHÁC mốc thực tế. Bấm xác nhận ngay tại quầy lệch vài
   * giây — in thêm một dòng y hệt dòng trên là nhiễu, không phải minh bạch.
   */
  it('trùng phút thì không thêm dòng "ghi nhận trên hệ thống"', () => {
    evidenceQ.data = [{ ...PICKUP, confirmedAt: '2026-08-09T02:00:40.000Z' }];
    mount();
    openPanel();
    expect(screen.queryByText('Ghi nhận trên hệ thống')).toBeNull();
  });

  it('lệch hẳn thì hiện cả hai mốc', () => {
    evidenceQ.data = [{ ...PICKUP, confirmedAt: '2026-08-09T03:30:00.000Z' }];
    mount();
    openPanel();
    expect(screen.getByText('Ghi nhận trên hệ thống')).toBeTruthy();
  });

  it('luôn kèm câu chú thích trung lập trỏ về gian hàng', () => {
    mount();
    openPanel();
    expect(
      screen.getByText(
        'Đây là biên bản do gian hàng ghi nhận. Nếu có khác biệt, hãy liên hệ trực tiếp với gian hàng.',
      ),
    ).toBeTruthy();
  });

  it('biên bản không có ảnh nói thẳng là không có', () => {
    evidenceQ.data = [{ ...PICKUP, photos: [] }];
    mount();
    openPanel();
    expect(
      screen.getByText('Gian hàng không lưu ảnh hiện trạng cho lần bàn giao này.'),
    ).toBeTruthy();
  });
});

describe('Ảnh thu nhỏ', () => {
  it('có vé ký thì dựng ảnh THẬT, không phải một cái nút hứa hẹn', () => {
    mount();
    openPanel();
    const img = screen.getByAltText('Ảnh hiện trạng: Trước') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://r2/a.jpg');
  });

  it('vé hỏng riêng một ô thì ô đó nói không mở được, không giả vờ là chưa chụp', () => {
    photosQ.data = { [FRONT_KEY]: null };
    mount();
    openPanel();
    expect(screen.getByText('Không mở được ảnh')).toBeTruthy();
    // Vẫn phải thấy góc chụp đó TỒN TẠI — khác hẳn "không có ảnh hiện trạng".
    expect(screen.getByText('Trước')).toBeTruthy();
    expect(
      screen.queryByText('Gian hàng không lưu ảnh hiện trạng cho lần bàn giao này.'),
    ).toBeNull();
  });
});
