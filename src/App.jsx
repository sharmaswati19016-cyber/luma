import React, { useState } from "react";
import HomeScreen from "./components/home/Homescreen";
import "./App.css";

/**
 * App
 * Root component. For now it just renders the resident Home screen
 * with a sample resident, and logs when "Start" is tapped — this is
 * the hook point where the check-in flow (word task, orientation,
 * fluency, recall, done) will get wired in next.
 *
 * In the real app, residentName will come from whichever resident
 * the device is paired to (or whichever resident staff selected on
 * the shared-tablet picker screen) — not hardcoded like below.
 */
export default function App() {
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    setStarted(true);
    // TODO: navigate to the first check-in screen (word display task)
    console.log("Check-in started");
  };

  return (
    <div className="app-root">
      {!started ? (
        <HomeScreen residentName="Kamla Rao" onStart={handleStart} />
      ) : (
        <div className="app-placeholder">
          <p>Next screen goes here (word display task)</p>
        </div>
      )}
    </div>
  );
}