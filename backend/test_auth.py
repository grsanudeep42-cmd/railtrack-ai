"""
test_auth.py — Quick smoke test for RailTrack AI authentication + trains API.
Run: python test_auth.py  (FastAPI server must be running on localhost:8000)
"""

import asyncio
import httpx
import sys

BASE_URL = "http://localhost:8000"

# Demo credentials — must match seed.py
CREDENTIALS = [
    ("controller@demo.rail",  "demo1234", "CONTROLLER"),
    ("supervisor@demo.rail",  "demo1234", "SUPERVISOR"),
    ("logistics@demo.rail",   "demo1234", "LOGISTICS"),
    ("admin@demo.rail",       "demo1234", "ADMIN"),
]


async def run_tests():
    passed = 0
    failed = 0

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:

        # ── Test 1: Health check ──────────────────────────────────────────────
        print("\n[1] GET /health")
        r = await client.get("/health")
        if r.status_code == 200:
            print(f"    ✅  {r.status_code} — {r.json()['status']}")
            passed += 1
        else:
            print(f"    ❌  {r.status_code}")
            failed += 1

        # ── Test 2: Login with each demo user ─────────────────────────────────
        tokens: dict[str, str] = {}
        for email, password, role in CREDENTIALS:
            print(f"\n[2] POST /api/auth/login  ({role})")
            r = await client.post("/api/auth/login", json={"email": email, "password": password})
            if r.status_code == 200:
                data = r.json()
                token = data.get("access_token", "")
                tokens[role] = token
                print(f"    ✅  {r.status_code} — JWT received ({len(token)} chars), user={data['user']['name']}")
                passed += 1
            else:
                print(f"    ❌  {r.status_code} — {r.text}")
                failed += 1

        # ── Test 3: GET /api/auth/me using controller token ───────────────────
        if "CONTROLLER" in tokens:
            print(f"\n[3] GET /api/auth/me  (CONTROLLER token)")
            r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['CONTROLLER']}"})
            if r.status_code == 200:
                u = r.json()
                print(f"    ✅  {r.status_code} — id={u['id']}, role={u['role']}, section={u['section']}")
                passed += 1
            else:
                print(f"    ❌  {r.status_code} — {r.text}")
                failed += 1

        # ── Test 4: GET /api/trains/ without token → 401 ─────────────────────
        print(f"\n[4] GET /api/trains/  (no token — expect 401)")
        r = await client.get("/api/trains/")
        if r.status_code == 401:
            print(f"    ✅  {r.status_code} — correctly rejected unauthenticated request")
            passed += 1
        else:
            print(f"    ❌  Expected 401 but got {r.status_code}")
            failed += 1

        # ── Test 5: GET /api/trains/ with valid token ─────────────────────────
        if "CONTROLLER" in tokens:
            print(f"\n[5] GET /api/trains/  (CONTROLLER token)")
            r = await client.get("/api/trains/", headers={"Authorization": f"Bearer {tokens['CONTROLLER']}"})
            if r.status_code == 200:
                trains = r.json()
                print(f"    ✅  {r.status_code} — {len(trains)} trains returned")
                for t in trains[:3]:
                    print(f"         • {t['id']} — {t['name']} [{t['status']}] delay={t['delay']}m")
                passed += 1
            else:
                print(f"    ❌  {r.status_code} — {r.text}")
                failed += 1

        # ── Test 6: GET /api/conflicts/ ───────────────────────────────────────
        if "CONTROLLER" in tokens:
            print(f"\n[6] GET /api/conflicts/  (CONTROLLER token)")
            r = await client.get("/api/conflicts/", headers={"Authorization": f"Bearer {tokens['CONTROLLER']}"})
            if r.status_code == 200:
                conflicts = r.json()
                print(f"    ✅  {r.status_code} — {len(conflicts)} active conflict(s)")
                for c in conflicts:
                    print(f"         • {c['id']} — {c['train_a_id']} ↔ {c['train_b_id']} [{c['severity']}]")
                passed += 1
            else:
                print(f"    ❌  {r.status_code} — {r.text}")
                failed += 1

        # ── Test 7: Invalid login → 401 ───────────────────────────────────────
        print(f"\n[7] POST /api/auth/login  (wrong password — expect 401)")
        r = await client.post("/api/auth/login", json={"email": "controller@demo.rail", "password": "WRONGPASS"})
        if r.status_code == 401:
            print(f"    ✅  {r.status_code} — correctly rejected invalid credentials")
            passed += 1
        else:
            print(f"    ❌  Expected 401 but got {r.status_code}")
            failed += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═'*50}")
    print(f"  Results: {passed} passed / {failed} failed")
    print(f"{'═'*50}")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(run_tests())
    sys.exit(0 if ok else 1)
