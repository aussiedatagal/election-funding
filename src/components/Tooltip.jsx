import { useLayoutEffect, useRef } from 'react';

const MARGIN = 14;

function clampTooltipPosition(el, clientX, clientY) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = el.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  let x = clientX + 14;
  let y = clientY + 12;

  if (x + w > vw - MARGIN) x = clientX - w - 14;
  if (y + h > vh - MARGIN) y = clientY - h - 14;

  x = Math.max(MARGIN, Math.min(x, vw - w - MARGIN));
  y = Math.max(MARGIN, Math.min(y, vh - h - MARGIN));

  return { x, y };
}

export default function Tooltip({ tooltip, onDismiss }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!ref.current || !tooltip) return;
    const el = ref.current;
    const { x, y } = clampTooltipPosition(el, tooltip.x, tooltip.y);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = 'visible';
  }, [tooltip]);

  if (!tooltip) return null;

  const pinned = Boolean(tooltip.pinned);

  return (
    <div
      ref={ref}
      className={`tooltip${pinned ? ' tooltip--pinned' : ''}`}
      style={{
        left: 0,
        top: 0,
        visibility: 'hidden',
        pointerEvents: pinned ? 'auto' : 'none',
      }}
    >
      {pinned && (
        <button
          type="button"
          className="tooltip-close"
          aria-label="Close details"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
        >
          ×
        </button>
      )}
      <div className="tooltip-inner">
        {tooltip.content}
        {pinned && (
          <p className="tt-dismiss-hint">Press Escape, tap the × above, or click the chart (not a node) to deselect.</p>
        )}
      </div>
    </div>
  );
}
