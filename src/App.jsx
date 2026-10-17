import React, { startTransition, useEffect, useState } from "react";
import { getResident } from "../lib/residentSession";
import HomeScreen from "./components/home/HomeScreen";
import QuestionScreen from "./components/qna/Questionscreen";
import "./App.css";

export default function App() {
  const [started, setStarted] = useState(false);
  const [residentName, setResidentName] = useState("Kamla Rao");
  const [questionNumber, setQuestionNumber] = useState(1);

  useEffect(() => {
    const resident = getResident();
    if (resident?.name) {
      startTransition(() => setResidentName(resident.name));
    }
  }, []);

  const handleStart = () => {
    setQuestionNumber(1);
    setStarted(true);
  };

  return (
    <div className="app-root">
      {!started ? (
        <HomeScreen residentName={residentName} onStart={handleStart} />
      ) : (
        <QuestionScreen
          question={`Q. ${questionNumber}`}
          onNext={() => setQuestionNumber((current) => current + 1)}
        />
      )}
    </div>
  );
}