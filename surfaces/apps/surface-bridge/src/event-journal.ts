/**
 * In-memory ring buffer for event replay on client reconnection.
 * Stores last N events (default 1000) with monotonically increasing sequence numbers.
 * Does NOT survive bridge restart -- clients do full refresh on restart.
 */

import type { EventBridgeEnvelope } from '@thrunt-surfaces/contracts';

export interface EventJournal {
  /** Assign next sequence number and store event in the ring buffer. Returns the completed envelope. */
  append(event: Omit<EventBridgeEnvelope, 'seq'>): EventBridgeEnvelope;
  /** Replay events after the given sequence number, or report overflow if too old. */
  replayFrom(lastSeq: number): { events: EventBridgeEnvelope[] } | { overflow: true; oldestSeq: number; currentSeq: number };
  /** Return the latest sequence number assigned. */
  currentSeq(): number;
  /** Return how many events are currently in the buffer (min of total appended, capacity). */
  size(): number;
}

export function createEventJournal(capacity: number = 1000): EventJournal {
  const buffer: (EventBridgeEnvelope | null)[] = new Array(capacity).fill(null);
  let writePointer = 0;
  let nextSeq = 1;
  let totalAppended = 0;

  function append(event: Omit<EventBridgeEnvelope, 'seq'>): EventBridgeEnvelope {
    const seq = nextSeq++;
    const envelope: EventBridgeEnvelope = {
      ...event,
      seq,
      ts: event.ts || new Date().toISOString(),
    };
    buffer[writePointer] = envelope;
    writePointer = (writePointer + 1) % capacity;
    totalAppended++;
    return envelope;
  }

  function replayFrom(lastSeq: number): { events: EventBridgeEnvelope[] } | { overflow: true; oldestSeq: number; currentSeq: number } {
    const currentSequence = nextSeq - 1;
    if (currentSequence === 0) {
      // No events appended yet
      return { events: [] };
    }

    const count = Math.min(totalAppended, capacity);
    // Oldest seq in the buffer
    const oldestSeq = currentSequence - count + 1;

    if (lastSeq < oldestSeq - 1) {
      // The requested seq is older than our oldest event -- overflow
      return { overflow: true, oldestSeq, currentSeq: currentSequence };
    }

    // Collect events with seq > lastSeq
    const events: EventBridgeEnvelope[] = [];
    for (let i = 0; i < count; i++) {
      // Read from oldest to newest
      const idx = (writePointer - count + i + capacity) % capacity;
      const entry = buffer[idx];
      if (entry && entry.seq > lastSeq) {
        events.push(entry);
      }
    }

    return { events };
  }

  return {
    append,
    replayFrom,
    currentSeq: () => nextSeq - 1,
    size: () => Math.min(totalAppended, capacity),
  };
}
