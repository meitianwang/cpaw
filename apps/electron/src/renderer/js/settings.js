// Klaus Desktop — Settings Panel (fully aligned with Web端)
// Tabs: Models, Prompts, Channels, Skills, MCP, Tasks, Preferences

const settingsApi = window.klaus.settings
let settingsVisible = false
let currentSettingsTab = 'models'

function toggleSettings() {
  settingsVisible = !settingsVisible
  const view = document.getElementById('settings-view')
  if (settingsVisible) { view.classList.add('active'); loadSettingsTab(currentSettingsTab) }
  else { view.classList.remove('active') }
}

function loadSettingsTab(tab) {
  currentSettingsTab = tab
  document.querySelectorAll('.settings-nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.stab === tab))
  const content = document.getElementById('settings-content')
  switch (tab) {
    case 'models': loadModelsTab(content); break
    case 'prompts': loadPromptsTab(content); break
    case 'channels': loadChannelsTab(content); break
    case 'skills': loadSkillsTab(content); break
    case 'mcp': loadMcpTab(content); break
    case 'cron': loadCronTab(content); break
    case 'preferences': loadPreferencesTab(content); break
  }
}

// ==================== Models ====================
async function loadModelsTab(container) {
  const models = await settingsApi.models.list()
  container.innerHTML = `<div class="settings-section"><div class="settings-section-header"><h3>Models</h3><button class="btn-sm" onclick="showAddModelForm()">+ Add Model</button></div><div id="models-list">${models.length === 0 ? '<p class="empty-text">No models configured</p>' : models.map(m => `
    <div class="settings-card ${m.isDefault ? 'card-default' : ''}">
      <div class="card-header"><strong>${esc(m.name)}</strong>${m.isDefault ? '<span class="badge">Default</span>' : ''}${m.role ? `<span class="s-badge s-badge-blue">${esc(m.role)}</span>` : ''}</div>
      <div class="card-meta">${esc(m.provider || 'anthropic')} / ${esc(m.model)} &middot; ${m.maxContextTokens.toLocaleString()} tokens &middot; thinking: ${esc(m.thinking)}</div>
      <div class="card-actions">${!m.isDefault ? `<button class="btn-xs" onclick="setDefaultModel('${esc(m.id)}')">Set Default</button>` : ''}<button class="btn-xs btn-danger" onclick="deleteModel('${esc(m.id)}')">Delete</button></div>
    </div>`).join('')}</div><div id="model-form" style="display:none"></div></div>`
}

window.showAddModelForm = function() {
  const form = document.getElementById('model-form'); form.style.display = 'block'
  form.innerHTML = `<div class="settings-card"><h4 style="margin-bottom:12px">Add Model</h4>
    <div class="form-row"><label>Name</label><input id="mf-name" placeholder="My Claude Model"></div>
    <div class="form-row"><label>Model ID</label><input id="mf-model" placeholder="claude-sonnet-4-20250514"></div>
    <div class="form-row"><label>API Key</label><input id="mf-apikey" type="password" placeholder="sk-ant-..."></div>
    <div class="form-row"><label>Provider</label><select id="mf-provider"><option value="anthropic">Anthropic</option><option value="bedrock">AWS Bedrock</option><option value="vertex">Google Vertex</option></select></div>
    <div class="form-row"><label>Base URL (optional)</label><input id="mf-baseurl" placeholder="https://api.anthropic.com"></div>
    <div class="form-row"><label>Max Context Tokens</label><input id="mf-tokens" type="number" value="200000"></div>
    <div class="form-row"><label>Thinking</label><select id="mf-thinking"><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    <div class="form-actions"><button class="btn-sm btn-primary" onclick="saveModel()">Save</button><button class="btn-sm" onclick="document.getElementById('model-form').style.display='none'">Cancel</button></div></div>`
}

window.saveModel = async function() {
  const now = Date.now()
  await settingsApi.models.upsert({ id: crypto.randomUUID(), name: gv('mf-name') || 'Untitled', provider: gv('mf-provider'), model: gv('mf-model') || 'claude-sonnet-4-20250514', apiKey: gv('mf-apikey') || undefined, baseUrl: gv('mf-baseurl') || undefined, maxContextTokens: parseInt(gv('mf-tokens')) || 200000, thinking: gv('mf-thinking'), isDefault: false, createdAt: now, updatedAt: now })
  loadSettingsTab('models')
}
window.setDefaultModel = async (id) => { await settingsApi.models.setDefault(id); loadSettingsTab('models') }
window.deleteModel = async (id) => { if (confirm('Delete this model?')) { await settingsApi.models.delete(id); loadSettingsTab('models') } }

// ==================== Prompts ====================
async function loadPromptsTab(container) {
  const prompts = await settingsApi.prompts.list()
  container.innerHTML = `<div class="settings-section"><h3>System Prompt Sections</h3><p class="hint-text">Customize sections of the system prompt. Leave empty to use engine defaults.</p><div id="prompts-list">${prompts.map(p => `
    <div class="settings-card"><div class="card-header"><strong>${esc(p.name)}</strong><span style="font-size:11px;color:var(--fg-quaternary)">${esc(p.id)}</span></div>
    <textarea class="prompt-editor" data-prompt-id="${esc(p.id)}" placeholder="(using engine default)" rows="4">${esc(p.content)}</textarea>
    <button class="btn-xs" onclick="savePrompt('${esc(p.id)}','${esc(p.name)}',this)">Save</button></div>`).join('')}</div></div>`
}
window.savePrompt = async function(id, name, btn) {
  const textarea = btn.parentElement.querySelector('.prompt-editor')
  const now = Date.now()
  await settingsApi.prompts.upsert({ id, name, content: textarea.value, isDefault: false, createdAt: now, updatedAt: now })
  btn.textContent = 'Saved!'; setTimeout(() => btn.textContent = 'Save', 1500)
}

// ==================== Channels ====================
async function loadChannelsTab(container) {
  let channels = []
  try { channels = await window.klaus.channels.list() } catch {}
  const chConfigs = [
    { id: 'feishu', name: 'Feishu', icon: '💬', inputs: [['app_id','App ID'],['app_secret','App Secret']] },
    { id: 'dingtalk', name: 'DingTalk', icon: '💬', inputs: [['client_id','Client ID'],['client_secret','Client Secret']] },
    { id: 'wechat', name: 'WeChat', icon: '💬', inputs: [] },
    { id: 'wecom', name: 'WeCom', icon: '💬', inputs: [['bot_id','Bot ID'],['secret','Secret']] },
    { id: 'qq', name: 'QQ', icon: '💬', inputs: [['app_id','App ID'],['client_secret','Client Secret']] },
    { id: 'telegram', name: 'Telegram', icon: '💬', inputs: [['bot_token','Bot Token']] },
  ]
  container.innerHTML = `<div class="settings-section"><h3>IM Channels</h3><p class="hint-text">Connect messaging platforms to Klaus.</p><div class="ch-grid">${chConfigs.map(ch => {
    const connected = channels.find(c => c.id === ch.id && c.connected)
    return `<div class="ch-card"><div class="ch-card-header"><span style="font-size:20px">${ch.icon}</span><span class="ch-card-name">${ch.name}</span><span class="ch-card-status">${connected ? '<span class="s-badge s-badge-green">Connected</span>' : '<span class="s-badge s-badge-gray">Off</span>'}</span></div>
    <div class="ch-card-body">${connected ? `<button class="btn-xs btn-danger" onclick="disconnectChannel('${ch.id}')">Disconnect</button>` : ch.inputs.map(([key, label]) => `<div class="ch-form-field"><label>${label}</label><input id="ch-${ch.id}-${key}" placeholder="${label}"></div>`).join('') + (ch.inputs.length ? `<button class="btn-xs" onclick="connectChannel('${ch.id}')">Connect</button>` : '<p class="s-muted" style="font-size:12px">QR code login required</p>')}</div></div>`
  }).join('')}</div></div>`
}
window.connectChannel = async function(id) {
  const chConfigs = { feishu: ['app_id','app_secret'], dingtalk: ['client_id','client_secret'], wecom: ['bot_id','secret'], qq: ['app_id','client_secret'], telegram: ['bot_token'] }
  const inputs = chConfigs[id] || []
  const config = {}
  for (const key of inputs) { config[key] = document.getElementById('ch-' + id + '-' + key)?.value?.trim() || '' }
  const result = await window.klaus.channels.connect(id, config)
  if (result.ok) { showToast('Connected!'); loadSettingsTab('channels') }
  else { showToast(result.error || 'Connection failed') }
}
window.disconnectChannel = async function(id) {
  if (!confirm('Disconnect this channel?')) return
  await window.klaus.channels.disconnect(id)
  showToast('Disconnected'); loadSettingsTab('channels')
}

// ==================== Skills ====================
async function loadSkillsTab(container) {
  let skills = []
  try { skills = await window.klaus.skills.list() } catch {}
  container.innerHTML = `<div class="settings-section"><div class="settings-section-header"><h3>Skills</h3></div>
    ${skills.length === 0 ? '<p class="empty-text">No skills installed</p>' : `<div class="sk-grid">${skills.map(s => `
    <div class="sk-card"><div class="sk-card-head"><div class="sk-card-info"><div class="sk-card-emoji">🧩</div><div class="sk-card-name">${esc(s.name)}</div></div>
    <label class="sk-toggle"><input type="checkbox" class="sk-toggle-input" data-skill="${esc(s.name)}" ${s.enabled ? 'checked' : ''}><span class="sk-slider"></span></label></div>
    <div class="sk-card-desc">${esc(s.description || '')}</div>
    <div class="sk-card-badges"><span class="s-badge s-badge-gray">${esc(s.source || 'installed')}</span></div></div>`).join('')}</div>`}</div>`
  container.querySelectorAll('.sk-toggle-input').forEach(el => {
    el.addEventListener('change', async () => {
      await window.klaus.skills.toggle(el.dataset.skill, el.checked)
      showToast(el.checked ? 'Skill enabled' : 'Skill disabled')
    })
  })
}

// ==================== MCP ====================
async function loadMcpTab(container) {
  let servers = []
  try { servers = await window.klaus.mcp.status() } catch {}
  container.innerHTML = `<div class="settings-section"><div class="settings-section-header"><h3>MCP Servers</h3><button class="btn-sm" onclick="window.klaus.mcp.reconnect().then(()=>{showToast('Reconnected');loadSettingsTab('mcp')})">Reconnect All</button></div>
    <p class="hint-text">MCP servers are configured in ~/.klaus/.mcp.json</p>
    ${servers.length === 0 ? '<p class="empty-text">No MCP servers connected</p>' : `<div class="sk-grid">${servers.map(s => `
    <div class="sk-card"><div class="sk-card-head"><div class="sk-card-info"><div class="sk-card-emoji">🔌</div><div class="sk-card-name">${esc(s.name)}</div></div></div>
    <div class="sk-card-desc">${s.toolCount} tool${s.toolCount === 1 ? '' : 's'}</div>
    <div class="sk-card-badges"><span class="s-badge ${s.status === 'connected' ? 's-badge-green' : 's-badge-red'}">${esc(s.status)}</span></div></div>`).join('')}</div>`}</div>`
}

// ==================== Cron Tasks ====================
async function loadCronTab(container) {
  const tasks = await settingsApi.cron.list()
  container.innerHTML = `<div class="settings-section"><div class="settings-section-header"><h3>Scheduled Tasks</h3><button class="btn-sm" id="cron-add-btn">+ New Task</button></div>
    <div id="cron-form" style="display:none"><div class="settings-card">
      <div class="form-row"><label>Task ID</label><input id="cf-id" placeholder="my-task"></div>
      <div class="form-row"><label>Name (optional)</label><input id="cf-name" placeholder="Friendly name"></div>
      <div class="form-row"><label>Schedule (cron)</label><input id="cf-schedule" placeholder="0 9 * * *"></div>
      <div class="form-row"><label>Prompt</label><textarea id="cf-prompt" rows="3" class="prompt-editor" placeholder="What should the agent do?"></textarea></div>
      <div class="form-actions"><button class="btn-sm btn-primary" id="cf-save">Save</button><button class="btn-sm" id="cf-cancel">Cancel</button></div></div></div>
    <div id="cron-list">${tasks.length === 0 ? '<p class="empty-text">No scheduled tasks</p>' : `<table class="s-table"><thead><tr><th>ID</th><th>Name</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody>${tasks.map(t => `
    <tr><td><span class="s-code">${esc(t.id)}</span></td><td>${esc(t.name || '-')}</td><td class="s-muted">${esc(t.schedule)}</td>
    <td>${t.enabled ? '<span class="s-badge s-badge-green">On</span>' : '<span class="s-badge s-badge-gray">Off</span>'}</td>
    <td><div class="s-actions"><button class="s-btn s-btn-ghost" onclick="toggleCron('${esc(t.id)}',${t.enabled ? 'false' : 'true'})">${t.enabled ? 'Disable' : 'Enable'}</button><button class="s-btn s-btn-danger" onclick="deleteCron('${esc(t.id)}')">Delete</button></div></td></tr>`).join('')}</tbody></table>`}</div></div>`
  document.getElementById('cron-add-btn')?.addEventListener('click', () => { document.getElementById('cron-form').style.display = 'block' })
  document.getElementById('cf-cancel')?.addEventListener('click', () => { document.getElementById('cron-form').style.display = 'none' })
  document.getElementById('cf-save')?.addEventListener('click', async () => {
    const id = gv('cf-id'), schedule = gv('cf-schedule'), prompt = gv('cf-prompt')
    if (!id || !schedule || !prompt) return
    await settingsApi.cron.upsert({ id, name: gv('cf-name') || undefined, schedule, prompt, enabled: true, createdAt: Date.now(), updatedAt: Date.now() })
    showToast('Task saved'); loadSettingsTab('cron')
  })
}
window.toggleCron = async function(id, enabled) {
  const tasks = await settingsApi.cron.list()
  const t = tasks.find(x => x.id === id)
  if (t) { await settingsApi.cron.upsert({ ...t, enabled: enabled === 'true' || enabled === true, updatedAt: Date.now() }); loadSettingsTab('cron') }
}
window.deleteCron = async function(id) { if (confirm('Delete this task?')) { await settingsApi.cron.delete(id); showToast('Deleted'); loadSettingsTab('cron') } }

// ==================== Preferences ====================
async function loadPreferencesTab(container) {
  const lang = await settingsApi.kv.get('language') || 'en'
  const theme = await settingsApi.kv.get('theme') || 'light'
  const permMode = await settingsApi.kv.get('permission_mode') || 'default'

  container.innerHTML = `<div class="settings-section"><h3>Preferences</h3>
    <div class="settings-field"><label class="settings-field-label">Color mode</label>
      <div class="settings-theme-options" id="theme-options">
        <div class="settings-theme-card ${theme === 'light' ? 'active' : ''}" data-theme="light"><div class="settings-theme-preview settings-theme-preview-light"></div><div class="settings-theme-label">Light</div></div>
        <div class="settings-theme-card ${theme === 'dark' ? 'active' : ''}" data-theme="dark"><div class="settings-theme-preview settings-theme-preview-dark"></div><div class="settings-theme-label">Dark</div></div>
      </div></div>
    <div class="settings-field"><label class="settings-field-label">Permission Mode</label>
      <div id="perm-options">
        <div class="settings-perm-card ${permMode === 'default' ? 'active' : ''}" data-perm="default"><div class="settings-perm-icon">🛡</div><div><div class="settings-perm-label">Default</div><div class="settings-perm-desc">Ask permission for potentially risky operations</div></div></div>
        <div class="settings-perm-card ${permMode === 'auto' ? 'active' : ''}" data-perm="auto"><div class="settings-perm-icon">⚡</div><div><div class="settings-perm-label">Auto</div><div class="settings-perm-desc">Automatically approve safe operations</div></div></div>
        <div class="settings-perm-card ${permMode === 'bypassPermissions' ? 'active' : ''}" data-perm="bypassPermissions"><div class="settings-perm-icon">🔓</div><div><div class="settings-perm-label">Bypass All</div><div class="settings-perm-desc">Skip all permission prompts (use with caution)</div></div></div>
      </div></div>
    <div class="settings-field"><label class="settings-field-label">Language</label>
      <div class="settings-theme-options">
        <div class="settings-theme-card ${lang === 'en' ? 'active' : ''}" data-lang="en"><div class="settings-theme-label">English</div></div>
        <div class="settings-theme-card ${lang === 'zh' ? 'active' : ''}" data-lang="zh"><div class="settings-theme-label">中文</div></div>
      </div></div></div>`

  // Theme selection
  container.querySelector('#theme-options')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.settings-theme-card')
    if (!card) return
    const t = card.dataset.theme
    container.querySelectorAll('#theme-options .settings-theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === t))
    await settingsApi.kv.set('theme', t)
    applyTheme(t)
  })

  // Permission mode
  container.querySelector('#perm-options')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.settings-perm-card')
    if (!card) return
    const mode = card.dataset.perm
    container.querySelectorAll('.settings-perm-card').forEach(c => c.classList.toggle('active', c.dataset.perm === mode))
    await settingsApi.kv.set('permission_mode', mode)
    showToast('Permission mode saved')
  })

  // Language
  container.querySelectorAll('[data-lang]').forEach(card => {
    card.addEventListener('click', async () => {
      const l = card.dataset.lang
      container.querySelectorAll('[data-lang]').forEach(c => c.classList.toggle('active', c.dataset.lang === l))
      await settingsApi.kv.set('language', l)
      if (typeof setLanguage === 'function') setLanguage(l)
      showToast('Language saved')
    })
  })
}

// ==================== Utils ====================
function esc(str) { return str ? String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : '' }
function gv(id) { return document.getElementById(id)?.value?.trim() || '' }
function showToast(msg) {
  let toast = document.getElementById('settings-toast')
  if (!toast) { toast = document.createElement('div'); toast.id = 'settings-toast'; toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--fg);color:var(--bg);padding:8px 16px;border-radius:8px;font-size:13px;z-index:9999;animation:fade-in .15s ease'; document.body.appendChild(toast) }
  toast.textContent = msg; toast.style.display = 'block'
  setTimeout(() => { toast.style.display = 'none' }, 2500)
}

window.toggleSettings = toggleSettings
window.loadSettingsTab = loadSettingsTab
window.showToast = showToast
