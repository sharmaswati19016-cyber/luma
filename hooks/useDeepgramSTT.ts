"use client";
import { useRef, useState, useCallback } from "react";

export function useDeepgramSTT(keyterms: string[] = []) {
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setFinalText(""); setInterim("");
    const { token } = await (await fetch("/api/deepgram-token")).json();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const params = new URLSearchParams({
      model: "nova-3",
      language: "en",
      interim_results: "true",
      smart_format: "false",
    });
    keyterms.forEach((k) => params.append("keyterm", k));

    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ["bearer", token]
    );
    wsRef.current = ws;

    ws.onopen = () => {
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      rec.start(250); // send a chunk every 250 ms
      setListening(true);
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const t = d.channel?.alternatives?.[0]?.transcript;
      if (!t) return;
      if (d.is_final) {
        setFinalText((p) => (p + " " + t).trim());
        setInterim("");
      } else {
        setInterim(t);
      }
    };
  }, [keyterms]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current?.send(JSON.stringify({ type: "CloseStream" }));
    setListening(false);
  }, []);

  return { finalText, interim, listening, start, stop };
}