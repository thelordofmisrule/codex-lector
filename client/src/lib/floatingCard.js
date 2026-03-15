import { useLayoutEffect, useState } from "react";

const VIEWPORT_MARGIN = 12;

function getViewportWidth() {
  return typeof window === "undefined" ? 0 : window.innerWidth;
}

function getViewportHeight() {
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function computeFloatingCardPosition(anchor, node, preferredWidth, offset = 12) {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const safeWidth = Math.max(220, Math.min(preferredWidth, viewportWidth - VIEWPORT_MARGIN * 2));
  const rect = node?.getBoundingClientRect();
  const measuredWidth = rect?.width || safeWidth;
  const measuredHeight = rect?.height || 0;
  const left = clamp(
    anchor.x - (measuredWidth / 2),
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - measuredWidth - VIEWPORT_MARGIN)
  );

  const roomBelow = Math.max(0, viewportHeight - anchor.y - VIEWPORT_MARGIN);
  const roomAbove = Math.max(0, anchor.y - VIEWPORT_MARGIN);

  let top = anchor.y + offset;
  if (measuredHeight) {
    const shouldFlipUp = roomBelow < measuredHeight && roomAbove > roomBelow;
    if (shouldFlipUp) {
      top = anchor.y - measuredHeight - offset;
    }
    top = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - measuredHeight - VIEWPORT_MARGIN));
  } else {
    top = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN * 2));
  }

  const opensBelow = top >= anchor.y;
  const availableHeight = opensBelow
    ? Math.max(160, viewportHeight - top - VIEWPORT_MARGIN)
    : Math.max(160, anchor.y - offset - VIEWPORT_MARGIN);

  return {
    left,
    top,
    maxHeight: availableHeight,
  };
}

export function useFloatingCardPosition(ref, anchor, preferredWidth, deps = [], offset = 12) {
  const [style, setStyle] = useState(() => computeFloatingCardPosition(anchor, null, preferredWidth, offset));

  useLayoutEffect(() => {
    const update = () => {
      setStyle(computeFloatingCardPosition(anchor, ref.current, preferredWidth, offset));
    };

    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [anchor.x, anchor.y, offset, preferredWidth, ref, ...deps]);

  return style;
}
