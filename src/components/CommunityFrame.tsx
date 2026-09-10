import { useEffect, useRef, type ReactNode } from "react";

// Resize the existing room, never remount it when the phone keyboard opens.
export function CommunityFrame({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (embedded) return;
    const viewport = window.visualViewport;
    let pending = 0;
    const measure = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        frame.current?.style.setProperty(
          "--community-viewport-height",
          `${viewport?.height ?? window.innerHeight}px`,
        );
        frame.current?.style.setProperty(
          "--community-viewport-top",
          `${viewport?.offsetTop ?? 0}px`,
        );
      });
    };
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(pending);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [embedded]);
  return (
    <div
      ref={frame}
      className={
        embedded
          ? "community-embedded space-y-4"
          : "community-page container-content max-w-5xl py-3 sm:py-5"
      }
    >
      {children}
    </div>
  );
}
