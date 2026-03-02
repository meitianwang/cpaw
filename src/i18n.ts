type Lang = "en" | "zh";

const TEXTS: Record<string, Record<Lang, string>> = {
  // ── Setup ──
  setup_title: {
    en: " Cpaw Setup ",
    zh: " Cpaw 安装引导 ",
  },
  config_exists: {
    en: "Config already exists at {path}\nCurrent channel: {channel}",
    zh: "配置文件已存在: {path}\n当前通道: {channel}",
  },
  overwrite: {
    en: "Overwrite existing config?",
    zh: "是否覆盖现有配置?",
  },
  setup_cancelled: {
    en: "Setup cancelled. Existing config preserved.",
    zh: "已取消。保留现有配置。",
  },
  checking: {
    en: "Checking prerequisites...",
    zh: "检查环境...",
  },
  node_ok: {
    en: "Node.js {version}",
    zh: "Node.js {version}",
  },
  node_need: {
    en: "Node.js >= 18 required",
    zh: "需要 Node.js >= 18",
  },
  cli_ok: {
    en: "Claude Code CLI found",
    zh: "Claude Code CLI 已安装",
  },
  cli_not_found: {
    en: "Claude Code CLI not found. Install: npm i -g @anthropic-ai/claude-code",
    zh: "未找到 Claude Code CLI。安装: npm i -g @anthropic-ai/claude-code",
  },
  checks_passed: {
    en: "All checks passed",
    zh: "所有检查通过",
  },
  checks_failed: {
    en: "Some checks failed. Please fix them before continuing.",
    zh: "部分检查未通过。请先修复以上问题。",
  },
  choose_channel: {
    en: "Choose a channel",
    zh: "选择通道",
  },
  channel_qq: {
    en: "QQ Bot (WebSocket, no public IP needed)",
    zh: "QQ 机器人 (WebSocket, 无需公网 IP)",
  },
  channel_wecom: {
    en: "WeChat Work (Webhook, needs public URL)",
    zh: "企业微信 (Webhook, 需要公网地址)",
  },
  // ── QQ Guide ──
  qq_title: {
    en: "QQ Bot Setup",
    zh: "QQ 机器人配置",
  },
  qq_guide: {
    en:
      "How to get credentials:\n" +
      "1. Open https://q.qq.com/ and log in\n" +
      "2. Create a bot, go to Development > Settings\n" +
      "3. Find AppID and AppSecret\n\n" +
      "The bot runs in sandbox mode by default.\n" +
      "Add test users at Development > Sandbox Config.",
    zh:
      "如何获取凭证:\n" +
      "1. 打开 https://q.qq.com/ 并登录\n" +
      "2. 创建机器人, 进入「开发」>「开发设置」\n" +
      "3. 找到 AppID 和 AppSecret\n\n" +
      "机器人默认为沙箱模式。\n" +
      "在「开发」>「沙箱配置」添加测试用户。",
  },
  qq_appid: {
    en: "AppID",
    zh: "AppID",
  },
  qq_secret: {
    en: "AppSecret",
    zh: "AppSecret",
  },
  // ── WeCom Guide ──
  wecom_title: {
    en: "WeChat Work (WeCom) Setup",
    zh: "企业微信配置",
  },
  wecom_guide: {
    en:
      "How to get credentials:\n" +
      "1. Login at https://work.weixin.qq.com/\n" +
      "2. Get Corp ID from My Enterprise page\n" +
      "3. Create app at App Management, get Agent ID + Secret\n" +
      "4. Set callback URL in Receive Messages section\n\n" +
      "Tip: Use Cloudflare Tunnel for public URL:\n" +
      "  cloudflared tunnel --url http://localhost:8080",
    zh:
      "如何获取凭证:\n" +
      "1. 登录 https://work.weixin.qq.com/\n" +
      "2. 在「我的企业」获取企业 ID\n" +
      "3. 在「应用管理」创建应用, 获取 AgentId + Secret\n" +
      "4. 在「接收消息」设置回调地址\n\n" +
      "提示: 用 Cloudflare Tunnel 暴露本地端口:\n" +
      "  cloudflared tunnel --url http://localhost:8080",
  },
  wecom_corp_id: {
    en: "Corp ID",
    zh: "企业 ID (Corp ID)",
  },
  wecom_secret: {
    en: "Corp Secret",
    zh: "应用 Secret",
  },
  wecom_agent_id: {
    en: "Agent ID",
    zh: "应用 ID (Agent ID)",
  },
  wecom_token: {
    en: "Callback Token",
    zh: "回调 Token",
  },
  wecom_aes_key: {
    en: "Encoding AES Key",
    zh: "EncodingAESKey",
  },
  wecom_port: {
    en: "Port (default 8080)",
    zh: "端口 (默认 8080)",
  },
  wecom_verify: {
    en: "Testing WeCom access_token...",
    zh: "测试企业微信 access_token...",
  },
  wecom_verify_ok: {
    en: "Access token obtained successfully!",
    zh: "access_token 获取成功!",
  },
  // ── Persona ──
  persona_title: {
    en: "Bot Persona",
    zh: "机器人人设",
  },
  persona_prompt: {
    en: "System prompt (controls how the bot responds). Leave empty for default.",
    zh: "系统指令 (控制回复风格和角色)。留空则使用默认。",
  },
  persona_placeholder: {
    en: "You are a helpful AI assistant...",
    zh: "你是一个友好的 AI 助手...",
  },
  // ── Done ──
  config_saved: {
    en: "Config saved to {path}",
    zh: "配置已保存到 {path}",
  },
  setup_done: {
    en: "Setup complete! Run: cpaw start",
    zh: "安装完成! 运行: cpaw start",
  },
};

let currentLang: Lang = "en";

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, vars?: Record<string, string>): string {
  let text = TEXTS[key]?.[currentLang] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
