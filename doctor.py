"""Clink doctor: diagnose environment and configuration issues."""

from __future__ import annotations

import shutil
import sys

from config import CONFIG_FILE, load_config


def _check(label: str, ok: bool, hint: str = "") -> bool:
    mark = "✓" if ok else "✗"
    suffix = f"  → {hint}" if hint and not ok else ""
    print(f"  {mark} {label}{suffix}")
    return ok


def run_doctor() -> None:
    """Check environment, dependencies, and configuration."""
    print("\nClink Doctor\n")
    all_ok = True

    # Python version
    v = sys.version_info
    all_ok &= _check(
        f"Python {v.major}.{v.minor}.{v.micro}",
        v >= (3, 10),
        "need Python >= 3.10",
    )

    # Claude CLI
    claude_path = shutil.which("claude")
    all_ok &= _check(
        "Claude Code CLI",
        claude_path is not None,
        "npm i -g @anthropic-ai/claude-code",
    )

    # pip dependencies
    pkg_import_map = {
        "pyyaml": "yaml",
        "qq-botpy": "botpy",
        "claude-agent-sdk": "claude_agent_sdk",
    }
    req_file = __import__("pathlib").Path(__file__).parent / "requirements.txt"
    if req_file.exists():
        missing: list[str] = []
        for line in req_file.read_text().splitlines():
            pkg = line.strip()
            if pkg and not pkg.startswith("#"):
                import_name = pkg_import_map.get(pkg, pkg.replace("-", "_"))
                try:
                    __import__(import_name)
                except ImportError:
                    missing.append(pkg)
        all_ok &= _check(
            "pip dependencies",
            not missing,
            f"missing: {', '.join(missing)}. Run: pip install -r requirements.txt" if missing else "",
        )

    # Config file
    cfg_exists = CONFIG_FILE.exists()
    all_ok &= _check(
        f"Config file ({CONFIG_FILE})",
        cfg_exists,
        "run: python clink.py setup",
    )

    if cfg_exists:
        cfg = load_config()
        channel = cfg.get("channel", "")
        all_ok &= _check(
            f"Channel configured: {channel}",
            channel in ("terminal", "qq", "wecom"),
            "unknown channel",
        )

        # Check channel-specific config
        if channel == "qq":
            qq_cfg = cfg.get("qq", {})
            all_ok &= _check(
                "QQ Bot credentials",
                bool(qq_cfg.get("appid") and qq_cfg.get("secret")),
                "missing appid or secret",
            )
        elif channel == "wecom":
            wc = cfg.get("wecom", {})
            required_keys = ["corp_id", "corp_secret", "agent_id", "token", "encoding_aes_key"]
            missing_keys = [k for k in required_keys if not wc.get(k)]
            all_ok &= _check(
                "WeCom credentials",
                not missing_keys,
                f"missing: {', '.join(missing_keys)}" if missing_keys else "",
            )

    print()
    if all_ok:
        print("  All checks passed! Run: python clink.py start\n")
    else:
        print("  Some checks failed. Fix the issues above and re-run doctor.\n")
