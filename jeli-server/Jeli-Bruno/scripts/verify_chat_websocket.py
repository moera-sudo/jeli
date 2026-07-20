"""Живая проверка WS-доставки messenger поверх запущенного backend.

ЗАЧЕМ ЭТОТ СКРИПТ. bru run (CLI-раннер Bruno) выполняет только HTTP-запросы — его JS-песочница
(quickjs в safe-режиме, ограниченный node:vm в developer-режиме) не даёт глобального WebSocket и не
может держать постоянное соединение, поэтому Bruno-коллекция (см. Jeli-Bruno/messenger/, notifications/)
проверяет ТОЛЬКО HTTP-сторону: отправку сообщения, персистентность в БД, персистентность уведомления.
Живой пуш по /api/ws ({"type": "message", ...} и {"type": "notification", ...}) этот скрипт проверяет
напрямую — регистрирует двух временных пользователей, открывает реальный WS от лица получателя,
отправляет сообщение от отправителя через REST и слушает оба события.

ЗАПУСК (нужен доступный backend, по умолчанию http://localhost:8000):
    cd jeli-server && uv run python ../Jeli-Bruno/scripts/verify_chat_websocket.py
"""

import asyncio
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin

import websockets

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/api"
WS_URL = BASE_URL.replace("http://", "ws://").replace("https://", "wss://").removesuffix("/api") + "/api/ws"


def http_json(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    url = urljoin(BASE_URL + "/", path.lstrip("/"))
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()}") from e


def register(email: str) -> dict:
    return http_json(
        "POST",
        "/auth/register",
        {
            "email": email,
            "password": "string123",
            "last_name": "WsTest",
            "first_name": "User",
            "patronymic": None,
            "graph_invite_code": "",
        },
    )


async def main() -> None:
    print(f"Target: {BASE_URL} (ws: {WS_URL})")

    import time

    suffix = int(time.time())
    sender = register(f"ws_verify_sender_{suffix}@example.com")
    receiver = register(f"ws_verify_receiver_{suffix}@example.com")
    sender_token = sender["access_token"]
    receiver_token = receiver["access_token"]

    http_json("PATCH", "/users/profile/edit", {"gender": "male"}, token=sender_token)
    http_json("PATCH", "/users/profile/edit", {"gender": "male"}, token=receiver_token)
    http_json("POST", "/graph/create", token=sender_token)
    receiver_person = http_json("POST", "/graph/create", token=receiver_token)

    chat = http_json("POST", "/chats", {"person_id": receiver_person["id"]}, token=sender_token)
    chat_id = chat["id"]
    print(f"Chat created: {chat_id}")

    events: list[dict] = []
    async with websockets.connect(f"{WS_URL}?token={receiver_token}") as ws:
        print("Receiver connected to /api/ws, listening...")

        async def send_after_delay() -> None:
            await asyncio.sleep(0.5)
            msg = http_json(
                "POST", f"/chats/{chat_id}/messages", {"content": "ws verification ping"}, token=sender_token
            )
            print(f"Message sent via REST: {msg['id']}")

        sender_task = asyncio.create_task(send_after_delay())

        try:
            async with asyncio.timeout(5):
                while len(events) < 2:
                    raw = await ws.recv()
                    event = json.loads(raw)
                    events.append(event)
                    print(f"WS event received: {event['type']}")
        except TimeoutError:
            pass
        await sender_task

    types = {e["type"] for e in events}
    ok_message = "message" in types
    ok_notification = "notification" in types and any(
        e.get("notification", {}).get("type") == "new_message" for e in events if e["type"] == "notification"
    )

    print()
    print(f"[{'PASS' if ok_message else 'FAIL'}] live 'message' WS push received")
    print(f"[{'PASS' if ok_notification else 'FAIL'}] live 'notification' (new_message) WS push received")

    if not (ok_message and ok_notification):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
