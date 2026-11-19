import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';
import { errMsg } from '../log.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type SendResult = { ok: true; ticketId: string } | { ok: false; error: string; tokenInvalid: boolean };
export type ReceiptResult = { ok: true } | { ok: false; error: string; tokenInvalid: boolean };

/** Abstraction over the push service so the alert logic can be tested without the network. */
export interface PushSender {
  /** Returns one result per input message, in the same order. */
  send(messages: PushMessage[]): Promise<SendResult[]>;
  /** Returns a result for every receipt id Expo knows about. Unknown ids are omitted. */
  getReceipts(ticketIds: string[]): Promise<Map<string, ReceiptResult>>;
}

/**
 * Sends through the Expo Push Service, which delivers to iPhones via APNs using the
 * credentials EAS manages for your app. Handles invalid tokens, chunking and receipts.
 */
export class ExpoPushSender implements PushSender {
  private readonly expo: Expo;

  constructor(accessToken?: string) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  async send(messages: PushMessage[]): Promise<SendResult[]> {
    const results: SendResult[] = new Array(messages.length);
    const valid: { index: number; msg: ExpoPushMessage }[] = [];

    messages.forEach((m, index) => {
      if (!Expo.isExpoPushToken(m.to)) {
        results[index] = { ok: false, error: 'InvalidExpoPushToken', tokenInvalid: true };
        return;
      }
      valid.push({
        index,
        msg: { to: m.to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high', ttl: 6 * 60 * 60 },
      });
    });

    for (let i = 0; i < valid.length; i += 100) {
      const chunk = valid.slice(i, i + 100);
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk.map((c) => c.msg));
        chunk.forEach((c, j) => {
          const t = tickets[j];
          if (t?.status === 'ok') results[c.index] = { ok: true, ticketId: t.id };
          else if (t?.status === 'error') {
            const code = t.details?.error ?? 'PushError';
            results[c.index] = { ok: false, error: `${code}: ${t.message}`, tokenInvalid: code === 'DeviceNotRegistered' };
          } else results[c.index] = { ok: false, error: 'NoTicketReturned', tokenInvalid: false };
        });
      } catch (e) {
        for (const c of chunk) results[c.index] = { ok: false, error: `SendFailed: ${errMsg(e)}`, tokenInvalid: false };
      }
    }
    return results;
  }

  async getReceipts(ticketIds: string[]): Promise<Map<string, ReceiptResult>> {
    const out = new Map<string, ReceiptResult>();
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(ticketIds)) {
      let receipts: Record<string, ExpoPushReceipt>;
      try {
        receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      } catch {
        continue; // try again on the next run
      }
      for (const [id, r] of Object.entries(receipts)) {
        if (r.status === 'ok') out.set(id, { ok: true });
        else {
          const code = r.details?.error ?? 'ReceiptError';
          out.set(id, { ok: false, error: `${code}: ${r.message}`, tokenInvalid: code === 'DeviceNotRegistered' });
        }
      }
    }
    return out;
  }
}
