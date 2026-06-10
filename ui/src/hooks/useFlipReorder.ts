import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Animates items in a list when their order changes, using the FLIP technique
 * (First, Last, Invert, Play). Items are identified by a `data-flip-id`
 * attribute on their DOM nodes. On every `items` reference change, the hook
 * measures the new positions, computes the delta from the previously captured
 * positions, and animates the displacement with a CSS transform transition.
 *
 * Caller flow:
 *   1. Render `<div ref={containerRef}>{items.map(it => <div data-flip-id={it.id} />)}</div>`
 *   2. Before mutating `items`, call `capturePositions()` to snapshot the
 *      current top of each `data-flip-id` element.
 *   3. Mutate `items` (e.g. via setState). The hook will run on the next
 *      commit, apply the FLIP transform, and animate back to the natural
 *      position over `durationMs`.
 *
 * If `items` does not change by reference, no animation is triggered. Boundary
 * cases that early-return the same array (e.g. move at the end of a list) are
 * therefore naturally a no-op.
 */
export function useFlipReorder<T>(
  items: T[],
  durationMs = 180
): {
  containerRef: RefObject<HTMLDivElement | null>;
  capturePositions: () => void;
  skipNextFlip: () => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const prevItemsRef = useRef<T[]>(items);
  const skipRef = useRef(false);

  useLayoutEffect(() => {
    if (prevItemsRef.current === items) return;
    prevItemsRef.current = items;

    if (skipRef.current) {
      skipRef.current = false;
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    elements.forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      const oldTop = positionsRef.current.get(id);
      if (oldTop === undefined) return;

      const newTop = el.getBoundingClientRect().top;
      const dy = oldTop - newTop;
      if (dy === 0) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;

      requestAnimationFrame(() => {
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        el.style.transform = '';
      });
    });
  }, [items, durationMs]);

  const capturePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const elements = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    const map = new Map<string, number>();
    elements.forEach((el) => {
      const id = el.dataset.flipId;
      if (id) map.set(id, el.getBoundingClientRect().top);
    });
    positionsRef.current = map;
  }, []);

  const skipNextFlip = useCallback(() => {
    skipRef.current = true;
  }, []);

  return { containerRef, capturePositions, skipNextFlip };
}
