"use client";

import { useEffect, useState } from "react";

export default function CountdownTimer({
  targetDate,
  emptyMessage = "No competition date set yet.",
  pastMessage = "Competition date has passed!",
  variant = "neutral",
}) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetDate) return;

    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, past: true });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        past: false,
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) {
    return <p className="text-slate-500 text-sm">{emptyMessage}</p>;
  }

  if (!timeLeft) return null;

  const pad = (n) => String(n).padStart(2, "0");
  const boxClasses =
    variant === "brand"
      ? "bg-navy text-white rounded-lg px-3 sm:px-4 py-2 sm:py-3 min-w-[60px] sm:min-w-[72px]"
      : "bg-gray-900 text-white rounded-lg px-3 sm:px-4 py-2 sm:py-3 min-w-[60px] sm:min-w-[72px]";
  const labelClasses =
    variant === "brand" ? "text-xs text-maize/90 mt-1" : "text-xs text-gray-400 mt-1";

  if (timeLeft.past) {
    return <p className="text-red-600 text-lg font-semibold">{pastMessage}</p>;
  }

  return (
    <div className="flex gap-2 sm:gap-4 text-center flex-wrap justify-center">
      {[
        { label: "Days", value: timeLeft.days },
        { label: "Hours", value: timeLeft.hours },
        { label: "Minutes", value: timeLeft.minutes },
        { label: "Seconds", value: timeLeft.seconds },
      ].map(({ label, value }) => (
        <div key={label} className={boxClasses}>
          <div className="text-xl sm:text-2xl font-mono font-bold">{pad(value)}</div>
          <div className={labelClasses}>{label}</div>
        </div>
      ))}
    </div>
  );
}
