import { useEffect, useRef } from "react";
import { LoadingIcon } from "@/components/LoadingIcon";

type Props = {
  onVisible: () => void;
  disabled?: boolean;
  label?: string;
  /** Scroll parent. Defaults to the viewport. */
  root?: Element | null;
};

/** Marker at the end of a list: when it enters view, ask for the next page. */
export function InfiniteSentinel({ onVisible, disabled, label = "Loading more", root }: Props) {
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
      <LoadingIcon label={label} />
    </div>
  );
}
