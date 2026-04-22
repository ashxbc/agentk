"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (aligned with design.md + dashboard palette)
// Cream: #FDF7EF · Heading: #191918 · Body: #3D3A36 · Muted: #B2A28C
// Accent: #DF849D · Border: rgba(0,0,0,0.06)
// ─────────────────────────────────────────────────────────────────────────────

const TEXT      = "#191918";
const BODY      = "#3D3A36";
const MUTED     = "#B2A28C";
const SOFT      = "#62584F";
const ACCENT    = "#DF849D";
const BG        = "#FDF7EF";
const CARD_BG   = "#ffffff";
const BORDER    = "rgba(0,0,0,0.06)";
const BORDER_HV = "rgba(0,0,0,0.12)";

interface Lead {
  _id:         Id<"leads">;
  postId:      string;
  source:      string;
  title:       string;
  url:         string;
  subreddit:   string;
  author:      string;
  ups:         number;
  numComments: number;
  createdUtc:  number;
  query:       string;
  addedAt:     number;
}

export default function LeadsPanel() {
  const lists       = useQuery(api.leads.getLists);
  const createList  = useMutation(api.leads.createList);
  const renameList  = useMutation(api.leads.renameList);
  const deleteList  = useMutation(api.leads.deleteList);
  const removeLead  = useMutation(api.leads.removeLead);

  const [openListId, setOpenListId] = useState<Id<"leadLists"> | null>(null);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState("");
  const [renamingId, setRenamingId] = useState<Id<"leadLists"> | null>(null);
  const [renameVal, setRenameVal]   = useState("");

  // If open list was deleted elsewhere, drop back to overview.
  const openList = useMemo(
    () => (lists ?? []).find((l) => l._id === openListId) ?? null,
    [lists, openListId],
  );
  if (openListId && lists !== undefined && !openList) {
    // state cleanup on next tick
    setTimeout(() => setOpenListId(null), 0);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = await createList({ name });
    setNewName("");
    setCreating(false);
    if (id) setOpenListId(id);
  }

  // ── List-detail view ──────────────────────────────────────────────────────
  if (openList) {
    return (
      <LeadListView
        listId={openList._id}
        listName={openList.name}
        onBack={() => setOpenListId(null)}
        onRename={(name) => renameList({ listId: openList._id, name })}
        onDelete={async () => {
          await deleteList({ listId: openList._id });
          setOpenListId(null);
        }}
        onRemoveLead={(leadId) => removeLead({ leadId })}
      />
    );
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, background: BG, overflow: "auto" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 40px 80px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
              Leads
            </h1>
            <p style={{ fontSize: 13, color: MUTED, margin: "6px 0 0", fontWeight: 400 }}>
              Save and organize Reddit posts into lists.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 12, fontWeight: 600, color: TEXT,
              background: "transparent", border: `1px solid ${BORDER}`,
              padding: "8px 14px", borderRadius: 999, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all .15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = BORDER_HV)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New list
          </button>
        </div>

        {/* New-list inline row */}
        {creating && (
          <div style={{
            background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
            marginBottom: 16,
          }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              placeholder="List name"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 14, color: TEXT, fontWeight: 500,
              }}
            />
            <button
              onClick={handleCreate}
              style={{
                fontSize: 12, fontWeight: 600, color: "#fff",
                background: ACCENT, border: "none", padding: "6px 14px",
                borderRadius: 999, cursor: "pointer",
              }}
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(""); }}
              style={{
                fontSize: 12, fontWeight: 500, color: MUTED,
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Lists */}
        {lists === undefined ? (
          <EmptyBlock label="Loading…" />
        ) : lists.length === 0 ? (
          <EmptyBlock label="No lists yet. Create one to start collecting leads." />
        ) : (
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {lists.map((l, i) => {
              const isRenaming = renamingId === l._id;
              return (
                <div
                  key={l._id}
                  onClick={() => !isRenaming && setOpenListId(l._id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "16px 18px",
                    borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                    cursor: isRenaming ? "default" : "pointer",
                    transition: "background .12s ease",
                  }}
                  onMouseEnter={(e) => { if (!isRenaming) (e.currentTarget as HTMLElement).style.background = BG; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: "rgba(223,132,157,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: ACCENT,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            await renameList({ listId: l._id, name: renameVal });
                            setRenamingId(null);
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={async () => {
                          await renameList({ listId: l._id, name: renameVal });
                          setRenamingId(null);
                        }}
                        style={{
                          border: "none", outline: "none", background: "transparent",
                          fontSize: 14, color: TEXT, fontWeight: 600, width: "100%",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 14, color: TEXT, fontWeight: 600, letterSpacing: "-0.005em" }}>
                        {l.name}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2, fontWeight: 400 }}>
                      {l.count} {l.count === 1 ? "lead" : "leads"}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(l._id);
                      setRenameVal(l.name);
                    }}
                    title="Rename"
                    style={iconBtn}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${l.name}"? Its leads will be removed.`)) {
                        await deleteList({ listId: l._id });
                      }
                    }}
                    title="Delete"
                    style={iconBtn}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _unused() { return SOFT; }
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: "52px 24px", textAlign: "center", color: MUTED, fontSize: 13,
    }}>
      {label}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, border: "none", background: "transparent",
  borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center",
  justifyContent: "center", color: MUTED, transition: "all .15s ease",
};

