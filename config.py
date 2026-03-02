"""Configuration management: ~/.clink/config.yaml with env-var fallback."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path.home() / ".clink"
CONFIG_FILE = CONFIG_DIR / "config.yaml"


def load_config() -> dict[str, Any]:
    """Load config from yaml file. Returns empty dict if not found."""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return yaml.safe_load(f) or {}
    return {}


def save_config(data: dict[str, Any]) -> None:
    """Save config dict to ~/.clink/config.yaml."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


def get_channel_name() -> str:
    """Get configured channel name from yaml or default to terminal."""
    cfg = load_config()
    return cfg.get("channel", "terminal")


@dataclass(frozen=True)
class WeComConfig:
    corp_id: str
    corp_secret: str
    agent_id: int
    token: str
    encoding_aes_key: str
    port: int = 8080

    @classmethod
    def from_config(cls) -> WeComConfig:
        """Load from yaml first, env vars as fallback."""
        cfg = load_config().get("wecom", {})
        return cls(
            corp_id=cfg.get("corp_id") or os.environ["WECOM_CORP_ID"],
            corp_secret=cfg.get("corp_secret") or os.environ["WECOM_CORP_SECRET"],
            agent_id=int(cfg.get("agent_id") or os.environ["WECOM_AGENT_ID"]),
            token=cfg.get("token") or os.environ["WECOM_TOKEN"],
            encoding_aes_key=cfg.get("encoding_aes_key") or os.environ["WECOM_ENCODING_AES_KEY"],
            port=int(cfg.get("port") or os.environ.get("WECOM_PORT", "8080")),
        )


@dataclass(frozen=True)
class QQBotConfig:
    appid: str
    secret: str

    @classmethod
    def from_config(cls) -> QQBotConfig:
        """Load from yaml first, env vars as fallback."""
        cfg = load_config().get("qq", {})
        return cls(
            appid=cfg.get("appid") or os.environ["QQ_BOT_APPID"],
            secret=cfg.get("secret") or os.environ["QQ_BOT_SECRET"],
        )
