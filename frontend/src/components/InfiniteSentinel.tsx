import { useEffect, useRef } from "react";

type Props = {
  onVisible: () => void;
  disabled?: boolean;
  label?: string;
  /** Scroll parent. Defaults to the viewport. */
  root?: Element | null;
};

/** Invisible marker: when it enters the viewport, ask for the next page. */
export function InfiniteSentinel({ onVisible, disabled, label = "Loading more…", root }: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (disabled) return;
    const node = nodeRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisibleRef.current();
      },
      { root: root ?? null, rootMargin: "240px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, root]);

  if (disabled) return null;
  return (
    <div ref={nodeRef} className="flex justify-center py-3">
      <span className="text-body3-default text-tertiary">{label}</span>
    </div>
  );
}
