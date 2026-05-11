import { useEffect, useRef } from 'react';

export default function Tooltip({ tooltip }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !tooltip) return;
    const el = ref.current;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();

    let x = tooltip.x + 14;
    let y = tooltip.y - 10;

    if (x + rect.width > innerWidth - 10) x = tooltip.x - rect.width - 14;
    if (y + rect.height > innerHeight - 10) y = tooltip.y - rect.height - 10;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [tooltip]);

  if (!tooltip) return null;

  return (
    <div
      ref={ref}
      className="tooltip"
      style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
    >
      {tooltip.content}
    </div>
  );
}
