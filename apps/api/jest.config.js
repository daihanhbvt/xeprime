/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/openapi.ts'],
  coverageDirectory: 'coverage',
  /**
   * `jest-environment-node` là devDependency TƯỜNG MINH của `apps/api` (xem package.json) —
   * đừng gỡ nó đi vì "jest đã kéo sẵn rồi".
   *
   * Chuỗi `'node'` được `jest-resolve` tra bắt đầu từ `rootDir`, tức `apps/api`. Với cách liên
   * kết chặt của pnpm, gói nào không khai báo thì không nằm trong `apps/api/node_modules`, nên
   * Node đi ngược lên `node_modules` của workspace — nơi `apps/mobile` (React Native) mang theo
   * cả một cây **jest 29**. Kết quả: runtime jest 30 chạy cùng environment jest 29, và mọi suite
   * chết ngay lúc khởi động bằng `this._moduleMocker.clearMocksOnScope is not a function`.
   *
   * Lỗi này chỉ hiện trên bản cài SẠCH (CI, `--frozen-lockfile`): `node_modules` có sẵn từ trước
   * khi `apps/mobile` ra đời vẫn resolve đúng bản 30, nên máy dev báo xanh còn CI đỏ 61/61.
   */
  testEnvironment: 'node',
  // Mỗi spec mở một PrismaClient pool riêng lên PostgreSQL thật; không giới hạn worker thì
  // số kết nối = workers × pool và vượt max_connections khi repo thêm suite (fail hàng loạt
  // kiểu ECONNRESET dù từng suite chạy riêng vẫn xanh).
  maxWorkers: 4,
  // Cổng vào chạy MỘT lần trước cả run: với REQUIRE_DB=1 thì thiếu PostgreSQL là ĐỎ, không phải
  // 51 spec lặng lẽ bỏ qua rồi báo xanh. Lý do đầy đủ ở đầu test/global-setup.ts.
  globalSetup: '<rootDir>/test/global-setup.ts',
  // Nest DI đọc metadata do emitDecoratorMetadata sinh ra; thiếu import này thì
  // provider không resolve được và lỗi chỉ hiện lúc chạy test, rất khó đọc.
  // `setup-test-db` PHẢI đứng trước: nó chốt `DATABASE_URL` trước khi spec gọi
  // `createPrismaClient()` ở module scope.
  setupFiles: ['<rootDir>/test/setup-test-db.ts', 'reflect-metadata'],
};
