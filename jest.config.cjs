const { join } = require('node:path')
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'], // патерн для знаходження тестових файлів
  setupFilesAfterEnv: ['./jest.setup.js'] // додано шлях до вашого файлу налаштувань
}

module.exports = config
