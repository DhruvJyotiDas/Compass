"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SSEMessage {
  type: string;
  data: Record<string, unknown>;
}

export function useSSE(campaignId: string | null) {
  const [events, setEvents] = useState<SSEMessage[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    const es = new EventSource(`${API}/campaigns/${campaignId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg: SSEMessage = JSON.parse(e.data);
        setEvents((prev) => [msg, ...prev].slice(0, 200));
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [campaignId]);

  return events;
}

export function usePipelineStream(pipelineId: string | null) {
  const [steps, setSteps] = useState<Array<{ step: string; output: unknown; latency_ms: number; valid: boolean }>>([]);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!pipelineId) return;

    const es = new EventSource(`${API}/pipelines/${pipelineId}/stream`);
    esRef.current = es;

    es.addEventListener("step_complete", (e: MessageEvent) => {
      try {
        const step = JSON.parse(e.data);
        setSteps((prev) => [...prev, step]);
      } catch {}
    });

    es.addEventListener("done", () => {
      setDone(true);
      es.close();
    });

    es.onerror = () => es.close();

    return () => es.close();
  }, [pipelineId]);

  return { steps, done };
}
