import type { ID } from '../domain/types.js';

export interface AvailabilitySlot {
  /** ISO datetime (with tz offset). */
  start: string;
  end: string;
  teacherId: ID;
}

export interface BookedEvent {
  eventId: string;
  start: string;
  end: string;
}

/**
 * Calendar contract for parent-teacher conference booking. Real implementations
 * wrap Calendly, Google Calendar, or the SIS's own conference scheduler.
 */
export interface CalendarProvider {
  findAvailable(teacherId: ID, from: Date, to: Date): Promise<AvailabilitySlot[]>;
  book(slot: AvailabilitySlot, studentId: ID): Promise<BookedEvent>;
}

/**
 * Deterministic mock: proposes 30-minute slots at 3:00, 3:30, 4:00 PM local on
 * the next three business days. Good enough to exercise the full booking flow.
 */
export class MockCalendarProvider implements CalendarProvider {
  async findAvailable(teacherId: ID, from: Date, to: Date): Promise<AvailabilitySlot[]> {
    const slots: AvailabilitySlot[] = [];
    const cursor = new Date(from);
    const startTimes = [15, 15.5, 16]; // 3:00, 3:30, 4:00 PM

    while (cursor <= to && slots.length < 6) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        for (const hour of startTimes) {
          const h = Math.floor(hour);
          const m = (hour - h) * 60;
          const start = new Date(cursor);
          start.setHours(h, m, 0, 0);
          const end = new Date(start.getTime() + 30 * 60 * 1000);
          slots.push({ start: start.toISOString(), end: end.toISOString(), teacherId });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
  }

  async book(slot: AvailabilitySlot, studentId: ID): Promise<BookedEvent> {
    return {
      eventId: `EVT-${Date.now().toString(36).toUpperCase()}`,
      start: slot.start,
      end: slot.end,
    };
  }
}
