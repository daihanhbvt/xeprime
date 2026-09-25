import { PUBLISH_REQUIREMENT, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { publicationEditTab, vehiclePublicationTask } from './publication';
import type { VehicleDetail } from './api';

/**
 * Một chiếc xe ĐỦ điều kiện lên chợ — mọi test dưới đây chỉ đổi đúng thứ nó đang đo.
 *
 * Chỉ khai các trường mà `missingPublishRequirements` đọc; phần còn lại của `VehicleDetail` không
 * tham gia phép tính, và liệt kê chúng ra chỉ làm fixture che mất thứ thật sự quan trọng.
 */
function vehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: 'v1',
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    weekdayPrice: '500000',
    monthlyPrice: null,
    withDriverDailyPrice: null,
    mainImageUrl: 'https://cdn.test/a.jpg',
    /*
     * BỐN ảnh khác nhau — `VEHICLE_PUBLIC_MIN_IMAGES`. Ảnh đại diện nằm trong danh sách nên phép
     * đếm khử trùng theo URL chỉ ra 4, đúng cách backend đếm.
     */
    images: [
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
      'https://cdn.test/c.jpg',
      'https://cdn.test/d.jpg',
    ],
    plateNumber: '51A-12345',
    brand: 'Mazda',
    model: 'Mazda3',
    manufactureYear: 2020,
    fuelType: 'gasoline',
    transmission: 'automatic',
    seatCount: 5,
    motorbikeCategory: null,
    fuelConsumptionCombined: '6.5',
    engineDisplacementCc: null,
    electricRangeKm: null,
    branch: { provinceCode: '79' },
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    marketplaceEnabled: true,
    latestPublicReview: null,
    ...over,
  } as unknown as VehicleDetail;
}

/**
 * `vehiclePublicationTask` quyết định thẻ "Việc cần làm" ở đầu hồ sơ xe nói gì và bày NÚT nào
 * (ADR 0048 điều 6). Sai ở đây là một trong hai lỗi: hoặc chủ xe thấy "Không có việc cần làm"
 * cho một chiếc xe còn là nháp, hoặc họ thấy một cái nút chắc chắn dẫn tới 400.
 *
 * Đây cũng là bản đối ứng của `apps/web/src/features/vehicles/publication.ts` — hai bản KHÔNG
 * tự đồng bộ (ADR 0031), nên bảng dưới đây là hợp đồng giữa chúng.
 */
