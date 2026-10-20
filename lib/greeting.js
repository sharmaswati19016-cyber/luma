// Before this hour = morning screen, after = evening screen. Change if you want.
const EVENING_STARTS_AT = 12;

function withOrdinal(day) {
  if (day >= 11 && day <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

export function getGreeting(now = new Date()) {
  const isMorning = now.getHours() < EVENING_STARTS_AT;
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const month = now.toLocaleDateString("en-GB", { month: "long" });

  return {
    label: isMorning ? "GOOD MORNING" : "GOOD EVENING",
    icon: isMorning ? "sun" : "moon",
    dateText: `${weekday}, ${withOrdinal(now.getDate())} ${month}`,
  };
}