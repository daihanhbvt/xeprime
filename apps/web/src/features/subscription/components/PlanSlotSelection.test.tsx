import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { VEHICLE_PUBLIC_STATUS, VEHICLE_TYPE, type VehicleType } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';

import type { PlanSlotOverflow, PlanSlotVehicle } from '../types';
import {
  EMPTY_PLAN_SLOT_CHOICE,
  PlanSlotSelection,
  planSlotChoiceReady,
  planSlotSelectionBody,
  type PlanSlotChoice,
} from './PlanSlotSelection';

/**
 * Khối chọn xe giữ lại khi lượt mua vượt suất (ADR 0085 điều 5). Khoá ba điều: hệ thống không chọn
 * thay (không tích sẵn), mỗi nhóm giữ tối đa đúng số suất, và phải xác nhận mới đi tiếp.
 */
const vehicle = (
  id: string,
  name: string,
  plateNumber: string | null = null,
  vehicleType: VehicleType = VEHICLE_TYPE.CAR,
): PlanSlotVehicle => ({
  id,
  name,
  plateNumber,
  vehicleType,
  mainImageUrl: null,
  publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
});

const OVER_CAR: PlanSlotOverflow = {
  countedScope: 'car',
  limit: 1,
  occupyingCount: 2,
  vehicles: [vehicle('A', 'Vios', '51K-1'), vehicle('B', 'City')],
};
const NO_MOTO: PlanSlotOverflow = {
  countedScope: 'motorbike',
  limit: 0,
  occupyingCount: 3,
  vehicles: [
    vehicle('M1', 'Vision', null, VEHICLE_TYPE.MOTORBIKE),
    vehicle('M2', 'Lead', null, VEHICLE_TYPE.MOTORBIKE),
  ],
};

function Harness({ groups }: { groups: PlanSlotOverflow[] }) {
  const [value, setValue] = useState<PlanSlotChoice>(EMPTY_PLAN_SLOT_CHOICE);
  return (
    <>
      <PlanSlotSelection groups={groups} value={value} onChange={setValue} />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as PlanSlotChoice;

describe('PlanSlotSelection', () => {
  it('không tích sẵn xe nào; đủ suất thì xe còn lại khoá lại', () => {
    renderWithIntl(<Harness groups={[OVER_CAR]} />);
    const vios = screen.getByRole('checkbox', { name: /Vios · 51K-1/ }) as HTMLInputElement;
    const city = screen.getByRole('checkbox', { name: 'City' }) as HTMLInputElement;
    expect(vios.checked).toBe(false);
    expect(city.checked).toBe(false);

    fireEvent.click(vios);
    expect(state().keepVehicleIds).toEqual(['A']);
    expect(city.disabled).toBe(true);
    expect(screen.getByText('Đã chọn 1/1')).toBeTruthy();
  });

  it('nhóm trần 0: chỉ liệt kê xe sẽ ẩn (không ô chọn) và nói số xe còn lại ngoài danh sách', () => {
    renderWithIntl(<Harness groups={[NO_MOTO]} />);
    expect(screen.getByText(/không gồm xe máy - 3 xe sẽ tạm ẩn/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Vision' })).toBeNull();
    expect(screen.getByText(/Và 1 xe khác/)).toBeTruthy();
  });

  it('phải tích xác nhận thì mới đi tiếp được', () => {
    renderWithIntl(<Harness groups={[OVER_CAR]} />);
    expect(planSlotChoiceReady([OVER_CAR], state())).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý tạm ẩn/ }));
    expect(planSlotChoiceReady([OVER_CAR], state())).toBe(true);
  });

  it('không có nhóm vượt: không dựng gì, đi tiếp ngay, không gửi trường nào', () => {
    renderWithIntl(<Harness groups={[]} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(planSlotChoiceReady([], EMPTY_PLAN_SLOT_CHOICE)).toBe(true);
    expect(planSlotChoiceReady(undefined, EMPTY_PLAN_SLOT_CHOICE)).toBe(true);
    expect(planSlotSelectionBody([], { keepVehicleIds: ['A'], accepted: true })).toEqual({});
  });

  it('thân gửi lên lọc bỏ xe không thuộc nhóm đang vượt', () => {
    expect(
      planSlotSelectionBody([OVER_CAR], { keepVehicleIds: ['A', 'STALE'], accepted: true }),
    ).toEqual({ keepVehicleIds: ['A'], acceptVehicleHiding: true });
  });
});
