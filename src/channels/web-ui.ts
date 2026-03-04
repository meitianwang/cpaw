/**
 * Chat UI HTML template for the web channel.
 * Returns a complete HTML document with embedded CSS and JS.
 */

export function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Klaus Chat</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#fff;--fg:#1a1a1a;--msg-user:#e3f2fd;--msg-bot:#f5f5f5;--border:#e0e0e0;--input-bg:#fff;--accent:#1976d2;--code-bg:#f5f5f5;--thinking:#888}
@media(prefers-color-scheme:dark){
  :root{--bg:#1a1a1a;--fg:#e0e0e0;--msg-user:#1e3a5f;--msg-bot:#2a2a2a;--border:#333;--input-bg:#2a2a2a;--accent:#64b5f6;--code-bg:#2a2a2a;--thinking:#999}
}
html,body{height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg)}
#app{display:flex;flex-direction:column;height:100%;max-width:800px;margin:0 auto}
#header{padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between}
#header .status{font-size:12px;font-weight:400;color:var(--thinking)}
#messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;word-wrap:break-word;white-space:pre-wrap}
.msg.user{align-self:flex-end;background:var(--msg-user);border-bottom-right-radius:4px}
.msg.assistant{align-self:flex-start;background:var(--msg-bot);border-bottom-left-radius:4px}
.msg.error{align-self:center;background:#ffebee;color:#c62828;font-size:12px;border-radius:8px}
.msg code{font-family:"SF Mono",Monaco,Consolas,monospace;font-size:13px;background:var(--code-bg);padding:1px 4px;border-radius:3px}
.msg pre{background:var(--code-bg);padding:10px;border-radius:6px;overflow-x:auto;margin:6px 0}
.msg pre code{background:none;padding:0}
.msg a{color:var(--accent)}
.thinking{align-self:flex-start;padding:10px 14px;color:var(--thinking);font-size:13px;font-style:italic}
.thinking::after{content:"";animation:dots 1.2s infinite}
@keyframes dots{0%{content:""}33%{content:"."}66%{content:".."}100%{content:"..."}}
#input-area{padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end}
#input{flex:1;resize:none;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--input-bg);color:var(--fg);max-height:120px;min-height:40px;line-height:1.4;outline:none}
#input:focus{border-color:var(--accent)}
#send{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer;white-space:nowrap}
#send:disabled{opacity:0.5;cursor:not-allowed}
</style>
</head>
<body>
<div id="app">
  <div id="header">
    <span>Klaus</span>
    <span class="status" id="status">connected</span>
  </div>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" rows="1" placeholder="Type a message..." autocomplete="off"></textarea>
    <button id="send">Send</button>
  </div>
</div>
<script>
(function(){
  const token = new URLSearchParams(location.search).get("token");
  if (!token) { document.body.innerHTML = "<p style='padding:40px;text-align:center'>Missing token parameter.</p>"; return; }

  const msgs = document.getElementById("messages");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const statusEl = document.getElementById("status");
  let busy = false;

  // Auto-resize textarea
  input.addEventListener("input", function(){ this.style.height="auto"; this.style.height=Math.min(this.scrollHeight,120)+"px"; });

  // SSE connection
  const es = new EventSource("/api/events?token="+encodeURIComponent(token));
  es.onopen = () => { statusEl.textContent = "connected"; };
  es.onerror = () => { statusEl.textContent = "reconnecting..."; };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "ping") return;
    removeThinking();
    if (data.type === "message") { appendMsg("assistant", data.text); busy = false; updateBtn(); }
    else if (data.type === "merged") { busy = false; updateBtn(); }
    else if (data.type === "error") { appendMsg("error", data.message); busy = false; updateBtn(); }
  };

  // Send message
  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    appendMsg("user", text);
    input.value = ""; input.style.height = "auto";
    busy = true; updateBtn(); showThinking();
    try {
      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, text })
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); appendMsg("error", d.error||"Request failed"); removeThinking(); busy=false; updateBtn(); }
    } catch(err) { appendMsg("error", "Network error"); removeThinking(); busy=false; updateBtn(); }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  function updateBtn() { sendBtn.disabled = busy; }

  function showThinking() {
    if (document.getElementById("thinking")) return;
    const el = document.createElement("div");
    el.className = "thinking"; el.id = "thinking"; el.textContent = "Thinking";
    msgs.appendChild(el); scrollBottom();
  }
  function removeThinking() { const el = document.getElementById("thinking"); if (el) el.remove(); }

  function appendMsg(role, text) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.innerHTML = role === "user" ? escHtml(text) : renderMd(text);
    msgs.appendChild(el); scrollBottom();
  }

  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }

  function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderMd(text) {
    // Escape HTML first, then selectively re-introduce safe markup
    text = escHtml(text);
    // Code blocks (triple backtick fences)
    text = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, (_,lang,code) =>
      "<pre><code>" + code.replace(/\\n$/,"") + "</code></pre>");
    // Inline code
    text = text.replace(/\`([^\`]+)\`/g, (_,c) => "<code>"+c+"</code>");
    // Bold
    text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    // Italic (no lookbehind for browser compat)
    text = text.replace(/(?:^|[^*])\\*([^*]+)\\*(?:[^*]|$)/g, (m,c) =>
      m.replace("*"+c+"*", "<em>"+c+"</em>"));
    // Links (only allow http/https protocols)
    text = text.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Line breaks (preserve newlines that aren't in pre blocks)
    const parts = text.split(/(<pre>[\\s\\S]*?<\\/pre>)/g);
    return parts.map((p,i) => i%2===0 ? p.replace(/\\n/g,"<br>") : p).join("");
  }
})();
</script>
</body>
</html>`;
}
