"use client";

import { useEffect, useRef, useState } from "react";

import { cooldownProgress, countdownSummary, pad2, splitRemaining } from "@/lib/votes/vote-copy";

/**
 * The time left before the next vote.
 *
 * The first frame uses the server's clock, so the markup the server sent and the one React hydrates
 * agree. Ticks after that read the visitor's clock shifted by the difference measured on mount: a
 * phone running a few minutes fast must not unlock the form before the server would accept a vote.
 */
export function VoteCountdown({ votedAt, nextVoteAt, initialNow, onElapsed }: { votedAt: string; nextVoteAt: string; initialNow: string; onElapsed?: () => void }) {
  const [now, setNow] = useState(() => Date.parse(initialNow));
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    const target = Date.parse(nextVoteAt);
    const skew = Date.parse(initialNow) - Date.now();
    let done = false;
    const id = window.setInterval(() => {
      const current = Date.now() + skew;
      setNow(current);
      if (!done && current >= target) {
        done = true;
        window.clearInterval(id);
        onElapsedRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [initialNow, nextVoteAt]);

  const remaining = Date.parse(nextVoteAt) - now;
  const { hours, minutes, seconds } = splitRemaining(remaining);
  const progress = cooldownProgress(new Date(votedAt), new Date(nextVoteAt), new Date(now));
  const boxes = [
    { value: pad2(hours), label: "HH" },
    { value: pad2(minutes), label: "MIN" },
    { value: pad2(seconds), label: "SEG" },
  ];

  return (
    <div className="grid gap-4">
      {/* role=timer is polite by nature; the label carries the minute-level summary for screen readers. */}
      <div role="timer" aria-label={`Podrás volver a votar en ${countdownSummary(remaining)}`} className="grid grid-cols-3 gap-2.5">
        {boxes.map((box) => (
          <div key={box.label} className="flex flex-col items-center gap-1 rounded-xl bg-muted/60 px-2 py-3.5 ring-1 ring-foreground/10">
            <span aria-hidden="true" aria-live="off" className="font-mono text-[2rem] font-extrabold leading-none tracking-tight tabular-nums text-foreground">{box.value}</span>
            <span aria-hidden="true" className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{box.label}</span>
          </div>
        ))}
      </div>
      <div
        role="progressbar"
        aria-label="Tiempo transcurrido desde tu voto"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-warning transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
