"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import logo from "@/app/logo.png";

interface Props {
  open: boolean;
}

type Msg = { from: "bot" | "user"; html?: string; text?: string };

const COMMANDS = ["/email", "/account", "/token", "/delete"] as const;

export default function SettingsPanel({ open }: Props) {
  const { signOut }    = useAuthActions();
  const user           = useQuery(api.users.currentUser);
  const authProvider   = useQuery(api.users.getAuthProvider);
  const generateToken  = useMutation(api.agentTokens.generateToken);
  const tokenRow       = useQuery(api.agentTokens.getToken);
  const updateName     = useMutation(api.users.updateName);
  const deleteAccount  = useMutation(api.users.deleteAccount);
  const resetOnboarding = useMutation(api.userProfile.resetOnboarding);
  const myQueries      = useQuery(api.userQueries.getMyQueries);
  const saveQueries    = useMutation(api.userQueries.saveQueries);

  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [input,    setInput]    = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [booted,   setBooted]   = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const [editSubs, setEditSubs] = useState<string[]>([]);
  const [editQs,   setEditQs]   = useState<string[]>([]);
  const [newSub,   setNewSub]   = useState("");

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  function scrollBottom() {
    setTimeout(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, 20);
  }

  function addBot(html: string) {
    setMsgs(m => [...m, { from: "bot", html }]);
    scrollBottom();
  }

  function addUser(text: string) {
    setMsgs(m => [...m, { from: "user", text }]);
    scrollBottom();
  }

  // Boot greeting once user loads
  useEffect(() => {
    if (!open || booted || user === undefined) return;
    setBooted(true);
    const name = user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";
    addBot(`Hi <strong>${name}</strong>! I'm your agentK assistant.<br><br>
<b>/email</b> — view your email &amp; auth status<br>
<b>/account</b> — view or update your display name<br>
<b>/token</b> — your Telegram &amp; Discord alert token<br>
<b>/delete</b> — delete your account`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booted, user]);

  function dispatch(raw: string) {
    const trimmed = raw.trim();
    const cmd = trimmed.toLowerCase();
    if (!cmd) return;
    addUser(trimmed);

    setTimeout(() => {
      if (cmd === "/email") {
        const email    = user?.email ?? "<em style='color:#B2A28C'>not set</em>";
        const provider = authProvider === "google" ? "Google" : authProvider === "password" ? "Email / Password" : authProvider ?? "Unknown";
        addBot(
          `<strong>Email:</strong> ${email}<br><br>` +
          `<strong>Auth provider:</strong> ${provider}`
        );

      } else if (cmd === "/account") {
        const name = user?.name
          ? `<strong>${user.name}</strong>`
          : `<em style="color:#B2A28C">not set</em>`;
        addBot(
          `<strong>Display name:</strong> ${name}<br><br>` +
          `To change your display name, type:<br>` +
          `<span style="font-family:monospace;background:#F0EFED;padding:2px 8px;border-radius:4px;font-size:11px">/account Your New Name</span>`
        );

      } else if (cmd.startsWith("/account ")) {
        const newName = trimmed.slice(9).trim();
        if (!newName) {
          addBot(`Name can't be empty. Try: <span style="font-family:monospace;background:#F0EFED;padding:2px 8px;border-radius:4px;font-size:11px">/account Your Name</span>`);
          return;
        }
        updateName({ name: newName }).then(() => {
          addBot(`Display name updated to <strong>${newName}</strong>.`);
        }).catch(() => {
          addBot(`Something went wrong. Please try again.`);
        });

      } else if (cmd === "/token") {
        const tgIcon = `<a href="https://t.me/tryagentkbot" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;opacity:0.7;text-decoration:none"><svg width="17" height="17" viewBox="0 0 24 24" fill="#229ED9"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.67l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.978.889z"/></svg></a>`;
        const dcIcon = `<a href="https://discord.com/oauth2/authorize?client_id=1495109864039387226&permissions=18432&integration_type=0&scope=bot+applications.commands" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;opacity:0.7;text-decoration:none"><svg width="17" height="17" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></a>`;
        const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700;font-size:12px">Your Agentk Token</span><span style="display:inline-flex;gap:6px">${tgIcon}${dcIcon}</span></div>`;
        if (tokenRow?.token) {
          const t = tokenRow.token;
          addBot(
            header +
            `<span style="font-family:monospace;background:#F0EFED;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${t}</span>` +
            `&nbsp;<button onclick="navigator.clipboard.writeText('${t}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
            `style="font-size:10px;font-weight:700;color:#DF849D;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
            `<em style="font-size:10px;color:#B2A28C">Open the bot on Telegram or Discord and paste this token to start receiving alerts.</em>`
          );
        } else {
          generateToken().then(({ token }) => {
            addBot(
              header +
              `<span style="font-family:monospace;background:#F0EFED;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${token}</span>` +
              `&nbsp;<button onclick="navigator.clipboard.writeText('${token}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
              `style="font-size:10px;font-weight:700;color:#DF849D;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
              `<em style="font-size:10px;color:#B2A28C">Open the bot on Telegram or Discord and paste this token to start receiving alerts.</em>`
            );
          });
        }

      } else if (cmd === "/delete") {
        addBot(
          `⚠️ <strong>This will permanently delete your account and all data.</strong><br><br>` +
          `Type <span style="font-family:monospace;background:#F0EFED;padding:2px 8px;border-radius:4px;font-size:11px">/delete confirm</span> to proceed.`
        );

      } else if (cmd === "/delete confirm") {
        addBot(`Deleting your account…`);
        deleteAccount().then(() => {
          setTimeout(() => signOut(), 600);
        }).catch(() => {
          addBot(`Something went wrong. Please try again.`);
        });

      } else {
        addBot(`Unknown command. Try <b>/email</b>, <b>/account</b>, <b>/token</b>, or <b>/delete</b>.`);
      }
    }, 250);
  }

  function handleSend() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    setMenuOpen(false);
    dispatch(v);
  }

  if (!open) return null;

  const initial = (user?.email ?? user?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FDF7EF" }}>
      {/* Setup management */}
      <div style={{ padding: "24px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "#fff" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#191918", margin: "0 0 4px" }}>Your setup</p>
        <p style={{ fontSize: "12px", color: "#B2A28C", margin: "0 0 16px" }}>
          {myQueries ? `${myQueries.subreddits.length} subreddits · ${myQueries.queries.length} queries` : "Not configured"}
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => {
              setEditSubs(myQueries?.subreddits ?? []);
              setEditQs(myQueries?.queries ?? []);
              setEditingSetup(true);
            }}
            style={{
              padding: "8px 16px", borderRadius: "10px", border: "1.5px solid rgba(0,0,0,0.1)",
              background: "transparent", fontSize: "13px", fontWeight: 600,
              color: "#3D3A36", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Edit setup
          </button>
          <button
            onClick={async () => {
              if (confirm("This will restart your onboarding. Continue?")) {
                await resetOnboarding({});
                window.location.reload();
              }
            }}
            style={{
              padding: "8px 16px", borderRadius: "10px", border: "1.5px solid rgba(0,0,0,0.1)",
              background: "transparent", fontSize: "13px", fontWeight: 600,
              color: "#B2A28C", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Redo onboarding
          </button>
        </div>
      </div>

      {/* Edit setup modal */}
      {editingSetup && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "min(520px, calc(100vw - 40px))", background: "#fff",
            borderRadius: "20px", padding: "40px", boxSizing: "border-box",
            maxHeight: "85vh", overflowY: "auto",
          }}>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#191918", marginBottom: "24px" }}>Edit setup</p>

            <p style={{ fontSize: "12px", fontWeight: 500, color: "#B2A28C", textTransform: "uppercase", marginBottom: "10px" }}>Subreddits ({editSubs.length}/10)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              {editSubs.map((s, i) => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px 5px 12px", borderRadius: "9999px", background: "#FDF7EF", border: "1px solid rgba(0,0,0,0.08)", fontSize: "13px", fontWeight: 500 }}>
                  r/{s}
                  <button onClick={() => setEditSubs(editSubs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C", padding: "0 0 0 2px" }}>×</button>
                </span>
              ))}
            </div>
            {editSubs.length < 10 && (
              <input
                style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid rgba(0,0,0,0.1)", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "20px" }}
                value={newSub}
                placeholder="Add subreddit and press Enter…"
                onChange={(e) => setNewSub(e.target.value.replace(/^r\//i, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSub.trim()) {
                    setEditSubs([...editSubs, newSub.trim()]);
                    setNewSub("");
                  }
                }}
              />
            )}

            <p style={{ fontSize: "12px", fontWeight: 500, color: "#B2A28C", textTransform: "uppercase", marginBottom: "10px" }}>Queries</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
              {editQs.map((q, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <input
                    style={{ width: "100%", padding: "10px 48px 10px 12px", borderRadius: "10px", border: "1.5px solid rgba(0,0,0,0.1)", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box" }}
                    value={q}
                    maxLength={80}
                    onChange={(e) => { const n = [...editQs]; n[i] = e.target.value; setEditQs(n); }}
                  />
                  <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "#B2A28C" }}>{q.length}/80</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setEditingSetup(false)} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "1.5px solid rgba(0,0,0,0.1)", background: "transparent", fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  await saveQueries({ subreddits: editSubs, queries: editQs });
                  setEditingSetup(false);
                }}
                style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {msgs.map((m, i) => (
          m.from === "bot" ? (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "7px", alignSelf: "flex-start", minWidth: "260px", maxWidth: "88%" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, marginTop: "2px", overflow: "hidden" }}>
                <Image src={logo} alt="agentK" width={24} height={24} style={{ objectFit: "cover" }} />
              </div>
              <div
                dangerouslySetInnerHTML={{ __html: m.html ?? "" }}
                style={{ borderRadius: "16px", borderBottomLeftRadius: "3px", padding: "8px 12px", fontSize: "12px", lineHeight: "1.6", background: "#fff", color: "#191918", border: "1px solid rgba(0,0,0,0.07)", flex: 1, minWidth: 0, wordBreak: "break-word" }}
              />
            </div>
          ) : (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: "7px", alignSelf: "flex-end", maxWidth: "72%" }}>
              <div style={{ borderRadius: "16px", borderBottomRightRadius: "3px", padding: "8px 12px", fontSize: "12px", lineHeight: "1.6", background: "#DF849D", color: "#fff", fontWeight: 600, wordBreak: "break-word" }}>
                {m.text}
              </div>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, background: "#DF849D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, userSelect: "none" }}>
                {initial}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Input bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 12px", background: "#fff", borderTop: "1px solid rgba(0,0,0,0.07)", position: "relative", flexShrink: 0 }}>
        {/* Command menu */}
        {menuOpen && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "#fff", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.08)", padding: "10px", width: "228px", zIndex: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {[
                ["/email",   "Email & auth status"],
                ["/account", "View or rename"],
                ["/token",   "Your alert token"],
                ["/delete",  "Delete account"],
              ].map(([cmd, desc]) => (
                <button key={cmd} onClick={() => { setMenuOpen(false); setInput(""); dispatch(cmd); }}
                  style={{ display: "flex", flexDirection: "column", padding: "8px 10px", borderRadius: "8px", cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FDF7EF")} onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#191918" }}>{cmd}</span>
                  <span style={{ fontSize: "9px", color: "#B2A28C", marginTop: "1px" }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Menu button */}
        <button onClick={() => setMenuOpen(m => !m)} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "none", flexShrink: 0, background: "rgba(0,0,0,0.05)", color: "#62584F", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); if (e.target.value === "/") setMenuOpen(true); else setMenuOpen(false); }}
          onKeyDown={e => { if (e.key === "Enter") handleSend(); if (e.key === "Escape") setMenuOpen(false); }}
          placeholder="Type /command or message…"
          style={{ flex: 1, border: "1px solid rgba(0,0,0,0.1)", borderRadius: "20px", padding: "7px 14px", fontSize: "12px", color: "#191918", outline: "none", fontFamily: "inherit", background: "#FDF7EF" }}
          onFocus={e => (e.currentTarget.style.borderColor = "#DF849D")}
          onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
          autoComplete="off"
          spellCheck={false}
        />

        <button onClick={handleSend} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "none", flexShrink: 0, background: "#DF849D", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
