from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Awaitable, Callable

# handler 签名: 接收用户文本，返回 AI 回复
Handler = Callable[[str], Awaitable[str]]


class Channel(ABC):
    """消息通道抽象接口。

    实现一个新通道只需继承此类并实现 start()。
    """

    @abstractmethod
    async def start(self, handler: Handler) -> None:
        """启动消息循环。收到用户输入后调用 handler 获取回复。"""
