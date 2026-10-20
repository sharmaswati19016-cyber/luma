"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countValidFluencyWords,
  getDailyFluencyCategory,
  getDailyWordSet,
  submitCheckin,
} from "../../../lib/api";
import { buildPictureOptions, getIconSrc } from "../../../lib/wordIcons";
import { useDeepgramSTT } from "../../../hooks/useDeepgramSTT";
import Logo from "../shared/Logo";
import { CHECKIN_QUESTIONS, CHECKIN_TASK_ORDER } from "./questions";
import "./CheckinController.css";

const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function shuffledWeekdays() {
  const today = new Date().getDay();
  const choices = [today, (today + 1) % 7, (today + 2) % 7, (today + 3) % 7];
  return choices.sort(() => Math.random() - 0.5).map((day) => weekDays[day]);
}

export function scoreFreeRecall(transcript, targetWords) {
  const heardWords = new Set(
    transcript
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  return targetWords.reduce((score, word) => {
    const normalized = word.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return score + (heardWords.has(normalized) ? 1 : 0);
  }, 0);
}

function wordsFromTranscript(text) {
  return text
    .split(/[,\n;]+|\s+/)
    .map((word) => word.trim().replace(/[.!?]+$/g, ""))
    .filter(Boolean);
}

function ReviewAnswer({ title, text, copy, onRetry, onConfirm }) {
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(text);

  function acceptAnswer() {
    onConfirm(corrected);
  }

  return (
    <section className="checkin-review">
      <h2>{title}</h2>
      {editing ? (
        <>
          <label htmlFor="answer-correction">{copy.correctionLabel}</label>
          <textarea
            id="answer-correction"
            rows={3}
            value={corrected}
            onChange={(event) => setCorrected(event.target.value)}
          />
          <div className="checkin-actions">
            <button className="checkin-secondary" onClick={() => setEditing(false)}>
              {copy.cancel}
            </button>
            <button className="checkin-primary" onClick={() => setEditing(false)}>
              {copy.save}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="checkin-heard">{corrected || copy.emptyAnswer}</p>
          <div className="checkin-actions">
            <button className="checkin-secondary" onClick={onRetry}>
              {copy.retry}
            </button>
            <button className="checkin-secondary" onClick={() => setEditing(true)}>
              {copy.fix}
            </button>
            <button className="checkin-primary" onClick={acceptAnswer}>
              {copy.next}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function CheckinController({ residentId, residentName }) {
  const [wordSet, setWordSet] = useState(null);
  const [category, setCategory] = useState(null);
  const [stage, setStage] = useState("loading");
  const [weekOptions, setWeekOptions] = useState([]);
  const [orientationCorrect, setOrientationCorrect] = useState(null);
  const [fluencyWords, setFluencyWords] = useState([]);
  const [freeRecallTranscript, setFreeRecallTranscript] = useState("");
  const [pictureOptions, setPictureOptions] = useState([]);
  const [selectedPictures, setSelectedPictures] = useState([]);
  const [tapTimes, setTapTimes] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLearningWords, setShowLearningWords] = useState(true);
  const keyterms = useMemo(
    () => (category ? category.category.split(/\s+/) : []),
    [category]
  );
  const { finalText, interim, listening, start, stop } = useDeepgramSTT(keyterms);
  const listeningRef = useRef(false);
  const stopRef = useRef(stop);
  const lastTapAt = useRef(0);
  const words = useMemo(
    () => (wordSet ? [wordSet.word_1, wordSet.word_2, wordSet.word_3] : []),
    [wordSet]
  );

  useEffect(() => {
    let active = true;
    async function loadToday() {
      try {
        const [todayWords, todayCategory] = await Promise.all([
          getDailyWordSet(residentId),
          getDailyFluencyCategory(residentId),
        ]);
        if (!active) return;
        setWordSet(todayWords);
        setCategory(todayCategory);
        setWeekOptions(shuffledWeekdays());
        setPictureOptions(buildPictureOptions([
          todayWords.word_1,
          todayWords.word_2,
          todayWords.word_3,
        ]));
        setStage("learning");
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Today's check-in could not load.");
          setStage("error");
        }
      }
    }
    loadToday();
    return () => {
      active = false;
    };
  }, [residentId]);

  useEffect(() => {
    listeningRef.current = listening;
    stopRef.current = stop;
  }, [listening, stop]);

  useEffect(() => () => {
    if (listeningRef.current) stopRef.current();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (stage !== "learning" || words.length !== 3) return;
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(words.join(", "));
    utterance.rate = 0.82;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    const timeout = window.setTimeout(() => setShowLearningWords(false), 7000);
    return () => window.clearTimeout(timeout);
  }, [stage, words]);

  useEffect(() => {
    if (!listening || stage !== "fluency" || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft === 1) {
        stop();
        setSecondsLeft(0);
        setStage("fluency-review");
      } else {
        setSecondsLeft(secondsLeft - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [listening, secondsLeft, stage, stop]);

  const beginListening = useCallback(async (forFluency) => {
    setError("");
    if (forFluency) setSecondsLeft(30);
    try {
      await start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The microphone could not start.");
    }
  }, [start]);

  function stopAndReview(nextStage) {
    if (listening) stop();
    setStage(nextStage);
  }

  async function finishCheckin() {
    setSubmitting(true);
    setError("");
    try {
      const validFluencyCount = await countValidFluencyWords(
        category.id,
        fluencyWords
      );
      const freeRecallScore = scoreFreeRecall(
        freeRecallTranscript,
        words
      );
      const responseTime =
        tapTimes.length > 0
          ? tapTimes.reduce((total, time) => total + time, 0) / tapTimes.length
          : 0;
      await submitCheckin({
        residentId,
        mode: "self",
        freeRecallScore,
        recognitionScore: selectedPictures.filter((index) =>
          words.some((word) => word.trim().toLowerCase() === pictureOptions[index])
        ).length,
        orientationCorrect: orientationCorrect === true,
        fluencyCount: validFluencyCount,
        fluencyWords,
        categoryId: category.id,
        avgResponseTime: responseTime,
      });
      setStage("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The check-in could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  function recordPictureTap(index, event) {
    const now = event.timeStamp;
    if (selectedPictures.includes(index)) {
      setSelectedPictures((current) => current.filter((item) => item !== index));
      return;
    }
    const elapsedSeconds = (now - lastTapAt.current) / 1000;
    setTapTimes((current) => [...current, elapsedSeconds]);
    lastTapAt.current = now;
    setSelectedPictures((current) => [...current, index]);
  }

  if (stage === "loading") {
    return <main className="checkin-screen"><p>Getting today&apos;s check-in ready...</p><Logo variant="mark" className="checkin-logo" /></main>;
  }
  if (stage === "error") {
    return <main className="checkin-screen"><p className="checkin-error" role="alert">{error}</p><Logo variant="mark" className="checkin-logo" /></main>;
  }
  if (stage === "done") {
    return (
      <main className="checkin-screen checkin-done">
        <div className="checkin-card">
          <p className="checkin-step">ALL DONE</p>
          <h1>Nice work!</h1>
          <p>See you tomorrow, {residentName}.</p>
        </div>
        <Logo variant="mark" className="checkin-logo" />
      </main>
    );
  }

  const taskId = stage.startsWith("fluency") ? "fluency" :
    stage.startsWith("recall") ? "recall" :
      stage === "learning" || stage === "orientation" ? stage : "recognition";
  const taskNumber = CHECKIN_TASK_ORDER.indexOf(taskId) + 1;
  const activeText = finalText || interim;
  const prompt =
    stage === "learning" ? CHECKIN_QUESTIONS.learning.prompt :
      stage === "orientation" ? CHECKIN_QUESTIONS.orientation.prompt :
        stage.startsWith("fluency") ? CHECKIN_QUESTIONS.fluency.prompt(category.category) :
          stage.startsWith("recall") ? CHECKIN_QUESTIONS.recall.prompt :
            CHECKIN_QUESTIONS.recognition.prompt;

  function speakPrompt() {
    if (!("speechSynthesis" in window)) {
      setError("Audio playback isn't supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(stage === "learning" ? `${prompt} ${words.join(", ")}` : prompt)
    );
  }

  return (
    <main className="checkin-screen">
      <header className="checkin-header">
        <span>Step {taskNumber} of 5</span>
        <div className="checkin-progress" aria-label={`Step ${taskNumber} of 5`}>
          <span style={{ width: `${taskNumber * 20}%` }} />
        </div>
        <button
          className="checkin-speaker"
          type="button"
          onClick={speakPrompt}
          aria-label="Read question aloud"
        >
          <Image src="/assets/qspeaker.png" alt="" width={28} height={28} />
        </button>
      </header>

      {stage === "learning" && (
        <section className="checkin-card">
          <p className="checkin-step">{CHECKIN_QUESTIONS.learning.instruction}</p>
          <h1>{CHECKIN_QUESTIONS.learning.prompt}</h1>
          {showLearningWords && <p className="checkin-word-list">{words.join(" · ")}</p>}
          <button
            className="checkin-speaker"
            type="button"
            aria-label="Hear the words again"
            onClick={() => {
              window.speechSynthesis?.cancel();
              window.speechSynthesis?.speak(new SpeechSynthesisUtterance(words.join(", ")));
            }}
          >
            <Image src="/assets/qspeaker.png" alt="" width={28} height={28} />
          </button>
          <button className="checkin-primary" onClick={() => setStage("orientation")}>
            {CHECKIN_QUESTIONS.learning.button}
          </button>
        </section>
      )}

      {stage === "orientation" && (
        <section className="checkin-card">
          <p className="checkin-step">{CHECKIN_QUESTIONS.orientation.instruction}</p>
          <h1>{CHECKIN_QUESTIONS.orientation.prompt}</h1>
          <div className="checkin-weekdays">
            {weekOptions.map((day) => (
              <button
                key={day}
                className="checkin-choice"
                onClick={() => {
                  setOrientationCorrect(day === weekDays[new Date().getDay()]);
                  setStage("fluency");
                }}
              >
                {day}
              </button>
            ))}
          </div>
        </section>
      )}

      {stage === "fluency" && (
        <section className="checkin-card">
          <p className="checkin-step">{CHECKIN_QUESTIONS.fluency.instruction}</p>
          <h1>{CHECKIN_QUESTIONS.fluency.prompt(category.category)}</h1>
          <p className="checkin-timer" aria-live="polite">{secondsLeft}s</p>
          <p className="checkin-heard">{activeText || CHECKIN_QUESTIONS.feedback.waiting}</p>
          <button
            className="checkin-primary checkin-mic"
            onClick={() => listening ? stopAndReview("fluency-review") : beginListening(true)}
          >
            {listening ? CHECKIN_QUESTIONS.fluency.stopButton : CHECKIN_QUESTIONS.fluency.answerButton}
            <Image src="/assets/mic.png" alt="" width={22} height={22} />
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}

      {stage === "fluency-review" && (
        <section className="checkin-card">
          <ReviewAnswer
            title={CHECKIN_QUESTIONS.fluencyReview.title}
            text={activeText}
            copy={CHECKIN_QUESTIONS.fluencyReview}
            onRetry={() => {
              setSecondsLeft(30);
              setStage("fluency");
            }}
            onConfirm={(corrected) => {
              setFluencyWords(wordsFromTranscript(corrected));
              setStage("recall");
            }}
          />
        </section>
      )}

      {stage === "recall" && (
        <section className="checkin-card">
          <p className="checkin-step">{CHECKIN_QUESTIONS.recall.instruction}</p>
          <h1>{CHECKIN_QUESTIONS.recall.prompt}</h1>
          <p className="checkin-heard">{activeText || CHECKIN_QUESTIONS.feedback.waiting}</p>
          <button
            className="checkin-primary checkin-mic"
            onClick={() => listening ? stopAndReview("recall-review") : beginListening(false)}
          >
            {listening ? CHECKIN_QUESTIONS.recall.stopButton : CHECKIN_QUESTIONS.recall.answerButton}
            <Image src="/assets/mic.png" alt="" width={22} height={22} />
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}

      {stage === "recall-review" && (
        <section className="checkin-card">
          <ReviewAnswer
            title={CHECKIN_QUESTIONS.recallReview.title}
            text={activeText}
            copy={CHECKIN_QUESTIONS.recallReview}
            onRetry={() => setStage("recall")}
            onConfirm={(transcript) => {
              setFreeRecallTranscript(transcript);
              lastTapAt.current = performance.now();
              setTapTimes([]);
              setSelectedPictures([]);
              setStage("recognition");
            }}
          />
        </section>
      )}

      {stage === "recognition" && (
        <section className="checkin-card">
          <p className="checkin-step">{CHECKIN_QUESTIONS.recognition.instruction}</p>
          <h1>{CHECKIN_QUESTIONS.recognition.prompt}</h1>
          <div className="picture-grid">
            {pictureOptions.map((option, index) => (
              <button
                key={`${option}-${index}`}
                className={`picture-tile ${selectedPictures.includes(index) ? "selected" : ""}`}
                type="button"
                aria-label={`Picture ${index + 1}`}
                aria-pressed={selectedPictures.includes(index)}
                onClick={(event) => recordPictureTap(index, event)}
              >
                <Image src={getIconSrc(option)} alt="" width={100} height={100} unoptimized />
              </button>
            ))}
          </div>
          <button
            className="checkin-primary checkin-full-button"
            disabled={submitting}
            onClick={finishCheckin}
          >
            {submitting ? "Finishing..." : CHECKIN_QUESTIONS.recognition.button}
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}
      <Logo variant="mark" className="checkin-logo" />
    </main>
  );
}
