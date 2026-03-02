# Skill: Add a New Channel to Clink

Step-by-step guide for adding a new messaging channel (e.g., Telegram, Slack, Discord).

## Architecture Overview

```
clink.py          → CHANNELS dict (name → class mapping)
channels/base.py  → Channel ABC + Handler type
channels/xxx.py   → Your new channel implementation
config.py         → XxxConfig dataclass + from_config()
setup_wizard.py   → i18n texts + collect_config() + verify_connection()
doctor.py         → Credential validation
requirements.txt  → New SDK dependencies (if any)
```

## Checklist (6 files to touch)

### 1. `channels/<name>.py` — Channel Implementation

Inherit from `Channel`, implement `async def start(self, handler)`.

```python
from channels.base import Channel, Handler
from config import XxxConfig

class XxxChannel(Channel):
    def __init__(self) -> None:
        self._cfg = XxxConfig.from_config()

    async def start(self, handler: Handler) -> None:
        print("Clink Xxx channel starting...")
        # Connect to platform, listen for messages
        # When message received:
        #   reply = await handler(content)
        #   send reply back to user
```

**Key patterns:**

- `Handler` signature: `async (str) -> str`. Call `await handler(text)` with user message, get AI reply.
- Always wrap `handler()` in try/except — don't let SDK errors crash the bot:
  ```python
  try:
      reply = await handler(content)
  except Exception as exc:
      print(f"[Xxx] Handler error: {exc}")
      reply = f"[Error] {exc}"
  ```
- Add `print()` logs for received/replied messages — essential for debugging:
  ```python
  print(f"[Xxx] Received: {content!r}")
  print(f"[Xxx] Replying: {reply[:100]}...")
  ```
- Strip and validate content before calling handler:
  ```python
  content = (message.content or "").strip()
  if not content:
      return
  ```
- `start()` must block (run forever). Use `await asyncio.Event().wait()` if your SDK callback is non-blocking.

**Gotcha — SDK Intent/Permission Configuration:**

Many bot SDKs require explicit intent/event subscription. Get this wrong and the bot connects successfully but receives NO messages — with NO error output. This is the #1 debugging headache.

Example from QQ Bot: `botpy.Intents(public_messages=True)` enables C2C messages. Using `direct_message=True` instead would connect fine but silently drop all C2C events. Always verify which intent flag maps to which event handler by reading the SDK source, not just the docs.

### 2. `config.py` — Config Dataclass

Add a frozen dataclass with `from_config()` class method:

```python
@dataclass(frozen=True)
class XxxConfig:
    api_token: str
    # ... other fields

    @classmethod
    def from_config(cls) -> XxxConfig:
        """Load from yaml first, env vars as fallback."""
        cfg = load_config().get("xxx", {})
        return cls(
            api_token=cfg.get("api_token") or os.environ["XXX_API_TOKEN"],
        )
```

**Rules:**
- YAML config is primary, environment variables are fallback (for Docker/CI)
- Key names in YAML use `snake_case`
- Config section name = channel name (e.g., `xxx:` in config.yaml)

### 3. `clink.py` — Register Channel

Add import and dict entry:

```python
from channels.xxx import XxxChannel

CHANNELS = {
    "terminal": TerminalChannel,
    "wecom": WeComChannel,
    "qq": QQChannel,
    "xxx": XxxChannel,         # ← add here
}
```

### 4. `setup_wizard.py` — Interactive Setup

This is the biggest change. Multiple sections need updating:

#### 4a. i18n Texts

Add all user-facing strings in both English and Chinese to the `TEXTS` dict:

```python
# Channel selection option
"channel_xxx": {
    "en": "Xxx Bot (brief description)",
    "zh": "Xxx 机器人 (简要说明)",
},
# Setup guide title
"xxx_title": {
    "en": "Xxx Setup",
    "zh": "Xxx 配置",
},
# Credential guide — MUST be detailed and complete
"xxx_guide": {
    "en": "  How to get your Xxx credentials:\n\n  1. Go to ...\n  ...",
    "zh": "  如何获取 Xxx 凭证:\n\n  1. 打开 ...\n  ...",
},
# Input prompts for each credential field
"xxx_token": {
    "en": "  API Token: ",
    "zh": "  API Token: ",
},
# Verification messages
"xxx_verify": {
    "en": "\n  Testing Xxx connection... ",
    "zh": "\n  测试 Xxx 连接... ",
},
"xxx_verify_ok": {
    "en": "✓ Connected!",
    "zh": "✓ 连接成功!",
},
```

