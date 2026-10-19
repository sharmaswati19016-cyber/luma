"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countValidFluencyWords,
  getDailyFluencyCategory,
  getDailyWordSet,
  submitCheckin,
} from "../../../lib/api";
import { buildPictureOptions } from "../../../lib/wordIcons";
import { useDeepgramSTT } from "../../../hooks/useDeepgramSTT";
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

function ReviewAnswer({ title, text, onConfirm }) {
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(text);

  function acceptAnswer(event) {
    onConfirm(editing ? corrected : text, event);
  }

  return (
    <section className="checkin-review">
      <h2>{title}</h2>
      {editing ? (
        <>
          <label htmlFor="answer-correction">Correct what you heard</label>
          <textarea
            id="answer-correction"
            rows={3}
            value={corrected}
            onChange={(event) => setCorrected(event.target.value)}
          />
          <div className="checkin-actions">
            <button className="checkin-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="checkin-primary" onClick={acceptAnswer}>
              Use correction
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="checkin-heard">{text || "Nothing was heard yet."}</p>
          <div className="checkin-actions">
            <button className="checkin-secondary" onClick={() => setEditing(true)}>
              Fix it
            </button>
            <button className="checkin-primary" onClick={acceptAnswer}>
              Yes
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
        p_resident_id: residentId,
        p_recall_score: freeRecallScore,
        p_orientation_correct: orientationCorrect === true,
        p_fluency_count: validFluencyCount,
        p_avg_response_time: responseTime,
        p_mode: "self",
        p_free_recall_score: freeRecallScore,
        p_recognition_score: selectedPictures.filter((index) => pictureOptions[index]?.isTarget).length,
        p_category_id: category.id,
        p_fluency_words: fluencyWords,
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
    return <main className="checkin-screen"><p>Getting today&apos;s check-in ready...</p></main>;
  }
  if (stage === "error") {
    return <main className="checkin-screen"><p className="checkin-error" role="alert">{error}</p></main>;
  }
  if (stage === "done") {
    return (
      <main className="checkin-screen checkin-done">
        <div className="checkin-card">
          <p className="checkin-step">ALL DONE</p>
          <h1>Nice work!</h1>
          <p>See you tomorrow, {residentName}.</p>
        </div>
      </main>
    );
  }

  const taskNumber =
    stage === "learning" ? 1 :
      stage === "orientation" ? 2 :
        stage.startsWith("fluency") ? 3 :
          stage.startsWith("recall") ? 4 : 5;
  const activeText = finalText || interim;

  return (
    <main className="checkin-screen">
      <header className="checkin-header">
        <span>Step {taskNumber} of 5</span>
        <div className="checkin-progress" aria-label={`Step ${taskNumber} of 5`}>
          <span style={{ width: `${taskNumber * 20}%` }} />
        </div>
      </header>

      {stage === "learning" && (
        <section className="checkin-card">
          <p className="checkin-step">LISTEN AND REMEMBER</p>
          <h1>Remember these three words.</h1>
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
            Continue
          </button>
        </section>
      )}

      {stage === "orientation" && (
        <section className="checkin-card">
          <p className="checkin-step">ORIENTATION</p>
          <h1>Which one is today?</h1>
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
          <p className="checkin-step">FLUENCY</p>
          <h1>Name as many {category.category.toLowerCase()} as you can.</h1>
          <p className="checkin-timer" aria-live="polite">{secondsLeft}s</p>
          <p className="checkin-heard">{activeText || "Tap the microphone when you are ready."}</p>
          <button
            className="checkin-primary checkin-mic"
            onClick={() => listening ? stopAndReview("fluency-review") : beginListening(true)}
          >
            {listening ? "Finish" : "Tap to answer"}
            <Image src="/assets/mic.png" alt="" width={22} height={22} />
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}

      {stage === "fluency-review" && (
        <section className="checkin-card">
          <ReviewAnswer
            title="Is this what you said?"
            text={activeText}
            onConfirm={(corrected) => {
              setFluencyWords(wordsFromTranscript(corrected));
              setStage("recall");
            }}
          />
        </section>
      )}

      {stage === "recall" && (
        <section className="checkin-card">
          <p className="checkin-step">FREE RECALL</p>
          <h1>Now say the three words you heard at the start.</h1>
          <p className="checkin-heard">{activeText || "Tap the microphone when you are ready."}</p>
          <button
            className="checkin-primary checkin-mic"
            onClick={() => listening ? stopAndReview("recall-review") : beginListening(false)}
          >
            {listening ? "Finish" : "Tap to answer"}
            <Image src="/assets/mic.png" alt="" width={22} height={22} />
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}

      {stage === "recall-review" && (
        <section className="checkin-card">
          <ReviewAnswer
            title="Is this what you said?"
            text={activeText}
            onConfirm={(transcript, event) => {
              setFreeRecallTranscript(transcript);
              lastTapAt.current = event.timeStamp;
              setTapTimes([]);
              setSelectedPictures([]);
              setStage("recognition");
            }}
          />
        </section>
      )}

      {stage === "recognition" && (
        <section className="checkin-card">
          <p className="checkin-step">PICTURE RECOGNITION</p>
          <h1>Tap the words from before.</h1>
          <div className="picture-grid">
            {pictureOptions.map((option, index) => (
              <button
                key={`${option.word}-${index}`}
                className={`picture-tile ${selectedPictures.includes(index) ? "selected" : ""}`}
                type="button"
                aria-label={`Picture ${index + 1}`}
                aria-pressed={selectedPictures.includes(index)}
                onClick={(event) => recordPictureTap(index, event)}
              >
                <Image src={option.src} alt="" width={100} height={100} unoptimized />
              </button>
            ))}
          </div>
          <button
            className="checkin-primary checkin-full-button"
            disabled={submitting}
            onClick={finishCheckin}
          >
            {submitting ? "Finishing..." : "Finish"}
          </button>
          {error && <p className="checkin-error" role="alert">{error}</p>}
        </section>
      )}
    </main>
  );
}
