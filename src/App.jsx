import React, { useState } from "react";
import HomeScreen from "./components/home/HomeScreen";
import "./App.css";

export default function App() {
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    setStarted(true);
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