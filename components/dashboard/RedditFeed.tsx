"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Post {
  _id: string;
  postId: string;
  title: string;
  body: string;
  author: string;
  subreddit: string;
  url: string;
  ups: number;
  numComments: number;
  createdUtc: number;
  matchedQueries: string[];
}

interface Props {
  posts: Post[];
  loading: boolean;
}

const BAND_SCATTER: [number, number, number, number][] = [
  [4, 6, -2, 1], [30, 3, 1, 2], [57, 5, -1, 1], [76, 2, 2, 3],
  [14, 52, 2, 2], [43, 46, -2, 1], [64, 54, 1, 2], [2, 72, -1, 3],
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
  "#E04444","#E8612A","#D4961A","#3DAA52","#1A96D4",
  "#5C6BC0","#9C27B0","#E91E73","#00897B","#FF5722",
  "#607D8B","#8D6E63","#43A047","#039BE5","#F4511E","#7E57C2",
];

function getSubredditColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return SUB_PALETTE[h % SUB_PALETTE.length];
}

export default function RedditFeed({ posts, loading }: Props) {
  const canvasRef   = useRef<HTMLDivElement>(null);
  const innerRef    = useRef<HTMLDivElement | null>(null);
  const tooltipRef  = useRef<HTMLDivElement | null>(null);
  const offset      = useRef(0);
  const renderGen   = useRef(0);
  const karmaCache  = useRef(new Map<string, string>());

  const fetchKarma = useAction(api.reddit.fetchKarma);
  const fetchKarmaRef = useRef(fetchKarma);
  useEffect(() => { fetchKarmaRef.current = fetchKarma; }, [fetchKarma]);

  // Create tooltip div once
  useEffect(() => {
    const tip = document.createElement("div");
    tip.style.cssText = "position:fixed;display:none;background:#191918;color:#fff;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;pointer-events:none;z-index:999;white-space:nowrap;font-family:Inter,sans-serif";
    document.body.appendChild(tip);
    tooltipRef.current = tip;
    const style = document.createElement("style");
    style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
    return () => { tip.remove(); style.remove(); };
  }, []);

  const appendBatch = useCallback((gen: number) => {
    const inner = innerRef.current;
    if (!inner || gen !== renderGen.current) return;

    const batch = posts.slice(offset.current, offset.current + BATCH);
    if (batch.length === 0) return;

    const bandIdx  = Math.floor(offset.current / BAND_SCATTER.length);
    const bandTop  = bandIdx * BAND_HEIGHT;

    batch.forEach((p, i) => {
      const slotIdx = (offset.current + i) % BAND_SCATTER.length;
      const [leftPct, topPctInBand, rotDeg, zIdx] = BAND_SCATTER[slotIdx];

      const card = document.createElement("a");
      card.href   = p.url;
      card.target = "_blank";
      card.rel    = "noopener noreferrer";

      const topPx = bandTop + (topPctInBand / 100) * BAND_HEIGHT;
      card.style.cssText = `
        position:absolute;
        left:${leftPct}%;
        top:${topPx}px;
        width:265px;
        background:#fff;
        border-radius:12px;
        border:1px solid rgba(0,0,0,0.08);
        overflow:hidden;
        text-decoration:none;
        cursor:pointer;
        transform:rotate(${rotDeg}deg);
        z-index:${zIdx};
        transition:box-shadow 0.2s,transform 0.2s;
      `;
      card.onmouseenter = () => {
        card.style.boxShadow = "0 8px 32px rgba(0,0,0,0.12)";
        card.style.transform = `rotate(${rotDeg}deg) translateY(-2px)`;
      };
      card.onmouseleave = () => {
        card.style.boxShadow = "0 2px 12px rgba(0,0,0,0.05)";
        card.style.transform = `rotate(${rotDeg}deg)`;
      };

      const subColor = getSubredditColor(p.subreddit);
      const title    = p.title || p.body.slice(0, 120);

      card.innerHTML = `
        <div style="position:absolute;top:9px;right:9px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;z-index:2">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M12 2C9 7 7 10 7 14a5 5 0 0010 0c0-2.5-1.5-5-2.5-6 0 2-1 3.5-2.5 3.5S9.5 10 12 2z" fill="#FF6B35"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;padding:12px 42px 10px 12px">
          <div style="font-size:9.5px;color:#878a8c;margin-bottom:6px;display:flex;align-items:center;gap:4px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:${subColor};flex-shrink:0">
              <svg viewBox="0 0 20 20" width="10" height="10" fill="white">
                <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.22.22 0 00-.26.16l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.55zM8 11a1 1 0 111 1 1 1 0 01-1-1zm5.37 2.71a3.39 3.39 0 01-2.37.63 3.39 3.39 0 01-2.37-.63.22.22 0 01.31-.31 2.93 2.93 0 002.06.47 2.93 2.93 0 002.06-.47.22.22 0 01.31.31zM13 12a1 1 0 111-1 1 1 0 01-1 1z"/>
              </svg>
            </span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">
              <b style="color:#1c1c1c;font-weight:700">r/${p.subreddit}</b> · <button class="kf" style="background:none;border:none;cursor:pointer;padding:0;font-size:9.5px;color:#878a8c;font-family:inherit">u/${p.author}</button> · ${formatAge(p.createdUtc)}
            </span>
          </div>
          <div style="font-size:12.5px;font-weight:600;color:#1c1c1c;line-height:1.45;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">
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
        </div>
      `;

      // Karma tooltip
      const fireEl = card.querySelector<HTMLElement>(".kf");
      if (fireEl) {
        fireEl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
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
            tip.style.display = "block";
          };
          if (cached !== undefined) {
            show(cached);
          } else {
            tip.innerHTML = `<svg style="animation:spin .6s linear infinite;display:inline-block;vertical-align:middle" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
            const rect = fireEl.getBoundingClientRect();
            tip.style.left = `${rect.right + 13}px`;
            tip.style.top = `${rect.top - 8}px`;
            tip.style.display = "block";
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
    const bandCount = Math.ceil(offset.current / BAND_SCATTER.length);
    inner.style.height = `${bandCount * BAND_HEIGHT + 60}px`;

    inner.querySelector(".reddit-sentinel")?.remove();

    if (offset.current < posts.length) {
      const sentinel = document.createElement("div");
      sentinel.className = "reddit-sentinel";
      sentinel.style.cssText = "position:absolute;left:50%;bottom:0;transform:translateX(-50%);padding:16px;";
      sentinel.innerHTML = `<svg style="animation:spin .5s linear infinite;display:inline-block" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#DF849D" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
      inner.appendChild(sentinel);
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) { obs.disconnect(); appendBatch(gen); }
      }, { root: canvasRef.current, threshold: 0.1 });
      obs.observe(sentinel);
    }
  }, [posts]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    renderGen.current++;
    offset.current = 0;
    inner.innerHTML = "";
    inner.style.height = "0";
    if (posts.length > 0) appendBatch(renderGen.current);
  }, [posts, appendBatch]);

  return (
    <div ref={canvasRef} style={{
      flex: 1, height: "100%", overflowY: "auto", overflowX: "hidden",
      background: "#FDF7EF", position: "relative",
    }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg style={{ animation: "spin .6s linear infinite" }} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#DF849D" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#C4B9AA" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#62584F", margin: 0 }}>No posts yet</p>
          <p style={{ fontSize: "12px", color: "#B2A28C", margin: 0, textAlign: "center", maxWidth: "220px" }}>
            Posts matching your setup will appear here every 15 minutes.
          </p>
        </div>
      )}

      <div style={{ position: "relative", width: "100%", minHeight: "100%" }}>
        <div ref={(el) => { innerRef.current = el; }} style={{ position: "relative", width: "100%" }} />
      </div>
    </div>
  );
}
