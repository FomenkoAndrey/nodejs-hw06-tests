// Node.js specific setup
import { vi } from 'vitest'

// Налаштування мок-функцій для Node.js середовища
beforeEach(() => {
  console.error = vi.fn()
  console.log = vi.fn()
})

afterEach(() => {
  vi.clearAllMocks()
}) 
