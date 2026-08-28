/// <reference lib="webworker" />
import { parseBillingFile } from './billing.parser'
import type { BillingWorkerRequest, BillingWorkerResponse } from './billing.types'

self.onmessage = (event: MessageEvent<BillingWorkerRequest>) => {
  let response: BillingWorkerResponse
  try {
    response = { ok: true, summary: parseBillingFile(event.data.name, event.data.text) }
  } catch (error) {
    response = { ok: false, message: error instanceof Error ? error.message : '账单解析失败' }
  }
  self.postMessage(response)
}

export {}
