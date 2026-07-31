import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSpecialist, getThreadMessages, messages as seedMessages, threads } from "./mock-data";
import { CURRENT_CLIENT_ID } from "./mock-data";
import type { ChatMessage } from "./types";

/**
 * Chat runtime.
 *
 * Owns the live conversation state for the Messages screen: message history,
 * optimistic sends, delivery/read receipts, typing indicators and a scripted
 * specialist reply so the thread behaves like a real conversation. History is
 * persisted per browser; swap the storage calls for realtime subscriptions
 * when the backend lands.
 */

const STORAGE_KEY = "ashnight-chat-log";

export type DeliveryState = "sending" | "sent" | "read";

export interface LiveMessage extends ChatMessage {
  delivery?: DeliveryState | undefined;
}

type Log = Record<string, LiveMessage[]>;

function seedLog(): Log {
  return Object.fromEntries(
    threads.map((thread) => [
      thread.id,
      getThreadMessages(thread.id).map<LiveMessage>((message) =>
        message.authorId === CURRENT_CLIENT_ID
          ? { ...message, delivery: "read" }
          : { ...message },
      ),
    ]),
  );
}

function loadLog(): Log {
  const base = seedLog();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Log;
    for (const [threadId, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      const seeded = base[threadId] ?? [];
      const seededIds = new Set(seeded.map((message) => message.id));
      base[threadId] = [...seeded, ...list.filter((message) => !seededIds.has(message.id))];
    }
  } catch {
    /* ignore malformed storage */
  }
  return base;
}

const REPLIES = [
  "Got it — that works for me.",
  "Noted. I'll bring the extra supplies for that.",
  "Sounds good. Want me to walk the space with you on a quick call first?",
  "Thanks for the detail, that helps me quote it properly.",
  "I can be there at that time. Anything I should avoid touching?",
];

export function useChat(activeThreadId: string) {
  const [log, setLog] = useState<Log>(() => seedLog());
  const [typingThreadId, setTypingThreadId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>(() =>
    Object.fromEntries(threads.map((thread) => [thread.id, thread.unread])),
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setLog(loadLog());
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const persist = useCallback((next: Log) => {
    try {
      const custom: Log = {};
      const seedIds = new Set(seedMessages.map((message) => message.id));
      for (const [threadId, list] of Object.entries(next)) {
        custom[threadId] = list.filter((message) => !seedIds.has(message.id));
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const append = useCallback(
    (threadId: string, message: LiveMessage) => {
      setLog((current) => {
        const next: Log = { ...current, [threadId]: [...(current[threadId] ?? []), message] };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const patch = useCallback(
    (threadId: string, messageId: string, changes: Partial<LiveMessage>) => {
      setLog((current) => {
        const next: Log = {
          ...current,
          [threadId]: (current[threadId] ?? []).map((message) =>
            message.id === messageId ? { ...message, ...changes } : message,
          ),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const track = useCallback((timer: ReturnType<typeof setTimeout>) => {
    timers.current.push(timer);
  }, []);

  const markRead = useCallback((threadId: string) => {
    setUnread((current) => ({ ...current, [threadId]: 0 }));
  }, []);

  useEffect(() => {
    markRead(activeThreadId);
  }, [activeThreadId, markRead]);

  const send = useCallback(
    (threadId: string, body: string) => {
      const id = `m-${Date.now()}`;
      append(threadId, {
        id,
        threadId,
        authorId: CURRENT_CLIENT_ID,
        body,
        at: new Date().toISOString(),
        kind: "text",
        delivery: "sending",
      });

      track(setTimeout(() => patch(threadId, id, { delivery: "sent" }), 450));
      track(
        setTimeout(() => {
          patch(threadId, id, { delivery: "read" });
          setTypingThreadId(threadId);
        }, 1300),
      );
      track(
        setTimeout(
          () => {
            const thread = threads.find((item) => item.id === threadId);
            const specialistId = thread?.specialistId ?? "";
            setTypingThreadId((current) => (current === threadId ? null : current));
            append(threadId, {
              id: `r-${Date.now()}`,
              threadId,
              authorId: specialistId,
              body: REPLIES[Math.floor(Math.random() * REPLIES.length)]!,
              at: new Date().toISOString(),
              kind: "text",
            });
            setUnread((current) =>
              threadId === activeThreadId
                ? current
                : { ...current, [threadId]: (current[threadId] ?? 0) + 1 },
            );
          },
          2600 + Math.random() * 900,
        ),
      );
    },
    [activeThreadId, append, patch, track],
  );

  const systemNote = useCallback(
    (threadId: string, body: string) => {
      append(threadId, {
        id: `s-${Date.now()}`,
        threadId,
        authorId: "system",
        body,
        at: new Date().toISOString(),
        kind: "system",
      });
    },
    [append],
  );

  const bookingNote = useCallback(
    (threadId: string, body: string, escrowId?: string) => {
      append(threadId, {
        id: `b-${Date.now()}`,
        threadId,
        authorId: CURRENT_CLIENT_ID,
        body,
        at: new Date().toISOString(),
        kind: "booking",
        delivery: "sent",
        ...(escrowId ? { escrowId } : {}),
      });
    },
    [append],
  );

  const giftNote = useCallback(
    (threadId: string, body: string, escrowId?: string) => {
      append(threadId, {
        id: `g-${Date.now()}`,
        threadId,
        authorId: CURRENT_CLIENT_ID,
        body,
        at: new Date().toISOString(),
        kind: "gift",
        delivery: "sent",
        ...(escrowId ? { escrowId } : {}),
      });
    },
    [append],
  );


  const threadList = useMemo(
    () =>
      threads
        .map((thread) => {
          const list = log[thread.id] ?? [];
          const last = list[list.length - 1];
          return {
            ...thread,
            specialist: getSpecialist(thread.specialistId)!,
            lastMessage: last?.body ?? thread.lastMessage,
            lastAt: last?.at ?? thread.lastAt,
            unread: unread[thread.id] ?? 0,
          };
        })
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)),
    [log, unread],
  );

  return {
    threadList,
    messages: log[activeThreadId] ?? [],
    typing: typingThreadId === activeThreadId,
    send,
    systemNote,
    bookingNote,
    markRead,
  };
}