// ─────────────────────────────────────────────────────────────────────────────
// List-detail view
// ─────────────────────────────────────────────────────────────────────────────

function LeadListView({
  listId, listName, onBack, onRename, onDelete, onRemoveLead,
}: {
  listId: Id<"leadLists">;
  listName: string;
  onBack: () => void;
  onRename: (name: string) => Promise<unknown>;
  onDelete: () => Promise<void>;
  onRemoveLead: (leadId: Id<"leads">) => Promise<unknown>;
}) {
  const leads = useQuery(api.leads.getLeads, { listId }) as Lead[] | undefined;

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(listName);

  async function handleRename() {
    const v = nameDraft.trim();
    if (v && v !== listName) await onRename(v);
    setEditing(false);
  }

  function handleExport() {
    if (!leads || leads.length === 0) return;
    const header = [
      "Title", "URL", "Subreddit", "Author", "Query", "Source",
      "Upvotes", "Comments", "Posted (UTC)", "Added (UTC)",
    ];
    const rows = leads.map((l) => [
      l.title,
      l.url,
      `r/${l.subreddit}`,
      `u/${l.author}`,
      l.query,
      l.source,
      String(l.ups),
      String(l.numComments),
      new Date(l.createdUtc * 1000).toISOString(),
      new Date(l.addedAt).toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = listName.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 40) || "leads";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `agentk-${safe}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, background: BG, overflow: "auto" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "56px 40px 80px" }}>
        {/* Back */}
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            color: MUTED, fontSize: 12, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
          onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          All lists
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") { setEditing(false); setNameDraft(listName); }
                }}
                style={{
                  fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: "-0.02em",
                  border: "none", outline: "none", background: "transparent",
                  width: "100%", padding: 0, lineHeight: 1.1,
                }}
              />
            ) : (
              <h1
                onClick={() => setEditing(true)}
                style={{
                  fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: "-0.02em",
                  margin: 0, lineHeight: 1.1, cursor: "text",
                }}
                title="Click to rename"
              >
                {listName}
              </h1>
            )}
            <p style={{ fontSize: 13, color: MUTED, margin: "6px 0 0", fontWeight: 400 }}>
              {leads === undefined ? "Loading…" : `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleExport}
              disabled={!leads || leads.length === 0}
              style={{
                fontSize: 12, fontWeight: 600,
                color: !leads || leads.length === 0 ? MUTED : "#fff",
                background: !leads || leads.length === 0 ? "transparent" : TEXT,
                border: `1px solid ${!leads || leads.length === 0 ? BORDER : TEXT}`,
                padding: "8px 14px", borderRadius: 999,
                cursor: !leads || leads.length === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all .15s ease",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
            <button
              onClick={async () => {
                if (confirm(`Delete "${listName}"?`)) await onDelete();
              }}
              style={iconBtn}
              title="Delete list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Lead rows */}
        {leads === undefined ? (
          <EmptyBlock label="Loading…" />
        ) : leads.length === 0 ? (
          <EmptyBlock label="No leads here yet." />
        ) : (
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {leads.map((lead, i) => (
              <LeadRow
                key={lead._id}
                lead={lead}
                first={i === 0}
                onRemove={() => onRemoveLead(lead._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadRow({ lead, first, onRemove }: { lead: Lead; first: boolean; onRemove: () => void }) {
  const [hover, setHover] = useState(false);
  const ageMin = Math.max(0, Math.floor((Date.now() / 1000 - lead.createdUtc) / 60));
  const ageStr = ageMin < 60 ? `${ageMin}m` : ageMin < 1440 ? `${Math.floor(ageMin / 60)}h` : `${Math.floor(ageMin / 1440)}d`;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "16px 18px",
        borderTop: first ? "none" : `1px solid ${BORDER}`,
        transition: "background .12s ease",
        background: hover ? BG : "transparent",
        display: "flex", alignItems: "flex-start", gap: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 14, fontWeight: 600, color: TEXT, textDecoration: "none",
            letterSpacing: "-0.005em", lineHeight: 1.35,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          } as React.CSSProperties}
        >
          {lead.title}
        </a>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 12, color: MUTED, fontWeight: 400 }}>
          <span>r/{lead.subreddit}</span>
          <span>·</span>
          <span>u/{lead.author}</span>
          <span>·</span>
          <span>{ageStr} ago</span>
          <span>·</span>
          <span>{lead.ups} ↑</span>
          <span>·</span>
          <span>{lead.numComments} 💬</span>
        </div>
        {lead.query && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            marginTop: 8, padding: "3px 9px",
            background: lead.source === "ai" ? "rgba(223,132,157,0.10)" : "rgba(0,0,0,0.04)",
            borderRadius: 999, fontSize: 11, fontWeight: 500,
            color: lead.source === "ai" ? ACCENT : BODY,
            maxWidth: "100%",
          }}>
            <span style={{ opacity: 0.7 }}>{lead.source === "ai" ? "intent" : "query"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.query}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={onRemove}
        title="Remove from list"
        style={{
          ...iconBtn,
          opacity: hover ? 1 : 0,
          transition: "opacity .12s ease, color .15s ease",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

// RFC 4180 escaping
function csvCell(v: string): string {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