describe('vehiclePublicationTask', () => {
  it('đã duyệt VÀ đang bật ⇒ không có việc nào', () => {
    expect(vehiclePublicationTask(vehicle())).toBeNull();
  });

  /**
   * Chủ xe tự tắt là một GỢI Ý (`info`), không phải việc cần làm: nó xuống cuối thẻ và không vào
   * số đếm — một lời nhắc không được đẩy một chuyến sắp phải giao ra khỏi ba dòng đầu.
   */
  it('đã duyệt nhưng chủ xe tắt ⇒ gợi ý bật lại, mức info', () => {
    const task = vehiclePublicationTask(vehicle({ marketplaceEnabled: false }));
    expect(task).toMatchObject({
      key: 'ownerPaused',
      tone: 'info',
      primary: { kind: 'enableMarketplace', cta: 'enableMarketplace' },
      secondary: null,
    });
  });

  /**
   * `hidden` KHÔNG có đường tự phục vụ (ADR 0048 điều 4): `VEHICLE_PUBLIC_STATUS_SUBMITTABLE` đã
   * loại nó, nên một nút "Gửi duyệt lại" ở đây là mời chủ xe gỡ án ẩn của nền tảng bằng một cú
   * bấm. Lối duy nhất là hỗ trợ.
   */
  it('bị nền tảng ẩn ⇒ chỉ còn liên hệ hỗ trợ, mức critical', () => {
    const task = vehiclePublicationTask(
      vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN }),
    );
    expect(task).toMatchObject({
      key: 'platformHidden',
      tone: 'critical',
      primary: { kind: 'contactSupport' },
      secondary: null,
    });
    expect(task?.primary?.kind).not.toBe('submit');
  });

  it('đang chờ duyệt ⇒ chỉ báo trạng thái, mức info', () => {
    expect(
      vehiclePublicationTask(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW })),
    ).toMatchObject({ key: 'underReview', tone: 'info', primary: null });
  });

  it('nháp ĐÃ đủ hồ sơ ⇒ mời gửi duyệt', () => {
    const task = vehiclePublicationTask(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT }));
    expect(task).toMatchObject({
      key: 'readyToSubmit',
      tone: 'warning',
      primary: { kind: 'submit', cta: 'submit' },
    });
    expect(task?.missing).toEqual([]);
  });

  /**
   * Nháp còn THIẾU thì nút phải là "Hoàn tất hồ sơ", KHÔNG phải "Gửi duyệt".
   *
   * `submitForPublicReview` từ chối bằng `VEHICLE_PUBLISH_INCOMPLETE`, và một cái nút chắc chắn
   * dẫn tới lỗi là một cái nút không nên vẽ ra.
   */
  it('nháp còn thiếu ⇒ nút sửa hồ sơ, KHÔNG có nút gửi duyệt', () => {
    const task = vehiclePublicationTask(
      vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT, mainImageUrl: null, images: [] }),
    );
    expect(task).toMatchObject({
      key: 'completeProfile',
      primary: { kind: 'edit', cta: 'completeProfile' },
      secondary: null,
    });
    expect(task?.missing.length).toBeGreaterThan(0);
  });

  /**
   * Bị trả về: nút phụ "Gửi duyệt lại" chỉ xuất hiện khi checklist ĐÃ đủ — cùng luật với nháp,
   * và đây là chỗ dễ quên nhất vì trạng thái này vốn đã cho phép gửi lại.
   */
  it('cần bổ sung: nút gửi lại chỉ có khi đã đủ hồ sơ', () => {
    const incomplete = vehiclePublicationTask(
      vehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
        mainImageUrl: null,
        images: [],
      }),
    );
    expect(incomplete).toMatchObject({ key: 'needsRevision', tone: 'warning', secondary: null });

    const complete = vehiclePublicationTask(
      vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION }),
    );
    expect(complete?.secondary).toEqual({ kind: 'submit', cta: 'resubmit' });
  });

  it('bị từ chối ⇒ mức critical, vẫn sửa + gửi lại được', () => {
    expect(
      vehiclePublicationTask(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.REJECTED })),
    ).toMatchObject({
      key: 'rejected',
      tone: 'critical',
      primary: { kind: 'edit', cta: 'updateProfile' },
      secondary: { kind: 'submit', cta: 'resubmit' },
    });
  });

  it('đã lưu trữ ⇒ không giục gì cả', () => {
    expect(
      vehiclePublicationTask(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.ARCHIVED })),
    ).toBeNull();
  });

  /** Câu người duyệt viết đi qua NGUYÊN VĂN — nó không dịch được. */
  it('mang theo lý do của người duyệt ở hai trạng thái cần nó', () => {
    const task = vehiclePublicationTask(
      vehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.REJECTED,
        latestPublicReview: { reason: 'Ảnh mờ' },
      } as Partial<VehicleDetail>),
    );
    expect(task?.reason).toBe('Ảnh mờ');
  });
});

/**
 * Nút "Hoàn tất hồ sơ" phải mở ĐÚNG mục chứa thứ còn thiếu đầu tiên — thả người dùng vào mục mặc
 * định rồi để họ tự đi tìm là lý do bản đồ này tồn tại.
 */
describe('publicationEditTab', () => {
  it('mở mục chứa điều kiện thiếu ĐẦU TIÊN', () => {
    expect(publicationEditTab([PUBLISH_REQUIREMENT.MAIN_IMAGE])).toBe(VEHICLE_EDIT_TAB.MEDIA);
    expect(publicationEditTab([PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE])).toBe(
      VEHICLE_EDIT_TAB.PRICING,
    );
    expect(publicationEditTab([PUBLISH_REQUIREMENT.BRANCH_LOCATION])).toBe(
      VEHICLE_EDIT_TAB.INFORMATION,
    );
  });

  it('thứ tự quyết định: mục của mục thiếu đầu tiên thắng', () => {
    expect(
      publicationEditTab([PUBLISH_REQUIREMENT.PHOTOS, PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]),
    ).toBe(VEHICLE_EDIT_TAB.MEDIA);
  });

  it('không thiếu gì thì về mục thông tin', () => {
    expect(publicationEditTab([])).toBe(VEHICLE_EDIT_TAB.INFORMATION);
  });
});
