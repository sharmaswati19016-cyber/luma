"use client";

import Image from "next/image";
import Logo from "../shared/Logo";
import { startTransition, useState, useEffect } from "react";
import { getGreeting } from "../../../lib/greeting";
import "./Home.css";

// Images live in public/assets/ and are served from /assets/...
const sun = "/assets/sun.png";
const moon = "/assets/moon.png";
const homespeaker = "/assets/homespeaker.png";

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
        `${label}, ${residentName}. Today is ${formattedDate}.`
      );
      utterance.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="home-screen">
      <header className="home-top">
        <Image src={icon} alt="" className="home-icon" width={56} height={56} />

        <div className="home-greeting-block">
          <button
            className="home-speaker-btn"
            onClick={handleSpeak}
            aria-label="Read greeting aloud"
          >
            <Image
              src={homespeaker}
              alt=""
              className="home-speaker-icon"
              width={28}
              height={28}
            />
            <span className="home-greeting-label">{label}</span>
          </button>

          <h1 className="home-name">{residentName}</h1>
          <p className="home-date">{formattedDate}</p>
        </div>
      </header>

      <div className="home-bottom">
        <button className="home-start-btn" onClick={onStart}>
          Start Today&apos;s Check-in
        </button>
        <Logo variant="mark" className="resident-mark" />
        <button className="home-unpair-btn" onClick={onUnpair}>
          This isn&apos;t my device
        </button>
      </div>
    </div>
  );
}