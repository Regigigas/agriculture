import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SyncDatabase } from './sync-database';
import { SYNC_COLLECTIONS, SyncCollection, SyncEvent, SyncExchangeResponse } from './sync.types';

@Injectable()
export class SyncService {
  constructor(private readonly database: SyncDatabase) {}

  exchange(body: unknown): SyncExchangeResponse {
    const input = this.object(body);
    const clientId = this.identifier(input.clientId, 'clientId');
    const cursor = this.integer(input.cursor ?? 0, 'cursor', 0, Number.MAX_SAFE_INTEGER);
    const limit = this.integer(input.limit ?? 200, 'limit', 1, 500);
    if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
      throw new HttpException('不支持的同步协议版本', HttpStatus.BAD_REQUEST);
    }
    if (!Array.isArray(input.events) || input.events.length > 200) {
      throw new HttpException('events 必须是长度不超过 200 的数组', HttpStatus.BAD_REQUEST);
    }
    const events = input.events.map((value, index) => this.event(value, index));
    return this.database.exchange(clientId, cursor, events, limit);
  }

  private event(value: unknown, index: number): SyncEvent {
    const input = this.object(value, `events[${index}]`);
    const collection = this.identifier(input.collection, `events[${index}].collection`) as SyncCollection;
    if (!SYNC_COLLECTIONS.includes(collection)) {
      throw new HttpException(`不支持同步集合 ${collection}`, HttpStatus.BAD_REQUEST);
    }
    const payload = this.object(input.payload, `events[${index}].payload`);
    const entityId = this.identifier(input.entityId, `events[${index}].entityId`);
    if (payload.id !== entityId) {
      throw new HttpException(`events[${index}].payload.id 必须与 entityId 一致`, HttpStatus.BAD_REQUEST);
    }
    const occurredAt = this.identifier(input.occurredAt, `events[${index}].occurredAt`);
    if (Number.isNaN(Date.parse(occurredAt))) {
      throw new HttpException(`events[${index}].occurredAt 必须是有效日期时间`, HttpStatus.BAD_REQUEST);
    }
    return {
      eventId: this.identifier(input.eventId, `events[${index}].eventId`),
      collection,
      entityId,
      payload,
      baseRevision: this.integer(input.baseRevision, `events[${index}].baseRevision`, 0, Number.MAX_SAFE_INTEGER),
      occurredAt,
    };
  }

  private object(value: unknown, name = '请求体'): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpException(`${name} 必须是 JSON 对象`, HttpStatus.BAD_REQUEST);
    }
    return value as Record<string, unknown>;
  }

  private identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 128) {
      throw new HttpException(`${name} 必须是长度不超过 128 的非空字符串`, HttpStatus.BAD_REQUEST);
    }
    return value.trim();
  }

  private integer(value: unknown, name: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new HttpException(`${name} 必须是 ${min} 到 ${max} 之间的整数`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }
}