#### 4b. `choose_channel()` — Add Option

Update the channels list:

```python
def choose_channel() -> str:
    channels = [
        ("terminal", t("channel_terminal")),
        ("qq", t("channel_qq")),
        ("wecom", t("channel_wecom")),
        ("xxx", t("channel_xxx")),    # ← add here
    ]
```

Also update `enter_number` text if the number range changes (e.g., 1-3 → 1-4).

#### 4c. `collect_config()` — Credential Input

Add a branch for your channel:

```python
if channel == "xxx":
    _print_header(t("xxx_title"))
    print(t("xxx_guide"))
    token = input(t("xxx_token")).strip()
    return {"api_token": token}
```

#### 4d. `verify_connection()` — Test Credentials

Add verification logic:

```python
if channel == "xxx":
    print(t("xxx_verify"), end="", flush=True)
    try:
        # Make a lightweight API call to verify credentials
        ok = asyncio.run(_test_xxx(channel_cfg["api_token"]))
        if ok:
            print(t("xxx_verify_ok"))
        return ok
    except Exception as exc:
        print(f"✗ {exc}")
        return False
```

**Critical setup guide requirements:**

The guide text (`xxx_guide`) MUST cover ALL of the following. These are lessons from real user frustration:

1. **Where to get credentials** — exact URL, step-by-step with menu paths
2. **Platform-specific gotchas** — sandbox mode, review/approval process, test user limits
3. **How to actually use the bot after setup** — don't assume users know! (e.g., QQ bots can't be searched, must scan QR code)
4. **Display quirks** — name suffixes, avatar restrictions, anything users will notice and wonder about
5. **Permission/scope requirements** — what permissions to enable on the platform for the bot to actually receive messages

### 5. `doctor.py` — Diagnostic Check

Add your channel to the credential validation:

```python
# In run_doctor(), inside the cfg_exists block:
channel in ("terminal", "qq", "wecom", "xxx"),  # ← update valid list

if channel == "xxx":
    xxx_cfg = cfg.get("xxx", {})
    all_ok &= _check(
        "Xxx credentials",
        bool(xxx_cfg.get("api_token")),
        "missing api_token",
    )
```

### 6. `requirements.txt` — Dependencies

Add any new Python packages. **Watch out for:**

- **Package name vs import name mismatch**: e.g., `pyyaml` installs but imports as `yaml`, `qq-botpy` imports as `botpy`. If your package has this mismatch, update `_PKG_IMPORT_MAP` in BOTH `setup_wizard.py` and `doctor.py`:
  ```python
  _PKG_IMPORT_MAP = {
      "pyyaml": "yaml",
      "qq-botpy": "botpy",
      "claude-agent-sdk": "claude_agent_sdk",
      "your-sdk": "your_sdk",          # ← add here
  }
  ```

## Lessons Learned (from real deployment)

1. **Intent/permission silent failures**: Bot connects, shows "online", but receives zero messages. No error output. Always verify event subscription by reading SDK source code — docs may be outdated or ambiguous.

2. **Sandbox/test mode**: Many platforms (QQ, WeChat, Telegram bots) have sandbox or test modes with restrictions. Document these clearly in the setup guide. Users WILL hit these and WILL be confused if not warned.

3. **Bot discoverability**: Some platforms don't let users search for bots. Document the exact method to find/add the bot (QR code, link, invite, etc.).

4. **Name display quirks**: Platforms may append suffixes (e.g., QQ adds "-测试中" in sandbox). Mention this so users don't think something is broken.

5. **All user-facing text must be bilingual** (English + Chinese) in the `TEXTS` dict.

6. **`start()` must not return** until the bot is shutting down. Use `await asyncio.Event().wait()` for callback-based SDKs.

7. **Don't silently swallow errors** in message handlers. Always print to stdout — that's how users debug on a remote machine.

## Testing a New Channel

```bash
# 1. Clean state
rm -rf ~/.clink/config.yaml

# 2. Run setup, select your new channel
python clink.py setup

# 3. Verify environment
python clink.py doctor

# 4. Start and send a test message
python clink.py start

# 5. Check stdout for [Xxx] Received / Replying logs
```
