"use client";

import Image from "next/image";
import Logo from "../shared/Logo";
import { startTransition, useState, useEffect } from "react";
import { getGreeting } from "../../../lib/greeting";
import "./Home.css";

// Images live in public/assets/ and are served from /assets/...
const sun = "/assets/sun.png";
const moon = "/assets/moon.png";

/**
 * HomeScreen
 * One reusable home screen. Greeting text, icon (sun/moon) and audio
 * all change automatically based on the device's real current time —
 * no separate "morning" / "evening" screens needed.
 *
 * Props:
 *  - residentName (string)  e.g. "Kamla Rao"
 *  - onStart (function)     called when "Start Today's Check-in" is tapped
 */

export default function HomeScreen({ residentName, onStart, onUnpair }) {
  // The time is read in the browser only (after the page loads),
  // so the server's clock never decides the greeting.
  const [now, setNow] = useState(null);

  useEffect(() => {
    startTransition(() => setNow(new Date()));
  }, []);

  if (!now) return null;

  const { label, icon: iconName, dateText: formattedDate } = getGreeting(now);
  const icon = iconName === "sun" ? sun : moon;

  const handleSpeak = () => {
    // Reads the greeting aloud — reuses the same speaker icon/position
    // pattern used across every resident screen.
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(
        `${label}${residentName ? `, ${residentName}` : ""}. Today is ${formattedDate}.`
      );
      utterance.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="home-screen">
      <header className="home-top">
        <Image src={icon} alt="" className="home-icon" width={100} height={100} />

        <div className="home-greeting-block">
          <button
            className="home-speaker-btn"
            onClick={handleSpeak}
            aria-label="Read aloud"
          >
            <span className="home-speaker-circle">
              <svg className="home-speaker-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </span>
            <span className="home-greeting-label">{label}</span>
          </button>

          <p className="home-date">{formattedDate}</p>
        </div>
      </header>

      <div className="home-bottom">
        <button className="home-start-btn" onClick={onStart}>
          Start Today&apos;s Check-in
        </button>
        <button className="home-unpair-btn" onClick={onUnpair}>
          This isn&apos;t my device
        </button>
        <Logo variant="mark" className="resident-mark" />
      </div>
    </div>
  );
}