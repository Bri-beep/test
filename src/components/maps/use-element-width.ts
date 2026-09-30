import { useEffect, useRef, useState, type RefObject } from "react";

export function useElementWidth<T extends HTMLElement>(
  defaultWidth: number,
): [RefObject<T | null>, number] {
  const elementRef = useRef<T>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }

    const updateWidth = (nextWidth: number) => {
      if (nextWidth > 0) {
        setWidth(Math.round(nextWidth));
      }
    };

    updateWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [elementRef, width];
}
