import { useMemo, useState } from "react";
import { formatPlayTime } from "../../../../utils/formatPlayTime";

/**
 * GitHub-contributions-style heatmap of play activity over the last
 * 365 days. Each cell is one day; rows are days of the week (Mon top
 * → Sun bottom). Intensity is bucketed against the user's own busiest
 * day so a moderate gamer doesn't end up with a uniformly pale grid.
 *
 * Stateless aside from the hover tooltip — all the aggregation runs in
 * a useMemo against the playSessions prop. The component owns its own
 * styling and is rendered through the Settings schema's `custom` row
 * kind, so the surrounding Settings infrastructure stays oblivious to
 * its existence.
 */

interface Props {
  /** YYYY-MM-DD → seconds played. Comes from AppContext.playSessions
   *  via SettingsContext. */
  sessions: Record<string, number>;
}

interface DayCell {
  dateIso: string; // YYYY-MM-DD
  seconds: number;
  /** Empty placeholders are used for the leading days before today−364
   *  that don't belong to the heatmap. Keeps the grid rectangular. */
  empty: boolean;
}

const DAYS = 365;
const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** ISO-week day index — Monday = 0, Sunday = 6. Matches the weekday
 *  ordering shown in the leftmost label column. */
function isoWeekday(d: Date): number {
  const jsDay = d.getDay(); // Sunday = 0
  return (jsDay + 6) % 7;
}

