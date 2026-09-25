"""Local FCM relay for PocketBase hooks.

Bind only to loopback. Configure PUSH_RELAY_SECRET and
FIREBASE_SERVICE_ACCOUNT_PATH through a root-owned environment file.
"""

import base64
import hmac
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


FIELDS = {
    "token": 4096,
    "eventId": 64,
    "userId": 32,
    "service": 16,
    "recordId": 32,
    "title": 120,
    "previousStatus": 60,
    "status": 60,
    "createdAt": 24,
}
SERVICES = {"INSTANCES", "BOOKINGS", "BORROW", "PRINT"}
_access_token = None
_token_expires_at = 0


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _json_bytes(value):
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


def _sign_jwt(unsigned, private_key):
    # memfd keeps the private key off disk; OpenSSL sees only this process's fd.
    fd = os.memfd_create("fcm-private-key", os.MFD_CLOEXEC)
    try:
        os.write(fd, private_key.encode("utf-8"))
        os.lseek(fd, 0, os.SEEK_SET)
        result = subprocess.run(
            ["/usr/bin/openssl", "dgst", "-sha256", "-sign", f"/proc/self/fd/{fd}"],
            input=unsigned.encode("ascii"),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
            pass_fds=(fd,),
            timeout=5,
        )
        return _b64(result.stdout)
    finally:
        os.close(fd)


def _oauth_token(account):
    global _access_token, _token_expires_at
    if _access_token and time.time() < _token_expires_at - 120:
        return _access_token
    now = int(time.time())
    header = _b64(_json_bytes({"alg": "RS256", "typ": "JWT"}))
    claims = _b64(_json_bytes({
        "iss": account["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }))
    unsigned = f"{header}.{claims}"
    assertion = f"{unsigned}.{_sign_jwt(unsigned, account['private_key'])}"
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        }).encode("ascii"),
        {"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        result = json.load(response)
    _access_token = result["access_token"]
    _token_expires_at = time.time() + int(result.get("expires_in", 3600))
    return _access_token


def _valid(payload):
    return (
        isinstance(payload, dict)
        and all(isinstance(payload.get(key), str) and
                0 < len(payload[key]) <= limit for key, limit in FIELDS.items())
        and payload["service"] in SERVICES
    )


def _send(account, payload):
    data = {key: payload[key] for key in FIELDS if key != "token"}
    request = urllib.request.Request(
        f"https://fcm.googleapis.com/v1/projects/{urllib.parse.quote(account['project_id'], safe='')}/messages:send",
        _json_bytes({"message": {
            "token": payload["token"],
            "data": data,
            "android": {"priority": "HIGH", "ttl": "86400s"},
        }}),
        {"Authorization": f"Bearer {_oauth_token(account)}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=8):
        pass


def serve(account, secret, port):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/send":
                return self._reply(404, "Not found")
            supplied = self.headers.get("X-Push-Relay-Secret", "")
            if not hmac.compare_digest(supplied, secret):
                return self._reply(401, "Unauthorized")
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._reply(400, "Invalid length")
            if size < 1 or size > 8192:
                return self._reply(413, "Invalid size")
            try:
                payload = json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                return self._reply(400, "Invalid JSON")
            if not _valid(payload):
                return self._reply(400, "Invalid payload")
            try:
                _send(account, payload)
            except urllib.error.HTTPError as error:
                print(f"FCM HTTP {error.code}", flush=True)
                return self._reply(502, "FCM rejected message")
            except (OSError, KeyError, subprocess.SubprocessError) as error:
                print(f"FCM delivery error: {type(error).__name__}", flush=True)
                return self._reply(502, "FCM delivery failed")
            self._reply(200, "OK")

        def _reply(self, status, message):
            body = _json_bytes({"message": message})
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            # Do not log FIDs, titles, user IDs, or headers.
            pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Push relay listening on 127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    path = os.environ["FIREBASE_SERVICE_ACCOUNT_PATH"]
    secret = os.environ["PUSH_RELAY_SECRET"]
    if len(secret) < 32:
        raise SystemExit("PUSH_RELAY_SECRET must be at least 32 characters")
    with open(path, encoding="utf-8") as source:
        credentials = json.load(source)
    for field in ("project_id", "client_email", "private_key"):
        if not credentials.get(field):
            raise SystemExit(f"Service account lacks {field}")
    serve(credentials, secret, int(os.environ.get("PUSH_RELAY_PORT", "8181")))
