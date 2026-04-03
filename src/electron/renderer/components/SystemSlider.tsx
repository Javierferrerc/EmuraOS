import { useEffect, useRef } from "react";
import type { SliderItem } from "../utils/sliderItems";
import "./SystemSlider.css";

interface SystemSliderProps {
  items: SliderItem[];
  activeIndex: number;
  focusedIndex: number;
  focusActive: boolean;
  onSelect: (index: number) => void;
}

export function SystemSlider({
  items,
  activeIndex,
  focusedIndex,
  focusActive,
  onSelect,
}: SystemSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !focusActive) return;
    const el = scrollRef.current?.querySelector(
      `[data-slider-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ inline: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex, focusActive]);

  return (
    <div
      ref={scrollRef}
      className="slider-container hide-scrollbar flex overflow-x-auto px-5 py-3"
    >
      {items.map((item, idx) => {
        const isActive = idx === activeIndex;
        const isFocused = focusActive && focusedIndex === idx;

        return (
          <button
            key={item.key}
            data-slider-index={idx}
            onClick={() => onSelect(idx)}
            className={`slider-btn flex items-center justify-center text-xs font-bold text-white transition-all duration-200 ${
              isFocused ? "ring-2 ring-blue-500 scale-105" : ""
            } ${isActive ? "scale-105" : "hover:scale-105"}`}
            style={{
              "--slider-color": item.color,
              "--slider-icon-color": item.iconColor,
              "--slider-color-bg": item.systemId === null ? `${item.color}33` : `${item.color}8c`,
              "--slider-dark": `${item.darkColor}00`,
              "--slider-border-start": `${item.color}d1`,
              "--slider-border-end": `${item.darkColor}00`,
            } as React.CSSProperties}
            title={item.label}
          >
            {item.icon ? (
              item.systemId === null ? (
                <img
                  src={item.icon}
                  alt={item.label}
                  className="slider-icon-img"
                />
              ) : (
                <div
                  className="slider-icon"
                  style={{ "--slider-icon": `url(${item.icon})` } as React.CSSProperties}
                />
              )
            ) : (
              item.shortLabel
            )}
          </button>
        );
      })}
    </div>
  );
}
