import { describe, expect, it } from 'vitest';
import {
  CATALOG_REVIEW_STATUS,
  VEHICLE_DATA_GAP,
  VEHICLE_DATA_STATUS,
  catalogResidualPercent,
  catalogVariantKey,
  composeVehicleName,
  estimateCatalogValue,
  rentPercentile,
  vehicleDataGaps,
  vehicleDataStatus,
  variantCoversYear,
} from './vehicle-master-data';
import { VEHICLE_TYPE } from './status/vehicle';

describe('dữ liệu xe chuẩn', () => {
  it('khoá phiên bản là slug ổn định; tên rỗng ⇒ khoá rỗng', () => {
    expect(catalogVariantKey('1.5G CVT')).toBe('1-5g-cvt');
    expect(catalogVariantKey('  Bản Đặc Biệt ')).toBe('ban-dac-biet');
    expect(catalogVariantKey('')).toBe('');
    expect(catalogVariantKey('  ')).toBe('');
  });

  it('trạng thái hiển thị suy từ duyệt + bật/tắt', () => {
    expect(vehicleDataStatus({ reviewStatus: CATALOG_REVIEW_STATUS.PENDING, active: true })).toBe(
      VEHICLE_DATA_STATUS.PENDING,
    );
    expect(vehicleDataStatus({ reviewStatus: CATALOG_REVIEW_STATUS.APPROVED, active: true })).toBe(
      VEHICLE_DATA_STATUS.ACTIVE,
    );
    expect(vehicleDataStatus({ reviewStatus: CATALOG_REVIEW_STATUS.APPROVED, active: false })).toBe(
      VEHICLE_DATA_STATUS.HIDDEN,
    );
  });

  it('thiếu dữ liệu: ô tô cần số chỗ + kiểu dáng + giá bán, xe máy thì không', () => {
    const base = {
      seatCount: null,
      bodyType: null,
      fuelType: 'gasoline',
      transmission: 'cvt',
      listPrice: null,
      weekdayPrice: '800000',
    };
    expect(vehicleDataGaps({ ...base, vehicleType: VEHICLE_TYPE.CAR })).toEqual([
      VEHICLE_DATA_GAP.SPEC,
      VEHICLE_DATA_GAP.LIST_PRICE,
    ]);
    expect(
      vehicleDataGaps({ ...base, vehicleType: VEHICLE_TYPE.MOTORBIKE, transmission: 'automatic_cvt' }),
    ).toEqual([]);
    expect(
      vehicleDataGaps({ ...base, vehicleType: VEHICLE_TYPE.MOTORBIKE, weekdayPrice: null }),
    ).toEqual([VEHICLE_DATA_GAP.RENT]);
  });

  it('khấu hao: năm đầu 10%, mỗi năm 4%, sàn 30%', () => {
    expect(catalogResidualPercent(0)).toBe(100);
    expect(catalogResidualPercent(1)).toBe(90);
    expect(catalogResidualPercent(4)).toBe(78);
    expect(catalogResidualPercent(8)).toBe(62);
    expect(catalogResidualPercent(16)).toBe(30);
    expect(catalogResidualPercent(25)).toBe(30);
  });

  it('giá trị xe = giá bán mới × khấu hao, làm tròn triệu', () => {
    // Tuổi 4 ⇒ 78% × 545tr = 425,1tr ⇒ 425tr.
    expect(estimateCatalogValue('545000000', 2022, 2026)).toEqual({
      amount: '425000000',
      age: 4,
      residualPercent: 78,
    });
    // Không biết năm ⇒ như xe mới; năm ở tương lai ⇒ tuổi 0.
    expect(estimateCatalogValue('545000000', null, 2026)?.amount).toBe('545000000');
    expect(estimateCatalogValue('545000000', 2027, 2026)?.residualPercent).toBe(100);
  });

  it('kẹp trong khoảng bảo hiểm nhận, không có giá ⇒ null', () => {
    expect(estimateCatalogValue('90000000', 2000, 2026)?.amount).toBe('50000000');
    expect(estimateCatalogValue(null, 2020, 2026)).toBeNull();
    expect(estimateCatalogValue('abc', 2020, 2026)).toBeNull();
  });

  it('phân vị nội suy tuyến tính, làm tròn nghìn', () => {
    const sorted = [600000, 700000, 800000, 900000, 1000000];
    expect(rentPercentile(sorted, 0.25)).toBe('700000');
    expect(rentPercentile(sorted, 0.5)).toBe('800000');
    expect(rentPercentile([600000, 750000], 0.5)).toBe('675000');
    expect(rentPercentile([], 0.5)).toBeNull();
  });

  it('tên xe tự ghép: hãng · dòng · phiên bản · năm, bỏ phần trống, không lặp hãng', () => {
    expect(
      composeVehicleName({
        brandLabel: 'Toyota',
        modelLabel: 'Vios',
        variantLabel: '1.5G CVT',
        manufactureYear: 2019,
      }),
    ).toBe('Toyota Vios 1.5G CVT 2019');
    expect(composeVehicleName({ brandLabel: 'Hyundai', modelLabel: 'Grand i10', manufactureYear: 2019 })).toBe(
      'Hyundai Grand i10 2019',
    );
    expect(composeVehicleName({ brandLabel: 'VinFast', modelLabel: 'vinfast VF 3' })).toBe('vinfast VF 3');
    expect(composeVehicleName({ brandLabel: '  ', modelLabel: null })).toBe('');
    expect(composeVehicleName({ modelLabel: 'x'.repeat(300) })).toHaveLength(255);
  });

  it('đời xe: năm nằm trong khoảng, đầu trống là mở', () => {
    expect(variantCoversYear({ yearFrom: 2018, yearTo: 2022 }, 2019)).toBe(true);
    expect(variantCoversYear({ yearFrom: 2018, yearTo: 2022 }, 2023)).toBe(false);
    expect(variantCoversYear({ yearFrom: 2023, yearTo: null }, 2026)).toBe(true);
    expect(variantCoversYear({ yearFrom: 2023, yearTo: null }, 2020)).toBe(false);
    expect(variantCoversYear({ yearFrom: null, yearTo: null }, 2001)).toBe(true);
    expect(variantCoversYear({ yearFrom: 2018, yearTo: 2022 }, null)).toBe(true);
  });
});
