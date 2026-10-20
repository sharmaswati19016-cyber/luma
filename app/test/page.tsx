"use client";

import { useState } from "react";
import { pairDevice, getDailyWordSet, getDailyFluencyCategory } from "../../lib/api";

export default function TestPage() {
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("Enter a pairing code and press the button.");

  async function runTest() {
    try {
      const residentId = await pairDevice(code);
      const words = await getDailyWordSet(residentId);
      const category = await getDailyFluencyCategory(residentId);
      setOutput(JSON.stringify({ residentId, words, category }, null, 2));
    } catch (e) {
      setOutput("Error: " + (e as Error).message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Supabase connection test</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="6-digit pairing code"
        style={{ border: "1px solid #999", padding: 8, marginRight: 8 }}
      />
      <button onClick={runTest} style={{ padding: 8 }}>Test</button>
      <pre style={{ marginTop: 16 }}>{output}</pre>
    </div>
  );
}