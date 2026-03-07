/**
 * Admin panel HTML template for managing invite codes.
 * Returns a complete HTML document with embedded CSS and JS.
 *
 * Features:
 *  - Invite code CRUD with usage stats (sessions, messages, last active)
 *  - Admin's own usage stats
 *  - Browse any user's sessions (with model info)
 *  - View full conversation history for any session
 */

export function getAdminHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klaus Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #ffffff; --fg: #0f172a; --border: #e2e8f0;
  --card-bg: #f8fafc; --accent: #020617; --accent-text: #ffffff;
  --accent-hover: #334155; --danger: #dc2626; --danger-hover: #b91c1c;
  --success: #16a34a; --muted: #64748b; --user-bg: #f1f5f9; --bot-bg: #ffffff;
  --font-main: 'Inter', -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'Consolas', 'Monaco', monospace;
}
@media(prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a; --fg: #f8fafc; --border: #334155;
    --card-bg: #1e293b; --accent: #f8fafc; --accent-text: #0f172a;
    --accent-hover: #e2e8f0; --danger: #ef4444; --danger-hover: #dc2626;
    --success: #22c55e; --muted: #94a3b8; --user-bg: #1e293b; --bot-bg: #0f172a;
  }
}
html, body { height: 100%; font-family: var(--font-main); background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; }
#app { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
#header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.brand { font-weight: 600; font-size: 20px; display: flex; align-items: center; gap: 10px; }
.brand-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.brand-icon img { width: 100%; height: 100%; object-fit: contain; border-radius: 6px; }
.header-links { display: flex; gap: 16px; align-items: center; }
.nav-link { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; }
.nav-link:hover { color: var(--fg); }
.section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.breadcrumb { font-size: 14px; color: var(--muted); margin-bottom: 16px; }
.breadcrumb a { color: var(--muted); text-decoration: none; }
.breadcrumb a:hover { color: var(--fg); }
.create-row { display: flex; gap: 10px; margin-bottom: 24px; }
.create-row input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: var(--font-main); background: var(--card-bg); color: var(--fg); outline: none; }
.create-row input:focus { border-color: var(--accent); }
.btn { padding: 10px 18px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: var(--font-main); transition: background 0.15s; }
.btn-primary { background: var(--accent); color: var(--accent-text); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-copy { background: var(--card-bg); color: var(--fg); border: 1px solid var(--border); }
.btn-copy:hover { background: var(--border); }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.btn-danger:hover { background: var(--danger); color: white; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 10px 12px; font-size: 13px; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--border); }
td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
tr.clickable { cursor: pointer; }
tr.clickable:hover { background: var(--card-bg); }
.code-text { font-family: var(--font-mono); font-size: 13px; background: var(--card-bg); padding: 3px 8px; border-radius: 4px; }
.stat { font-family: var(--font-mono); font-size: 13px; }
.stat-muted { color: var(--muted); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.empty { text-align: center; padding: 48px 24px; color: var(--muted); font-size: 15px; }
.stats-row { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; min-width: 140px; cursor: pointer; transition: border-color 0.15s; }
.stat-card:hover { border-color: var(--accent); }
.stat-card .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.stat-card .stat-value { font-size: 22px; font-weight: 600; }
.chat-wrap { border: 1px solid var(--border); border-radius: 10px; max-height: 60vh; overflow-y: auto; padding: 16px; background: var(--card-bg); }
.chat-msg { margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.chat-msg.user { background: var(--user-bg); margin-left: 40px; }
.chat-msg.assistant { background: var(--bot-bg); border: 1px solid var(--border); margin-right: 40px; }
.chat-role { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; letter-spacing: 0.5px; }
.model-tag { font-family: var(--font-mono); font-size: 12px; color: var(--muted); background: var(--card-bg); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 10px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
.toast.show { opacity: 1; }
.view { display: none; }
.view.active { display: block; }
.settings-section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
.setting-row { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
.setting-row:last-child { margin-bottom: 0; }
.setting-label { font-size: 14px; font-weight: 500; min-width: 130px; padding-top: 8px; }
.setting-control { flex: 1; }
.setting-select { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: var(--font-main); background: var(--bg); color: var(--fg); outline: none; }
.setting-select:focus { border-color: var(--accent); }
.setting-textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: var(--font-main); background: var(--bg); color: var(--fg); outline: none; resize: vertical; }
.setting-textarea:focus { border-color: var(--accent); }
</style>
</head>
<body>
<div id="app">
  <div id="header">
    <div class="brand"><div class="brand-icon"><img src="/logo.png" alt="Klaus AI Logo" /></div>Klaus Admin</div>
    <div class="header-links">
      <a class="nav-link" id="back-link" href="#" data-i18n="back_chat">← Chat</a>
    </div>
  </div>
  <div id="view-main" class="view active">
    <h2 class="section-title" data-i18n="settings">Settings</h2>
    <div class="settings-section" id="settings-section">
      <div class="setting-row">
        <label class="setting-label" for="setting-model" data-i18n="default_model">Default Model</label>
        <div class="setting-control">
          <select id="setting-model" class="setting-select"><option value="">Loading...</option></select>
        </div>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="setting-persona" data-i18n="system_prompt">System Prompt</label>
        <div class="setting-control">
          <textarea id="setting-persona" class="setting-textarea" rows="3" data-i18n="persona_placeholder" placeholder="Optional persona / system prompt for Claude"></textarea>
        </div>
      </div>
      <div class="setting-row" style="justify-content:flex-end">
        <button class="btn btn-primary btn-sm" id="save-settings-btn" data-i18n="save_settings">Save Settings</button>
        <span id="settings-status" style="font-size:13px;color:var(--success);margin-left:10px;opacity:0;transition:opacity 0.3s"></span>
      </div>
    </div>

    <h2 class="section-title" style="margin-top:32px" data-i18n="users">Users</h2>
    <div class="stats-row" id="admin-stats"></div>
    <h2 class="section-title" data-i18n="invite_codes">Invite Codes</h2>
    <div class="create-row">
      <input id="label-input" data-i18n="label_placeholder" placeholder="Label (optional, e.g. 'Alice', 'Team A')" maxlength="100">
      <button class="btn btn-primary" id="create-btn" data-i18n="create">Create</button>
    </div>
    <div id="table-wrap"></div>
    <div id="empty" class="empty" style="display:none" data-i18n="no_invites">No invite codes yet. Create one above.</div>
  </div>
  <div id="view-sessions" class="view">
    <div class="breadcrumb"><a href="#" id="bc-home">Admin</a> &rsaquo; <span id="bc-code"></span></div>
    <h2 class="section-title" id="sessions-title" data-i18n="sessions_label">Sessions</h2>
    <div id="sessions-wrap"></div>
  </div>
  <div id="view-history" class="view">
    <div class="breadcrumb"><a href="#" id="bc-home2">Admin</a> &rsaquo; <a href="#" id="bc-sessions"></a> &rsaquo; <span id="bc-session"></span></div>
    <h2 class="section-title" id="history-title" data-i18n="conversation">Conversation</h2>
    <div id="history-wrap" class="chat-wrap"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
  // Verify admin access via cookie session
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function(r) {
      if (!r.ok) { location.href = "/login"; throw new Error("not authenticated"); }
      return r.json();
    })
    .then(function(data) {
      if (data.user.role !== "admin") { location.href = "/"; return; }
      initAdmin();
    })
    .catch(function() {});
  return;

  function initAdmin() {

  // --- i18n ---
  var I18N = {
    en: {
      back_chat: "← Chat",
      settings: "Settings",
      default_model: "Default Model",
      system_prompt: "System Prompt",
      persona_placeholder: "Optional persona / system prompt for Claude",
      save_settings: "Save Settings",
      saved: "Saved!",
      users: "Users",
      sessions_label: "sessions",
      msgs_label: "msgs",
      invite_codes: "Invite Codes",
      label_placeholder: "Label (optional, e.g. 'Alice', 'Team A')",
      create: "Create",
      no_invites: "No invite codes yet. Create one above.",
      code: "Code",
      label: "Label",
      created: "Created",
      actions: "Actions",
      copy_code: "Copy Code",
      delete: "Delete",
      used_codes: "Used Codes",
      used_by: "Used By",
      used_at: "Used At",
      code_copied: "Code copied!",
      confirm_delete: "Delete this invite code?",
      deleted: "Deleted",
      created_copied: "Created! Code copied",
      created_ok: "Created!",
      conversation: "Conversation",
      no_sessions: "No sessions found",
      no_messages: "No messages in this session",
    },
    zh: {
      back_chat: "← 对话",
      settings: "设置",
      default_model: "默认模型",
      system_prompt: "系统提示词",
      persona_placeholder: "可选的人设 / 系统提示词",
      save_settings: "保存设置",
      saved: "已保存!",
      users: "用户",
      sessions_label: "会话",
      msgs_label: "消息",
      invite_codes: "邀请码",
      label_placeholder: "标签 (可选，如 'Alice', 'Team A')",
      create: "创建",
      no_invites: "还没有邀请码，点击上方创建。",
      code: "代码",
      label: "标签",
      created: "创建时间",
      actions: "操作",
      copy_code: "复制",
      delete: "删除",
      used_codes: "已使用",
      used_by: "使用者",
      used_at: "使用时间",
      code_copied: "已复制!",
      confirm_delete: "确定删除此邀请码？",
      deleted: "已删除",
      created_copied: "已创建并复制!",
      created_ok: "已创建!",
      conversation: "对话记录",
      no_sessions: "暂无会话",
      no_messages: "该会话暂无消息",
    }
  };
  var currentLang = localStorage.getItem("klaus_lang") || "en";
  function tt(key) { return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key; }

  // Apply i18n to static elements
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var key = el.getAttribute("data-i18n");
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = tt(key);
    } else {
      el.textContent = tt(key);
    }
  });

  document.getElementById("back-link").href = "/";

  // --- Settings ---
  var modelSelect = document.getElementById("setting-model");
  var personaInput = document.getElementById("setting-persona");
  var saveSettingsBtn = document.getElementById("save-settings-btn");
  var settingsStatus = document.getElementById("settings-status");

  function loadSettings() {
    fetch("/api/admin/settings", { credentials: "same-origin" })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        modelSelect.innerHTML = "";
        (data.availableModels || []).forEach(function(m) {
          var opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.label;
          if (m.id === data.model) opt.selected = true;
          modelSelect.appendChild(opt);
        });
        personaInput.value = data.persona || "";
      });
  }

  saveSettingsBtn.onclick = function() {
    saveSettingsBtn.disabled = true;
    fetch("/api/admin/settings", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelSelect.value, persona: personaInput.value.trim() }),
    })
      .then(function(r) { return r.json(); })
      .then(function() {
        settingsStatus.textContent = tt("saved");
        settingsStatus.style.opacity = "1";
        setTimeout(function() { settingsStatus.style.opacity = "0"; }, 2000);
      })
      .catch(function() {
        settingsStatus.textContent = "Failed";
        settingsStatus.style.color = "var(--danger)";
        settingsStatus.style.opacity = "1";
        setTimeout(function() { settingsStatus.style.opacity = "0"; settingsStatus.style.color = "var(--success)"; }, 2000);
      })
      .finally(function() { saveSettingsBtn.disabled = false; });
  };

  loadSettings();

  var views = { main: document.getElementById("view-main"), sessions: document.getElementById("view-sessions"), history: document.getElementById("view-history") };
  var tableWrap = document.getElementById("table-wrap");
  var emptyEl = document.getElementById("empty");
  var createBtn = document.getElementById("create-btn");
  var labelInput = document.getElementById("label-input");
  var toastEl = document.getElementById("toast");
  var adminStatsEl = document.getElementById("admin-stats");
  var sessionsWrap = document.getElementById("sessions-wrap");
  var historyWrap = document.getElementById("history-wrap");
  var toastTimer;
  var currentView = "main";

  function esc(s) { if (s == null) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function showToast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function() { toastEl.classList.remove("show"); }, 2000); }
  function fmtDate(ts) { if (!ts) return "-"; return new Date(ts).toLocaleString(); }
  function fmtRelative(ts) { if (!ts) return "-"; var d = Date.now() - ts; if (d < 60000) return "just now"; if (d < 3600000) return Math.floor(d/60000) + "m ago"; if (d < 86400000) return Math.floor(d/3600000) + "h ago"; return Math.floor(d/86400000) + "d ago"; }
  function showView(name) {
    currentView = name;
    Object.keys(views).forEach(function(k) { views[k].classList.toggle("active", k === name); });
  }

  function api(path, method, params) {
    var qs = "";
    var opts = { method: method || "GET", credentials: "same-origin" };
    if (method === "POST" || method === "PATCH") {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(params || {});
    } else if (method === "DELETE" && params) {
      var pairs = [];
      Object.keys(params).forEach(function(k) { pairs.push(k + "=" + encodeURIComponent(params[k])); });
      qs = pairs.join("&");
    } else if (params) {
      var pairs2 = [];
      Object.keys(params).forEach(function(k) { pairs2.push(k + "=" + encodeURIComponent(params[k])); });
      qs = pairs2.join("&");
    }
    var url = "/api/admin/" + path + (qs ? "?" + qs : "");
    return fetch(url, opts).then(function(r) { return r.json(); });
  }

  // --- Main view: users + invite codes ---
  function renderMain(usersData, invitesData) {
    var users = usersData.users || [];
    var codes = invitesData.invites || [];

    // User stats cards
    adminStatsEl.innerHTML = users.map(function(u) {
      return "<div class='stat-card' data-uid='" + esc(u.id) + "'>"
        + "<div class='stat-label'>" + esc(u.displayName) + " <span style='font-size:10px;text-transform:none'>(" + esc(u.role) + ")</span></div>"
        + "<div class='stat-value'>" + esc(String(u.sessionCount || 0)) + " <span style='font-size:14px;font-weight:400;color:var(--muted)'>" + tt("sessions_label") + "</span></div>"
        + "<div style='font-size:13px;color:var(--muted);margin-top:4px'>" + esc(u.email) + " &middot; " + esc(String(u.totalMessages || 0)) + " " + tt("msgs_label") + "</div>"
        + "</div>";
    }).join("");

    adminStatsEl.querySelectorAll(".stat-card[data-uid]").forEach(function(card) {
      card.onclick = function() { openSessions(card.dataset.uid, users.find(function(u) { return u.id === card.dataset.uid; })?.displayName || "User"); };
    });

    // Invite codes table
    if (!codes.length) { tableWrap.innerHTML = ""; emptyEl.style.display = "block"; return; }
    emptyEl.style.display = "none";

    var activeCodes = codes.filter(function(c) { return c.isActive; });
    var usedCodes = codes.filter(function(c) { return !c.isActive; });

    var html = "";

    // Active invite codes
    if (activeCodes.length) {
      html += "<table><thead><tr><th>" + tt("code") + "</th><th>" + tt("label") + "</th><th>" + tt("created") + "</th><th>" + tt("actions") + "</th></tr></thead><tbody>";
      activeCodes.forEach(function(c) {
        html += "<tr>"
          + "<td><span class='code-text'>" + esc(c.code.slice(0,8)) + "...</span></td>"
          + "<td>" + esc(c.label || "-") + "</td>"
          + "<td class='stat-muted'>" + esc(fmtRelative(c.createdAt)) + "</td>"
          + "<td><div class='actions'>"
          + "<button class='btn btn-sm btn-copy' data-code='" + esc(c.code) + "'>" + tt("copy_code") + "</button>"
          + "<button class='btn btn-sm btn-danger' data-del='" + esc(c.code) + "'>" + tt("delete") + "</button>"
          + "</div></td></tr>";
      });
      html += "</tbody></table>";
    }

    // Used invite codes history
    if (usedCodes.length) {
      html += "<div style='margin-top:20px;font-weight:600;font-size:14px;color:var(--muted)'>" + tt("used_codes") + "</div>";
      html += "<table><thead><tr><th>" + tt("code") + "</th><th>" + tt("label") + "</th><th>" + tt("used_by") + "</th><th>" + tt("used_at") + "</th></tr></thead><tbody>";
      usedCodes.forEach(function(c) {
        html += "<tr style='opacity:0.7'>"
          + "<td><span class='code-text'>" + esc(c.code.slice(0,8)) + "...</span></td>"
          + "<td>" + esc(c.label || "-") + "</td>"
          + "<td>" + esc(c.usedBy || "-") + "</td>"
          + "<td class='stat-muted'>" + (c.usedAt ? esc(fmtRelative(c.usedAt)) : "-") + "</td>"
          + "</tr>";
      });
      html += "</tbody></table>";
    }

    tableWrap.innerHTML = html;
  }

  tableWrap.addEventListener("click", function(e) {
    var btn = e.target.closest("button");
    if (btn) {
      e.stopPropagation();
      if (btn.dataset.code) {
        navigator.clipboard.writeText(btn.dataset.code).then(function() { showToast(tt("code_copied")); });
      } else if (btn.dataset.del) {
        if (!confirm(tt("confirm_delete"))) return;
        api("invites", "DELETE", { code: btn.dataset.del }).then(function() { loadMain(); showToast(tt("deleted")); });
      }
    }
  });

  function loadMain() {
    Promise.all([api("users", "GET"), api("invites", "GET")]).then(function(results) {
      renderMain(results[0], results[1]);
    });
  }

  createBtn.onclick = function() {
    var label = labelInput.value.trim();
    api("invites", "POST", { label: label }).then(function(data) {
      labelInput.value = "";
      if (data.invite) {
        navigator.clipboard.writeText(data.invite.code).then(function() {
          showToast(tt("created_copied"));
        }).catch(function() { showToast(tt("created_ok")); });
      }
      loadMain();
    });
  };
  labelInput.addEventListener("keydown", function(e) { if (e.key === "Enter") createBtn.onclick(); });

  // --- Sessions view ---
  var sessUserId = "", sessLabel = "";

  function openSessions(userId, label) {
    sessUserId = userId; sessLabel = label;
    document.getElementById("bc-code").textContent = label;
    document.getElementById("sessions-title").textContent = label + " — Sessions";
    showView("sessions");
    sessionsWrap.innerHTML = "<div class='empty'>Loading...</div>";
    api("sessions", "GET", { userId: userId }).then(function(data) { renderSessions(data.sessions || []); });
  }

  function renderSessions(sessions) {
    if (!sessions.length) { sessionsWrap.innerHTML = "<div class='empty'>" + esc(tt("no_sessions")) + "</div>"; return; }
    var html = "<table><thead><tr><th>Title</th><th>Messages</th><th>Model</th><th>Last Updated</th></tr></thead><tbody>";
    sessions.forEach(function(s) {
      html += "<tr class='clickable' data-sid='" + esc(s.sessionId) + "' data-stitle='" + esc(s.title) + "'>"
        + "<td>" + esc(s.title) + "</td>"
        + "<td class='stat'>" + esc(String(s.messageCount)) + "</td>"
        + "<td>" + (s.model ? "<span class='model-tag'>" + esc(s.model) + "</span>" : "<span class='stat-muted'>-</span>") + "</td>"
        + "<td class='stat-muted'>" + esc(fmtRelative(s.updatedAt)) + "</td>"
        + "</tr>";
    });
    html += "</tbody></table>";
    sessionsWrap.innerHTML = html;
  }

  sessionsWrap.addEventListener("click", function(e) {
    var row = e.target.closest("tr[data-sid]");
    if (row) { openHistory(row.dataset.sid, row.dataset.stitle); }
  });

  document.getElementById("bc-home").onclick = function(e) { e.preventDefault(); showView("main"); };

  // --- History view ---
  function openHistory(sessionId, title) {
    document.getElementById("bc-sessions").textContent = sessLabel;
    document.getElementById("bc-sessions").onclick = function(e) { e.preventDefault(); openSessions(sessUserId, sessLabel); };
    document.getElementById("bc-session").textContent = title;
    document.getElementById("history-title").textContent = title;
    showView("history");
    historyWrap.innerHTML = "<div class='empty'>Loading...</div>";
    api("history", "GET", { userId: sessUserId, sessionId: sessionId }).then(function(data) { renderHistory(data.messages || []); });
  }

  function renderMd(text) {
    var s = esc(text);
    s = s.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, function(_,lang,code) { return "<pre><code>" + code.replace(/\\n$/,"") + "</code></pre>"; });
    s = s.replace(/\`([^\`]+)\`/g, function(_,c) { return "<code>"+c+"</code>"; });
    s = s.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    var parts = s.split(/(<pre>[\\s\\S]*?<\\/pre>)/g);
    return parts.map(function(p,i) { return i%2===0 ? p.replace(/\\n/g,"<br>") : p; }).join("");
  }

  function renderHistory(messages) {
    if (!messages.length) { historyWrap.innerHTML = "<div class='empty'>" + esc(tt("no_messages")) + "</div>"; return; }
    var html = "";
    messages.forEach(function(m) {
      html += "<div class='chat-msg " + esc(m.role) + "'>"
        + "<div class='chat-role'>" + esc(m.role) + "</div>"
        + renderMd(m.content)
        + "</div>";
    });
    historyWrap.innerHTML = html;
  }

  document.getElementById("bc-home2").onclick = function(e) { e.preventDefault(); showView("main"); };

  // --- Init ---
  loadMain();

  } // end initAdmin
})();
<\/script>
</body>
</html>`;
}
