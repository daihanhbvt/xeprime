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
  testEnvironment: 'node',
  // Mỗi spec mở một PrismaClient pool riêng lên PostgreSQL thật; không giới hạn worker thì
  // số kết nối = workers × pool và vượt max_connections khi repo thêm suite (fail hàng loạt
  // kiểu ECONNRESET dù từng suite chạy riêng vẫn xanh).
  maxWorkers: 4,
  // Nest DI đọc metadata do emitDecoratorMetadata sinh ra; thiếu import này thì
  // provider không resolve được và lỗi chỉ hiện lúc chạy test, rất khó đọc.
  setupFiles: ['reflect-metadata'],
};
