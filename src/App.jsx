"use client";

import React, { startTransition, useCallback, useEffect, useState } from "react";
import {
  clearResidentId,
  getResidentId,
  getResidentName,
} from "../lib/resident";
import CheckinController from "./components/checkin/CheckinController";
import HomeScreen from "./components/home/HomeScreen";
import PairingScreen from "./components/pairing/PairingScreen";
import "./App.css";

export default function App() {
  const [residentId, setResidentId] = useState(null);
  const [residentName, setResidentName] = useState("");
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setResidentId(getResidentId());
      setResidentName(getResidentName() || "");
      setReady(true);
    });
  }, []);

  const handleStart = () => {
    setStarted(true);
  };

  const handleReturnHome = useCallback(() => {
    setStarted(false);
  }, []);

  const handleUnpair = () => {
    clearResidentId();
    setResidentId(null);
    setResidentName("");
    setStarted(false);
  };

  return (
    <div className="app-root">
      {!ready ? null : !residentId ? (
        <PairingScreen
          onPaired={(id) => {
            setResidentId(id);
            setResidentName(getResidentName() || "");
          }}
        />
      ) : !started ? (
        <HomeScreen
          residentName={residentName}
          onStart={handleStart}
          onUnpair={handleUnpair}
        />
      ) : (
        <CheckinController
          residentId={residentId}
          residentName={residentName}
          onReturnHome={handleReturnHome}
        />
      )}
    </div>
  );
}