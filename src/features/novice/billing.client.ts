import type { BillingImportSummary, BillingWorkerResponse } from './billing.types'

const MAX_FILE_BYTES = 20 * 1024 * 1024

export async function analyzeBillingFile(file: File): Promise<BillingImportSummary> {
  const extension = file.name.toLowerCase().split('.').at(-1)
  if (extension !== 'csv' && extension !== 'json') throw new Error('请选择 CSV 或 JSON 账单文件')
  if (file.size > MAX_FILE_BYTES) throw new Error('账单文件不能超过 20MB')

  const text = await file.text()
  const worker = new Worker(new URL('./billing.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<BillingWorkerResponse>) => {
      worker.terminate()
      event.data.ok ? resolve(event.data.summary) : reject(new Error(event.data.message))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('账单解析线程启动失败'))
    }
    worker.postMessage({ name: file.name, text })
  })
}
