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

  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [input,    setInput]    = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [booted,   setBooted]   = useState(false);

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
<b>/token</b> — your Telegram alert token<br>
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
        const email    = user?.email ?? "<em style='color:rgba(255,255,255,0.6)'>not set</em>";
        const provider = authProvider === "google" ? "Google" : authProvider === "password" ? "Email / Password" : authProvider ?? "Unknown";
        addBot(
          `<strong>Email:</strong> ${email}<br><br>` +
          `<strong>Auth provider:</strong> ${provider}`
        );

      } else if (cmd === "/account") {
        const name = user?.name
          ? `<strong>${user.name}</strong>`
          : `<em style="color:rgba(255,255,255,0.6)">not set</em>`;
        addBot(
          `<strong>Display name:</strong> ${name}<br><br>` +
          `To change your display name, type:<br>` +
          `<span style="font-family:monospace;background:rgba(255,255,255,0.25);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">/account Your New Name</span>`
        );

      } else if (cmd.startsWith("/account ")) {
        const newName = trimmed.slice(9).trim();
        if (!newName) {
          addBot(`Name can't be empty. Try: <span style="font-family:monospace;background:rgba(255,255,255,0.25);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">/account Your Name</span>`);
          return;
        }
        updateName({ name: newName }).then(() => {
          addBot(`Display name updated to <strong>${newName}</strong>.`);
        }).catch(() => {
          addBot(`Something went wrong. Please try again.`);
        });

      } else if (cmd === "/token") {
        if (tokenRow?.token) {
          const t = tokenRow.token;
          addBot(
            `Your Agentk Token:<br><br>` +
            `<span style="font-family:monospace;background:rgba(255,255,255,0.25);color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${t}</span>` +
            `&nbsp;<button onclick="navigator.clipboard.writeText('${t}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
            `style="font-size:10px;font-weight:700;color:#fff;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
            `<em style="font-size:10px;color:rgba(255,255,255,0.7)">Open @AgentKBot on Telegram and paste this token to start receiving alerts.</em>`
          );
        } else {
          generateToken().then(({ token }) => {
            addBot(
              `Your Agentk Token:<br><br>` +
              `<span style="font-family:monospace;background:rgba(255,255,255,0.25);color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${token}</span>` +
              `&nbsp;<button onclick="navigator.clipboard.writeText('${token}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
              `style="font-size:10px;font-weight:700;color:#fff;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
              `<em style="font-size:10px;color:rgba(255,255,255,0.7)">Open @AgentKBot on Telegram and paste this token to start receiving alerts.</em>`
            );
          });
        }

      } else if (cmd === "/delete") {
        addBot(
          `⚠️ <strong>This will permanently delete your account and all data.</strong><br><br>` +
          `Type <span style="font-family:monospace;background:rgba(255,255,255,0.25);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">/delete confirm</span> to proceed.`
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

  const initial = (user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FDF7EF" }}>
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
                style={{ borderRadius: "16px", borderBottomLeftRadius: "3px", padding: "8px 12px", fontSize: "12px", lineHeight: "1.6", background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", border: "none", flex: 1, minWidth: 0, wordBreak: "break-word" }}
              />
            </div>
          ) : (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: "7px", alignSelf: "flex-end", maxWidth: "72%" }}>
              <div style={{ borderRadius: "16px", borderBottomRightRadius: "3px", padding: "8px 12px", fontSize: "12px", lineHeight: "1.6", background: "#DF849D", color: "#fff", fontWeight: 600, wordBreak: "break-word" }}>
                {m.text}
              </div>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, background: "#DF849D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800 }}>
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

        <button onClick={handleSend} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "none", flexShrink: 0, background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
