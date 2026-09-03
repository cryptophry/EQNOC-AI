import React, { useRef, useState } from 'react';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  controls?: string;
  onChange: (next: number) => void;
};

const STEP = 16;
const STEP_LARGE = 32;

/**
 * Vertical drag handle between desktop columns. Hidden below lg — the stacked
 * / drawer layout does not resize. Dragging right shrinks `value` (the column
 * to the right of the handle); left grows it. Arrow keys do the same.
 */
const ColumnSplitter: React.FC<Props> = ({ label, value, min, max, controls, onChange }) => {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const [active, setActive] = useState(false);

  const commit = (next: number) => {
    const clamped = Math.round(Math.min(max, Math.max(min, next)));
    if (clamped !== value) onChange(clamped);
  };

  const endDrag = (el: HTMLElement, pointerId: number) => {
    drag.current = null;
    setActive(false);
    document.body.classList.remove('col-resizing');
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuetext={`${Math.round(value)} pixels`}
      aria-controls={controls}
      title={label}
      tabIndex={0}
      className={`col-splitter ${active ? 'is-dragging' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        drag.current = { x: e.clientX, value };
        setActive(true);
        document.body.classList.add('col-resizing');
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        commit(drag.current.value - (e.clientX - drag.current.x));
      }}
      onPointerUp={(e) => endDrag(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => endDrag(e.currentTarget, e.pointerId)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? STEP_LARGE : STEP;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          commit(value + step);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          commit(value - step);
        } else if (e.key === 'Home') {
          e.preventDefault();
          commit(max);
        } else if (e.key === 'End') {
          e.preventDefault();
          commit(min);
        }
      }}
    />
  );
};

export default ColumnSplitter;
