"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Post {
  _id: string;
  postId: string;
  title?: string;
  body: string;
  author: string;
  subreddit: string;
  url: string;
  ups: number;
  numComments: number;
  createdUtc: number;
}

interface Props {
  posts: Post[];
  loading: boolean;
  onReload: () => void;
}

// Scatter positions per card within each band: [leftPct, topPctInBand, rotDeg, zIndex]
const BAND_SCATTER: [number, number, number, number][] = [
  [4, 6, -2, 1],
  [30, 3, 1, 2],
  [57, 5, -1, 1],
  [76, 2, 2, 3],
  [14, 52, 2, 2],
  [43, 46, -2, 1],
  [64, 54, 1, 2],
  [2, 72, -1, 3],
];
const BAND_HEIGHT = 440;
const BATCH = 8;

function formatAge(createdUtc: number): string {
  const diff = Math.floor(Date.now() / 1000 - createdUtc);
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

const SUB_PALETTE = [
  "#E04444",
  "#E8612A",
  "#D4961A",
  "#3DAA52",
  "#1A96D4",
  "#5C6BC0",
  "#9C27B0",
  "#E91E73",
  "#00897B",
  "#FF5722",
  "#607D8B",
  "#8D6E63",
  "#43A047",
  "#039BE5",
  "#F4511E",
  "#7E57C2",
];

function getSubredditColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return SUB_PALETTE[h % SUB_PALETTE.length];
}

// ── Toolbar modal types ───────────────────────────────────────────────────────
type ModalType = "keywords" | "subreddit" | "metrics" | null;

interface KeywordGroup {
  name: string;
  keywords: string[];
}

// ── Pill helpers ─────────────────────────────────────────────────────────────
function Pill({
  label,
  onRemove,
  color = "#FF9A8B",
  textColor = "#462D28",
}: {
  label: string;
  onRemove: () => void;
  color?: string;
  textColor?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 10px",
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 600,
        background: color,
        color: textColor,
      }}
    >
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          opacity: 0.45,
          display: "flex",
          alignItems: "center",
          color: "inherit",
        }}
      >
        <svg
          viewBox="0 0 10 10"
          width="8"
          height="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M2 2l6 6M8 2L2 8" />
        </svg>
      </button>
    </span>
  );
}

