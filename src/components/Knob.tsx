"use client";

import { useCallback, useRef } from "react";

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Display formatter for the value readout. */
  format?: (v: number) => string;
  /** Logarithmic mapping (good for frequency). */
  logarithmic?: boolean;
  onChange: (value: number) => void;
}

const ANGLE_RANGE = 270; // degrees of travel
const ANGLE_MIN = -135;

/** A rotary knob driven by vertical dragging. Pointer up = increase. */
export function Knob({
  label,
  value,
  min,
  max,
  format,
  logarithmic = false,
  onChange,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startNorm: number } | null>(null);

  const toNorm = useCallback(
    (v: number) => {
      if (logarithmic) {
        const lmin = Math.log(min);
        const lmax = Math.log(max);
        return (Math.log(Math.max(min, v)) - lmin) / (lmax - lmin);
      }
      return (v - min) / (max - min);
    },
    [min, max, logarithmic],
  );

  const fromNorm = useCallback(
    (n: number) => {
      const c = Math.min(1, Math.max(0, n));
      if (logarithmic) {
        const lmin = Math.log(min);
        const lmax = Math.log(max);
        return Math.exp(lmin + c * (lmax - lmin));
      }
      return min + c * (max - min);
    },
    [min, max, logarithmic],
  );

  const norm = toNorm(value);
  const angle = ANGLE_MIN + norm * ANGLE_RANGE;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startNorm: norm };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.startY - e.clientY; // up = positive
    const next = drag.startNorm + dy / 150; // 150px = full range
    onChange(fromNorm(next));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const readout = format ? format(value) : value.toFixed(2);

  return (
    <div className="flex w-20 flex-col items-center gap-1 select-none">
      <svg
        viewBox="0 0 48 48"
        className="h-14 w-14 cursor-ns-resize touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <circle cx="24" cy="24" r="20" className="fill-neutral-800 stroke-neutral-600" strokeWidth="2" />
        <line
          x1="24"
          y1="24"
          x2="24"
          y2="8"
          className="stroke-emerald-400"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${angle} 24 24)`}
        />
      </svg>
      <span className="text-xs font-medium text-neutral-200">{label}</span>
      <span className="text-[10px] tabular-nums text-neutral-500">{readout}</span>
    </div>
  );
}
