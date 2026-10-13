"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import "./Questionscreen.css";

function getRecognitionErrorMessage(error) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access, then retry.";
    case "no-speech":
      return "No answer was heard. Retry or continue to the next question.";
    case "audio-capture":
      return "No microphone was found. Connect a microphone, then retry.";
    default:
      return "Voice recognition couldn't start. Retry or continue to the next question.";
  }
}

export default function QuestionScreen({ question = "Q.", onNext }) {
  const [status, setStatus] = useState("idle");
  const [answerText, setAnswerText] = useState("");
  const [message, setMessage] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) {
      setMessage("Audio playback isn't supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(question));
  };

  const handleAnswer = () => {
    if (status === "listening") {
      recognitionRef.current?.stop();
      setStatus("review");
      setMessage("Answer attempt stopped. Retry or continue to the next question.");
      return;
    }

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setStatus("review");
      setMessage("Voice answering isn't supported in this browser. Retry or continue.");
      return;
    }

    const recognition = new Recognition();
    let answerCaptured = false;
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      answerCaptured = transcript.length > 0;
      setAnswerText(transcript);
      setMessage(
        answerCaptured
          ? ""
          : "No answer was heard. Retry or continue to the next question."
      );
      setStatus("review");
    };

    recognition.onerror = (event) => {
      setMessage(getRecognitionErrorMessage(event.error));
      setStatus("review");
    };

    recognition.onend = () => {
      setStatus((currentStatus) => {
        if (currentStatus === "listening") {
          if (!answerCaptured) {
            setMessage("No answer was heard. Retry or continue to the next question.");
          }
          return "review";
        }
        return currentStatus;
      });
    };

    setAnswerText("");
    setMessage("");
    setStatus("listening");

    try {
      recognition.start();
    } catch {
      setStatus("review");
      setMessage("Voice recognition couldn't start. Retry or continue to the next question.");
    }
  };

  const handleRetry = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setAnswerText("");
    setMessage("");
    setStatus("idle");
  };

  const handleNext = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setAnswerText("");
    setMessage("");
    setStatus("idle");
    onNext?.();
  };

  return (
    <main className="qs-screen">
      <button
        className="qs-speaker"
        type="button"
        onClick={handleSpeak}
        aria-label="Read question aloud"
      >
        <svg
          className="qs-speaker-icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="25"
          height="25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      </button>

      <section className="qs-card" aria-live="polite">
        <p>{question}</p>
      </section>

      <div className="qs-actions">
        <p className="qs-feedback" role="status" aria-live="polite">
          {answerText ? `You said: ${answerText}` : message}
        </p>

        {status === "review" ? (
          <div className="qs-row">
            <button
              className="qs-secondary"
              type="button"
              onClick={handleRetry}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Retry
            </button>
            <button
              className="qs-primary qs-next"
              type="button"
              onClick={handleNext}
            >
              Next
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            className="qs-primary qs-answer"
            type="button"
            onClick={handleAnswer}
          >
            {status === "listening" ? "Tap to stop" : "Tap to answer"}
            <Image src="/assets/mic.png" alt="" width={20} height={20} />
          </button>
        )}
      </div>
    </main>
  );
}
