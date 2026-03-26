import { useRef } from "react";
import { useFloatingCardPosition } from "../lib/floatingCard";

export default function ReaderOverlayShell({
  position,
  onClose,
  mobileSheet = false,
  pinned = false,
  desktopWidth = 360,
  desktopMargin = 12,
  pinnedTop = 24,
  pinnedRight = 24,
  pinnedBottom = 88,
  maxMobileHeight = "min(74vh, 620px)",
  style = {},
  deps = [],
  className = "",
  children,
}) {
  const cardRef = useRef(null);
  const pinnedDesktop = pinned && !mobileSheet;
  const floatingStyle = useFloatingCardPosition(
    cardRef,
    position || { x: 0, y: 0 },
    desktopWidth,
    deps,
    desktopMargin
  );

  const panelStyle = mobileSheet
    ? {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 200,
        maxHeight: maxMobileHeight,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        boxShadow: "0 -10px 36px var(--shadow)",
        padding: "12px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
      }
    : pinnedDesktop
      ? {
          position: "fixed",
          top: pinnedTop,
          right: pinnedRight,
          bottom: pinnedBottom,
          zIndex: 160,
          width: `min(${desktopWidth}px, calc(100vw - 24px))`,
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 18px 48px var(--shadow)",
          padding: 16,
        }
    : {
        position: "fixed",
        top: floatingStyle.top,
        left: floatingStyle.left,
        zIndex: 200,
        width: `min(${desktopWidth}px, calc(100vw - 24px))`,
        maxHeight: floatingStyle.maxHeight,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 12px 40px var(--shadow)",
        padding: 16,
      };

  return (
    <>
      {!pinnedDesktop && (
        <div aria-hidden="true" onClick={onClose} style={{ position:"fixed", inset:0, zIndex:199 }} />
      )}
      <div ref={cardRef} className={className} style={{ ...panelStyle, ...style }}>
        {mobileSheet && (
          <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
            <div style={{ width:42, height:4, borderRadius:999, background:"var(--border)" }} />
          </div>
        )}
        {children}
      </div>
    </>
  );
}
