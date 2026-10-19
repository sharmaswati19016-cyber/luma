import React, { startTransition, useEffect, useState } from "react";
import { getResidentId, getResidentName } from "../lib/resident";
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

  return (
    <div className="app-root">
      {!ready ? null : !residentId ? (
        <PairingScreen
          onPaired={(id, name) => {
            setResidentId(id);
            setResidentName(name);
          }}
        />
      ) : !started ? (
        <HomeScreen residentName={residentName} onStart={handleStart} />
      ) : (
        <CheckinController
          residentId={residentId}
          residentName={residentName}
        />
      )}
    </div>
  );
}