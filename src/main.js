console.log('#57. JavaScript homework example file')

import fs, { createReadStream, createWriteStream, existsSync } from 'fs'
import { createGunzip, createGzip } from 'zlib'
import { join, parse } from 'path'

/*
 *
 * #1
 *
 * Технічне завдання для розробки функції "compressFile"
 *
 * Задача:
 * Розробити асинхронну функцію, що використовує алгоритм Gzip для компресії заданого файлу.
 * Функція має генерувати унікальне ім'я для компресованого файлу, якщо файл з таким іменем вже існує,
 * та забезпечувати високий рівень надійності та безпеки процесу компресії.
 *
 * Функціональні вимоги:
 * 1. Вхідні параметри:
 *    - `filePath`: Шлях до файлу, який потрібно компресувати.
 *
 * 2. Вихідні дані:
 *    - Функція повертає шлях до компресованого файлу як рядок.
 *
 * 3. Унікальність:
 *    - Перевірка наявності існуючих файлів з таким самим іменем і створення унікального імені файлу
 *      шляхом додавання номера до існуючого імені, якщо необхідно.
 *
 * 4. Обробка помилок:
 *    - Функція має ідентифікувати та коректно обробляти помилки читання, запису та доступу до файлів.
 *    - В разі помилок, функція має повертати відповідні повідомлення про помилку або коди помилок,
 *      що дозволяють користувачеві або іншим частинам програми адекватно реагувати на такі ситуації.
 *
 * Технічні вимоги:
 * - Використання сучасних можливостей JavaScript (ES6+), включаючи асинхронні функції, стрімове API Node.js, та ESM
 *   для легкої інтеграції та тестування.
 * - Функція має бути написана таким чином, щоб її можна було експортувати та використовувати в інших частинах програми
 *   або тестових сценаріях.
 * - Забезпечення документації коду з описом параметрів, процесу роботи, виключень, які можуть бути сгенеровані,
 *   та прикладами використання.
 * - Підготовка функції для можливості легкого мокування та тестування за допомогою JEST.
 *
 */

async function compressFile(filePath) {
  const { dir, name, ext } = parse(filePath)
  let counter = 1
  let compressedFilePath = `${filePath}.gz`

  while (existsSync(compressedFilePath)) {
    compressedFilePath = join(dir, `${name}_${counter}${ext}.gz`)
    counter++
  }

  const sourceStream = createReadStream(filePath)
  const gzipStream = createGzip()
  const destinationStream = createWriteStream(compressedFilePath)

  return new Promise((resolve, reject) => {
    sourceStream
      .pipe(gzipStream)
      .pipe(destinationStream)
      .on('finish', () => resolve(compressedFilePath))
      .on('error', reject)
  })
}

/*
 *
 * #2
 *
 * Технічне завдання для розробки функції "decompressFile"
 *
 * Задача:
 * Розробити асинхронну функцію, яка використовує алгоритм Gzip для розпакування заданого компресованого файлу у вказане місце збереження. Функція має генерувати унікальне ім'я для розпакованого файлу, якщо файл з таким іменем вже існує, та забезпечувати високий рівень надійності та безпеки процесу розпакування.
 *
 * Функціональні вимоги:
 * 1. Вхідні параметри:
 *  - `compressedFilePath`: Шлях до компресованого файлу, який потрібно розпакувати.
 *  - `destinationFilePath`: Шлях, де буде збережено розпакований файл.
 *
 * 2. Вихідні дані:
 *  - Функція повертає шлях до розпакованого файлу як рядок.
 *
 * 3. Унікальність:
 *  - Перевірка наявності існуючих файлів з таким самим іменем і створення унікального імені файлу шляхом додавання номера до існуючого імені, якщо необхідно.
 *
 * 4. Обробка помилок:
 *  - Функція має ідентифікувати та коректно обробляти помилки читання, запису та доступу до файлів.
 *  - В разі помилок, функція має повертати відповідні повідомлення про помилку або коди помилок,
 *    що дозволяють користувачеві або іншим частинам програми адекватно реагувати на такі ситуації.
 *
 * Технічні вимоги:
 * - Використання сучасних можливостей JavaScript (ES6+), включаючи асинхронні функції, стрімове API Node.js, та ESM для легкої інтеграції та тестування.
 * - Функція має бути написана таким чином, щоб її можна було експортувати та використовувати в інших частинах програми або тестових сценаріях.
 * - Забезпечення документації коду з описом параметрів, процесу роботи, виключень, які можуть бути сгенеровані, та прикладами використання.
 * - Підготовка функції для можливості легкого мокування та тестування за допомогою JEST.
 *
 */

async function decompressFile(compressedFilePath, destinationFilePath) {
  const { dir, name, ext } = parse(destinationFilePath)
  let finalPath = destinationFilePath
  let counter = 1

  // Перевірка існування кінцевого файлу і генерація унікального імені, якщо потрібно
  while (existsSync(finalPath)) {
    finalPath = join(dir, `${name}_${counter}${ext}`)
    counter++
  }

  try {
    // Асинхронна перевірка наявності вхідного файлу
    await fs.promises.access(compressedFilePath, fs.constants.F_OK)

    const sourceStream = createReadStream(compressedFilePath)
    const gunzipStream = createGunzip()
    const destinationStream = createWriteStream(finalPath)

    return new Promise((resolve, reject) => {
      sourceStream
        .on('error', (err) => {
          console.error('Error in source stream:', err)
          reject(err)
        })
        .pipe(gunzipStream)
        .on('error', (err) => {
          console.error('Error in gunzip stream:', err)
          reject(err)
        })
        .pipe(destinationStream)
        .on('finish', () => {
          console.log('Decompression finished successfully.')
          resolve(finalPath)
        })
        .on('error', (err) => {
          console.error('Error in destination stream:', err)
          reject(err)
        })
    })
  } catch (err) {
    // Логування помилки, якщо файл не знайдено або інша помилка доступу
    console.error(`File not found or inaccessible: ${compressedFilePath}`, err)
    throw err // Повторне викидання помилки для подальшої обробки
  }
}

// ! Перевірка роботи функцій стиснення та розпакування файлів
async function performCompressionAndDecompression() {
  try {
    const compressedResult = await compressFile('./files/source.txt')
    console.log(compressedResult)
    const decompressedResult = await decompressFile(compressedResult, './files/source_decompressed.txt')
    console.log(decompressedResult)
  } catch (error) {
    console.error('Error during compression or decompression:', error)
  }
}

performCompressionAndDecompression()

export { compressFile, decompressFile }