// ── Tag box (pill input) ──────────────────────────────────────────────────────
function TagBox({
  pills,
  onAdd,
  onRemove,
  placeholder,
  pillColor,
  pillTextColor,
}: {
  pills: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
  pillColor?: string;
  pillTextColor?: string;
}) {
  const [val, setVal] = useState("");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        alignItems: "center",
        minHeight: "42px",
        padding: "8px 10px",
        borderRadius: "10px",
        border: "1px solid rgba(0,0,0,0.1)",
        background: "#fff",
        cursor: "text",
      }}
    >
      {pills.map((p, i) => (
        <Pill
          key={p + i}
          label={p}
          onRemove={() => onRemove(i)}
          color={pillColor}
          textColor={pillTextColor}
        />
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = val.trim();
            if (t) {
              onAdd(t);
              setVal("");
            }
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: "80px",
          fontSize: "13px",
          color: "#191918",
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ── Inline modal ─────────────────────────────────────────────────────────────
function FeedModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: "56px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "272px",
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "13px 14px 11px",
        zIndex: 30,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            fontWeight: 800,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#B2A28C",
          }}
        >
          {title}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#C8B89A",
            fontSize: "15px",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Sub-autocomplete ──────────────────────────────────────────────────────────
function SubredditInput({
  value,
  onChange,
  onAdd,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: (v: string) => void;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchSubs = useAction(api.reddit.searchSubreddits);

  useEffect(() => {
    if (value.length < 2) { setSuggestions([]); return; }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchSubs({ query: value });
        if (!cancelled) setSuggestions(results);
      } catch { setSuggestions([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value]);

  const getRect = () => containerRef.current?.getBoundingClientRect() ?? null;

  const dropNode =
    suggestions.length > 0 && typeof window !== "undefined"
      ? createPortal(
          (() => {
            const r = getRect();
            if (!r) return null;
            return (
              <div
                style={{
                  position: "fixed",
                  top: r.bottom + 4,
                  left: r.left,
                  width: r.width,
                  zIndex: 9999,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  boxShadow: "none",
                }}
              >
                {suggestions.map((s) => (
                  <div
                    key={s}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAdd(s);
                      setSuggestions([]);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: "#191918",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#FDF7EF")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#fff")
                    }
                  >
                    r/{s}
                  </div>
                ))}
              </div>
            );
          })(),
          document.body,
        )
      : null;

  return (
    <div ref={containerRef}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            height: "38px",
            padding: "0 10px",
            borderRadius: "9px",
            border: "1px solid rgba(0,0,0,0.1)",
            background: "#fff",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#C4B9AA",
              userSelect: "none",
              marginRight: "3px",
            }}
          >
            r/
          </span>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd(value);
                setSuggestions([]);
              }
            }}
            disabled={disabled}
            placeholder="startup"
            style={{
              flex: 1,
              fontSize: "13px",
              color: "#191918",
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <button
          onClick={() => {
            onAdd(value);
            setSuggestions([]);
          }}
          disabled={disabled}
          style={{
            height: "38px",
            padding: "0 10px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            color: "#B2A28C",
            fontFamily: "inherit",
          }}
        >
          Add
        </button>
      </div>
      {dropNode}
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const fmt = (v: number) =>
    v === 0 ? "Any" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color: "#62584F",
          marginBottom: "5px",
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: "10px",
          border: "1px solid rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => onChange(Math.max(0, value - 10))}
          style={{
            width: "32px",
            height: "36px",
            border: "none",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#B2A28C",
            fontFamily: "inherit",
          }}
        >
          −
        </button>
        <span
          style={{
            padding: "0 12px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#191918",
            borderLeft: "1px solid rgba(0,0,0,0.08)",
            borderRight: "1px solid rgba(0,0,0,0.08)",
            minWidth: "54px",
            textAlign: "center",
            lineHeight: "36px",
          }}
        >
          {fmt(value)}
        </span>
        <button
          onClick={() => onChange(value + 10)}
          style={{
            width: "32px",
            height: "36px",
            border: "none",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#B2A28C",
            fontFamily: "inherit",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RedditFeed({ posts, loading, onReload }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const settings = useQuery(api.userSettings.getUserSettings);
  const upsertSettings = useMutation(api.userSettings.upsertUserSettings);

  // Local copies of settings for modals
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([{ name: "General", keywords: [] }]);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [editingGroupIdx, setEditingGroupIdx] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [minUpvotes, setMinUpvotes] = useState(0);
  const [minComments, setMinComments] = useState(0);
  const [subInput, setSubInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Derived flat keywords (union of all groups, deduped)
  const keywords = Array.from(new Set(keywordGroups.flatMap((g) => g.keywords)));

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const renderGen = useRef(0);
  const offset = useRef(0);
  const karmaCache = useRef<Map<string, string>>(new Map());
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const fetchKarmaAction = useAction(api.reddit.fetchKarma);
  const fetchKarmaRef = useRef(fetchKarmaAction);
  fetchKarmaRef.current = fetchKarmaAction;

  // Global karma tooltip div mounted on body
  useEffect(() => {
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;z-index:99999;background:#fff;color:#191918;font-size:10px;font-weight:700;padding:5px 10px;border-radius:10px;pointer-events:none;display:none;white-space:nowrap;border:1px solid rgba(0,0,0,0.09)";
    document.body.appendChild(div);
    tooltipRef.current = div;
    return () => {
      div.remove();
      tooltipRef.current = null;
    };
  }, []);

  // Populate from Convex settings
  if (settings && !loaded) {
    const stored = settings.keywordGroups;
    if (stored && stored.length > 0) {
      setKeywordGroups(stored);
    } else if (settings.keywords.length > 0) {
      setKeywordGroups([{ name: "General", keywords: settings.keywords }]);
    }
    setExcluded(settings.excluded);
    setSubreddits(settings.subreddits);
    setMinUpvotes(settings.minUpvotes);
    setMinComments(settings.minComments);
    setLoaded(true);
  }

  async function saveSettings(patch: {
    keywordGroups?: KeywordGroup[];
    excluded?: string[];
    subreddits?: string[];
    minUpvotes?: number;
    minComments?: number;
  }) {
    if (!isAuthenticated) return;
    const groups = patch.keywordGroups ?? keywordGroups;
    const merged = {
      keywords: Array.from(new Set(groups.flatMap((g) => g.keywords))),
      keywordGroups: groups,
      excluded: patch.excluded ?? excluded,
      subreddits: patch.subreddits ?? subreddits,
      minUpvotes: patch.minUpvotes ?? minUpvotes,
      minComments: patch.minComments ?? minComments,
    };
    await upsertSettings(merged);
  }

  // ── Scattered canvas rendering ────────────────────────────────────────────
  const appendBatch = useCallback(
    (gen: number) => {
      const inner = innerRef.current;
      if (!inner || gen !== renderGen.current) return;

      const batch = posts.slice(offset.current, offset.current + BATCH);
      if (!batch.length) return;

      const batchIndex = offset.current / BATCH;
      const bandTop = batchIndex * BAND_HEIGHT;

      batch.forEach((p, i) => {
        const [lp, tp, rot, z] = BAND_SCATTER[i] ?? [
          Math.random() * 65,
          Math.random() * 70,
          0,
          1,
        ];
        const topPx = bandTop + (tp / 100) * BAND_HEIGHT;

        const card = document.createElement("a");
        card.href = p.url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.style.cssText = [
          `position:absolute`,
          `width:265px`,
          `left:${lp}%`,
          `top:${topPx}px`,
          `z-index:${z}`,
          `background:#fff`,
          `border-radius:12px`,
          `border:1px solid rgba(0,0,0,0.08)`,
          `overflow:hidden`,
          `cursor:pointer`,
          `text-decoration:none`,
          `display:flex`,
          `flex-direction:column`,
          `--tx:0px`,
          `--ty:0px`,
          `--rot:${rot}deg`,
          `transform:translate(0,0) rotate(${rot}deg)`,
          `transition:transform .2s cubic-bezier(0.34,1.56,0.64,1)`,
        ].join(";");

        card.addEventListener("mouseenter", () => {
          card.style.transform = `translate(0,0) rotate(${rot}deg) scale(1.04)`;
          card.style.zIndex = "10";
        });
        card.addEventListener("mouseleave", () => {
          card.style.transform = `translate(0,0) rotate(${rot}deg) scale(1)`;
          card.style.zIndex = String(z);
        });

        const title = p.title || p.body.slice(0, 120);
        const subColor = getSubredditColor(p.subreddit);
        card.innerHTML = `
        <div class="kf" style="position:absolute;top:9px;right:9px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:default;z-index:2">
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C9 7 7 10 7 14a5 5 0 0010 0c0-2.5-1.5-5-2.5-6 0 2-1 3.5-2.5 3.5S9.5 10 12 2z" fill="#FF6B35"/></svg>
        </div>
        <div style="flex:1;min-width:0;padding:12px 35px 10px 12px">
          <div style="font-size:9.5px;color:#878a8c;margin-bottom:6px;display:flex;align-items:center;gap:4px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:${subColor};flex-shrink:0"><svg viewBox="0 0 20 20" width="12" height="12" xmlns="http://www.w3.org/2000/svg" fill="white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.22.22 0 00-.26.16l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.55zM8 11a1 1 0 111 1 1 1 0 01-1-1zm5.37 2.71a3.39 3.39 0 01-2.37.63 3.39 3.39 0 01-2.37-.63.22.22 0 01.31-.31 2.93 2.93 0 002.06.47 2.93 2.93 0 002.06-.47.22.22 0 01.31.31zM13 12a1 1 0 111-1 1 1 0 01-1 1z"/></svg></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1"><b style="color:#1c1c1c;font-weight:700">r/${p.subreddit}</b> · u/${p.author} · ${formatAge(p.createdUtc)}</span>
          </div>
          <div style="font-size:12.5px;font-weight:600;color:#1c1c1c;line-height:1.45;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden">
            ${title.replace(/</g, "&lt;")}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;padding:7px 10px;border-top:1px solid rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:center;gap:4px;background:#f6f7f8;border-radius:20px;padding:3px 8px">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            <span style="font-size:9.5px;font-weight:700;color:#1c1c1c">${formatCount(p.ups)}</span>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#878a8c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:20px;background:#f6f7f8;font-size:9.5px;font-weight:700;color:#878a8c">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${formatCount(p.numComments)}
          </div>
          <div style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:20px;background:#f6f7f8;font-size:9.5px;font-weight:700;color:#878a8c">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share
          </div>
        </div>`;

        const fireEl = card.querySelector<HTMLElement>(".kf");
        if (fireEl) {
          fireEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          fireEl.addEventListener("mouseenter", async () => {
            const tip = tooltipRef.current;
            if (!tip) return;
            fireEl.style.background = "rgba(0,0,0,0.06)";
            const uname = p.author;
            const cached = karmaCache.current.get(uname);
            const show = (text: string) => {
              const rect = fireEl.getBoundingClientRect();
              tip.textContent = text;
              tip.style.left = `${rect.right + 13}px`;
              tip.style.top = `${rect.top - 8}px`;
              tip.style.transform = "none";
              tip.style.display = "block";
            };
            if (cached !== undefined) {
              show(cached);
            } else {
              show("...");
              try {
                const karma = await fetchKarmaRef.current({ author: uname });
                const kStr = karma != null ? formatCount(karma) + " karma" : "—";
                karmaCache.current.set(uname, kStr);
                if (fireEl.matches(":hover")) show(kStr);
              } catch {
                karmaCache.current.set(uname, "—");
                if (fireEl.matches(":hover")) show("—");
              }
            }
          });
          fireEl.addEventListener("mouseleave", () => {
            fireEl.style.background = "";
            const tip = tooltipRef.current;
            if (tip) tip.style.display = "none";
          });
        }

        inner.appendChild(card);
      });

      offset.current += batch.length;
      inner.style.height = `${bandTop + BAND_HEIGHT + 60}px`;

      // Remove old sentinel
      inner.querySelector(".reddit-sentinel")?.remove();

      if (offset.current < posts.length) {
        const sentinel = document.createElement("div");
        sentinel.className = "reddit-sentinel";
        sentinel.style.cssText =
          "position:absolute;left:50%;bottom:0;transform:translateX(-50%);padding:16px;";
        sentinel.innerHTML = `<svg style="animation:spin .5s linear infinite;display:inline-block" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#DF849D" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
        inner.appendChild(sentinel);

        const obs = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              obs.disconnect();
              appendBatch(gen);
            }
          },
          { root: canvasRef.current, threshold: 0.1 },
        );
        obs.observe(sentinel);
      }
    },
    [posts],
  );

  // Re-render scattered canvas when posts change
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    renderGen.current++;
    offset.current = 0;
    inner.innerHTML = "";
    inner.style.height = "0";
    if (posts.length > 0) appendBatch(renderGen.current);
  }, [posts, appendBatch]);

  const hasKeywords = keywords.length > 0;
  const hasSubreddits = subreddits.length > 0;

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Spin keyframes injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="reddit-canvas"
        style={
          {
            flex: 1,
            position: "relative",
            background: "#FDF7EF",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties
        }
      >
        {loading && posts.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
            }}
          >
            <svg
              style={{ animation: "spin .5s linear infinite" }}
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="#DF849D"
              strokeWidth="2"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p style={{ fontSize: "13px", color: "#B2A28C" }}>
              Loading results…
            </p>
          </div>
        ) : !loading && posts.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="#C4B9AA"
              strokeWidth="1.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#62584F" }}>
              No posts found
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "#B2A28C",
                textAlign: "center",
                maxWidth: "220px",
              }}
            >
              {!hasKeywords || !hasSubreddits
                ? "Use the toolbar → to add keywords and subreddits."
                : "No matching posts in the last 6h. Try reloading."}
            </p>
          </div>
        ) : (
          <div ref={innerRef} style={{ position: "relative", width: "100%" }} />
        )}
      </div>

      {/* Reload button */}
      <button
        onClick={onReload}
        disabled={loading}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 20,
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "none",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#B2A28C",
          opacity: loading ? 0.5 : 1,
        }}
      >
        <svg
          style={{ animation: loading ? "spin .8s linear infinite" : "none" }}
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 4v6h6" />
          <path d="M3.51 15a9 9 0 1 0 .49-4.84" />
        </svg>
      </button>

      {/* Overlay — closes modal on outside click, sits below toolkit/modal */}
      {activeModal && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 15 }}
          onClick={() => setActiveModal(null)}
        />
      )}

      {/* Feed Toolkit */}
      <div
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          zIndex: 20,
          background: "#fff",
          borderRadius: "12px",
          padding: "5px",
          border: "1px solid rgba(0,0,0,0.07)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Keywords */}
        <ToolkitBtn
          tip="Keywords"
          active={activeModal === "keywords"}
          onClick={() =>
            setActiveModal((m) => (m === "keywords" ? null : "keywords"))
          }
        >
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="17" y2="17" />
          </svg>
        </ToolkitBtn>

        {/* Subreddits */}
        <ToolkitBtn
          tip="Subreddits"
          active={activeModal === "subreddit"}
          onClick={() =>
            setActiveModal((m) => (m === "subreddit" ? null : "subreddit"))
          }
        >
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10" cy="10" r="7" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <path d="M10 3 Q13 7 13 10 Q13 13 10 17 Q7 13 7 10 Q7 7 10 3Z" />
          </svg>
        </ToolkitBtn>

        {/* Metrics */}
        <ToolkitBtn
          tip="Metrics"
          active={activeModal === "metrics"}
          onClick={() =>
            setActiveModal((m) => (m === "metrics" ? null : "metrics"))
          }
        >
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="12" width="3" height="5" rx="1" />
            <rect x="8.5" y="7" width="3" height="10" rx="1" />
            <rect x="14" y="4" width="3" height="13" rx="1" />
          </svg>
        </ToolkitBtn>
      </div>

      {/* Keywords modal */}
      {activeModal === "keywords" && (
        <FeedModal title="Reddit Keywords" onClose={() => setActiveModal(null)}>
          <div style={{ marginBottom: "11px" }}>
            <label
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#62584F",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Track
            </label>
            {/* Group chips */}
            <div
              style={{
                display: "flex",
                gap: "5px",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              {keywordGroups.map((g, i) =>
                editingGroupIdx === i ? (
                  <input
                    key={`edit-${i}`}
                    autoFocus
                    value={editingGroupName}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const name = editingGroupName.trim() || g.name;
                        const next = keywordGroups.map((gr, j) =>
                          j === i ? { ...gr, name } : gr
                        );
                        setKeywordGroups(next);
                        setEditingGroupIdx(null);
                        saveSettings({ keywordGroups: next });
                      }
                      if (e.key === "Escape") setEditingGroupIdx(null);
                    }}
                    onBlur={() => {
                      const name = editingGroupName.trim() || g.name;
                      const next = keywordGroups.map((gr, j) =>
                        j === i ? { ...gr, name } : gr
                      );
                      setKeywordGroups(next);
                      setEditingGroupIdx(null);
                      saveSettings({ keywordGroups: next });
                    }}
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      width: "80px",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      border: "1px solid #DF849D",
                      background: "#fff",
                      color: "#191918",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <span
                    key={`group-${i}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      padding: "3px 8px 3px 10px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: activeGroupIdx === i ? "#DF849D" : "#F0EFED",
                      color: activeGroupIdx === i ? "#fff" : "#62584F",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick={() => setActiveGroupIdx(i)}
                    onDoubleClick={() => {
                      setEditingGroupIdx(i);
                      setEditingGroupName(g.name);
                    }}
                  >
                    {g.name}
                    {keywordGroups.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = keywordGroups.filter((_, j) => j !== i);
                          const newActive =
                            activeGroupIdx === i
                              ? Math.max(0, i - 1)
                              : activeGroupIdx > i
                                ? activeGroupIdx - 1
                                : activeGroupIdx;
                          setKeywordGroups(next);
                          setActiveGroupIdx(newActive);
                          saveSettings({ keywordGroups: next });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          lineHeight: 1,
                          opacity: 0.5,
                          display: "flex",
                          alignItems: "center",
                          color: "inherit",
                          marginLeft: "1px",
                        }}
                      >
                        <svg
                          viewBox="0 0 10 10"
                          width="7"
                          height="7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        >
                          <path d="M2 2l6 6M8 2L2 8" />
                        </svg>
                      </button>
                    )}
                  </span>
                )
              )}
              <button
                onClick={() => {
                  const newName = `Group ${keywordGroups.length + 1}`;
                  const next = [...keywordGroups, { name: newName, keywords: [] }];
                  const newIdx = next.length - 1;
                  setKeywordGroups(next);
                  setActiveGroupIdx(newIdx);
                  setEditingGroupIdx(newIdx);
                  setEditingGroupName(newName);
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "9999px",
                  border: "1px dashed #C4B9AA",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#B2A28C",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  fontFamily: "inherit",
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>
            <TagBox
              pills={keywordGroups[activeGroupIdx]?.keywords ?? []}
              onAdd={(v) => {
                if (!keywords.includes(v) && keywords.length < 50) {
                  const next = keywordGroups.map((g, i) =>
                    i === activeGroupIdx
                      ? { ...g, keywords: [...g.keywords, v] }
                      : g
                  );
                  setKeywordGroups(next);
                  saveSettings({ keywordGroups: next });
                }
              }}
              onRemove={(idx) => {
                const next = keywordGroups.map((g, i) =>
                  i === activeGroupIdx
                    ? { ...g, keywords: g.keywords.filter((_, j) => j !== idx) }
                    : g
                );
                setKeywordGroups(next);
                saveSettings({ keywordGroups: next });
              }}
              placeholder="e.g. b2b saas…"
            />
            <span
              style={{
                fontSize: "9px",
                color: "#B2A28C",
                marginTop: "2px",
                display: "block",
              }}
            >
              {keywords.length}/50 · Press Enter to add
            </span>
          </div>
          <div>
            <label
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#62584F",
                marginBottom: "5px",
                display: "block",
              }}
            >
              Exclude
            </label>
            <TagBox
              pills={excluded}
              onAdd={(v) => {
                if (!excluded.includes(v)) {
                  const next = [...excluded, v];
                  setExcluded(next);
                  saveSettings({ excluded: next });
                }
              }}
              onRemove={(i) => {
                const next = excluded.filter((_, j) => j !== i);
                setExcluded(next);
                saveSettings({ excluded: next });
              }}
              placeholder="e.g. spam…"
              pillColor="#E2DDD8"
              pillTextColor="#6B6560"
            />
          </div>
        </FeedModal>
      )}

      {/* Subreddit modal */}
      {activeModal === "subreddit" && (
        <FeedModal title="Subreddits" onClose={() => setActiveModal(null)}>
          <SubredditInput
            value={subInput}
            onChange={setSubInput}
            onAdd={(v) => {
              const clean = v.trim().replace(/^r\//i, "");
              if (
                clean &&
                !subreddits.includes(clean) &&
                subreddits.length < 5
              ) {
                const next = [...subreddits, clean];
                setSubreddits(next);
                setSubInput("");
                saveSettings({ subreddits: next });
              }
            }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              marginTop: "8px",
            }}
          >
            {subreddits.map((s, i) => (
              <Pill
                key={s}
                label={s}
                onRemove={() => {
                  const next = subreddits.filter((_, j) => j !== i);
                  setSubreddits(next);
                  saveSettings({ subreddits: next });
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: "9px", color: "#B2A28C", marginTop: "6px", display: "block" }}>
            {subreddits.length}/5 · Max 5 subreddits
          </span>
        </FeedModal>
      )}

      {/* Metrics modal */}
      {activeModal === "metrics" && (
        <FeedModal title="Reddit Metrics" onClose={() => setActiveModal(null)}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              padding: "4px 0",
            }}
          >
            <Stepper
              value={minUpvotes}
              label="Min Upvotes"
              onChange={(v) => {
                setMinUpvotes(v);
                saveSettings({ minUpvotes: v });
              }}
            />
            <Stepper
              value={minComments}
              label="Min Comments"
              onChange={(v) => {
                setMinComments(v);
                saveSettings({ minComments: v });
              }}
            />
          </div>
        </FeedModal>
      )}
    </div>
  );
}

function ToolkitBtn({
  tip,
  active,
  onClick,
  children,
}: {
  tip: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "30px",
        height: "30px",
        border: "none",
        background: active ? "#DF849D" : "transparent",
        borderRadius: "7px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "#fff" : "#B2A28C",
        transition: "all 0.15s",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "#F0EFED";
          (e.currentTarget as HTMLElement).style.color = "#191918";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#B2A28C";
        }
      }}
    >
      {children}
    </button>
  );
}