function formatDateEs(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${d} ${MONTH_LABELS_ES[m - 1]} ${y}`;
}

export function CalendarHeatmap({ sessions }: Props) {
  const [hover, setHover] = useState<DayCell | null>(null);

  const { columns, max, totalDays, monthMarkers } = useMemo(() => {
    // Anchor the grid so the rightmost column ends on today and the
    // bottom row is Sunday. We walk back 365 days from today, pad the
    // start to fill the first week, and group by week into columns.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: DayCell[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        dateIso: iso,
        seconds: sessions[iso] ?? 0,
        empty: false,
      });
    }

    // Pad the front of the array so day[0] starts on Monday.
    const firstWeekday = isoWeekday(new Date(days[0].dateIso));
    const padded: DayCell[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      padded.push({ dateIso: "", seconds: 0, empty: true });
    }
    padded.push(...days);

    // Group into 7-day columns.
    const cols: DayCell[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }
    // Ensure the last column has 7 entries (pad tail).
    while (cols[cols.length - 1].length < 7) {
      cols[cols.length - 1].push({ dateIso: "", seconds: 0, empty: true });
    }

    const m = Math.max(0, ...days.map((d) => d.seconds));

    // Track month transitions for the column-header labels. A marker
    // is placed on the first column whose first non-empty day belongs
    // to a new month, relative to the previous column.
    const markers: Array<{ colIdx: number; label: string }> = [];
    let lastMonth = -1;
    cols.forEach((col, idx) => {
      const firstReal = col.find((c) => !c.empty);
      if (!firstReal) return;
      const month = parseInt(firstReal.dateIso.slice(5, 7), 10) - 1;
      if (month !== lastMonth) {
        markers.push({ colIdx: idx, label: MONTH_LABELS_ES[month] });
        lastMonth = month;
      }
    });

    return {
      columns: cols,
      max: m,
      totalDays: days.length,
      monthMarkers: markers,
    };
  }, [sessions]);

  // Bucket thresholds derived from the user's busiest day: 0 (empty),
  // 1 (light), 2 (medium), 3 (heavy), 4 (peak). Falling back to a
  // 4-hour ceiling when the user has no activity at all keeps the
  // legend looking honest instead of collapsing to a single band.
  const ceiling = max > 0 ? max : 4 * 3600;
  const bucket = (sec: number): 0 | 1 | 2 | 3 | 4 => {
    if (sec <= 0) return 0;
    if (sec < ceiling * 0.25) return 1;
    if (sec < ceiling * 0.5) return 2;
    if (sec < ceiling * 0.75) return 3;
    return 4;
  };

  const totalSeconds = useMemo(
    () => Object.values(sessions).reduce((a, b) => a + b, 0),
    [sessions]
  );
  const daysWithActivity = useMemo(
    () => Object.values(sessions).filter((s) => s > 0).length,
    [sessions]
  );

  if (totalDays === 0) {
    return (
      <div className="text-sm text-muted">Sin datos de actividad.</div>
    );
  }

  return (
    <div className="select-none">
      {/* Header summary line */}
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted">
        <span>
          {daysWithActivity > 0
            ? `${daysWithActivity} día${daysWithActivity === 1 ? "" : "s"} con actividad en el último año`
            : "Aún sin actividad — los días se irán llenando al jugar."}
        </span>
        <span>{formatPlayTime(totalSeconds) || "0m"} totales</span>
      </div>

      {/* Grid + axis labels */}
      <div className="flex gap-1">
        {/* Weekday axis (left) */}
        <div className="flex flex-col justify-between pr-1 pt-3 text-[9px] uppercase text-muted">
          {WEEKDAY_LABELS.map((d, idx) => (
            <span
              key={d}
              className={idx % 2 === 0 ? "opacity-100" : "opacity-0"}
            >
              {d}
            </span>
          ))}
        </div>

        {/* Month strip + grid */}
        <div className="flex-1 overflow-x-auto">
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${columns.length}, minmax(10px, 1fr))`,
              gridAutoRows: "auto",
              gap: "2px",
            }}
          >
            {/* Month labels row */}
            {columns.map((_, idx) => {
              const marker = monthMarkers.find((m) => m.colIdx === idx);
              return (
                <div
                  key={`m-${idx}`}
                  className="h-3 text-[9px] uppercase text-muted"
                  style={{ gridColumn: idx + 1, gridRow: 1 }}
                >
                  {marker?.label ?? ""}
                </div>
              );
            })}

            {/* Day cells: 7 rows × N cols, anchored at gridRow: weekday + 2
                (1 is the month-label row above). */}
            {columns.map((col, colIdx) =>
              col.map((cell, rowIdx) => {
                if (cell.empty) {
                  return (
                    <div
                      key={`c-${colIdx}-${rowIdx}`}
                      style={{
                        gridColumn: colIdx + 1,
                        gridRow: rowIdx + 2,
                      }}
                    />
                  );
                }
                const b = bucket(cell.seconds);
                const bg = [
                  "rgba(255,255,255,0.04)", // 0
                  "rgba(80,160,250,0.30)", // 1
                  "rgba(80,160,250,0.55)", // 2
                  "rgba(80,160,250,0.80)", // 3
                  "rgba(80,160,250,1.00)", // 4
                ][b];
                return (
                  <div
                    key={`c-${colIdx}-${rowIdx}`}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() =>
                      setHover((curr) => (curr === cell ? null : curr))
                    }
                    style={{
                      gridColumn: colIdx + 1,
                      gridRow: rowIdx + 2,
                      background: bg,
                      borderRadius: 2,
                      aspectRatio: "1 / 1",
                    }}
                    aria-label={`${formatDateEs(cell.dateIso)}: ${formatPlayTime(cell.seconds) || "0m"}`}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer: legend + hover tooltip */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
        <div className="min-h-[14px]">
          {hover && (
            <span>
              <span className="text-secondary">
                {formatDateEs(hover.dateIso)}
              </span>
              {" — "}
              <span>{formatPlayTime(hover.seconds) || "0m"}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((b) => (
            <div
              key={b}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: [
                  "rgba(255,255,255,0.04)",
                  "rgba(80,160,250,0.30)",
                  "rgba(80,160,250,0.55)",
                  "rgba(80,160,250,0.80)",
                  "rgba(80,160,250,1.00)",
                ][b],
              }}
            />
          ))}
          <span>Más</span>
        </div>
      </div>
    </div>
  );
}
