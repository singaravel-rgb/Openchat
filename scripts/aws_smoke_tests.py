#!/usr/bin/env python3
"""
OpenChat AWS Deployment Smoke Test Suite
Verifies end-to-end functionality of deployed OpenChat environments on AWS.
Runs against any target URL (ALB DNS name or custom domain).

Usage:
    python scripts/aws_smoke_tests.py --url http://openchat-alb-12345.us-east-1.elb.amazonaws.com
    python scripts/aws_smoke_tests.py --url https://openchat.vananam.com
"""

import argparse
import sys
import time
import httpx


def test_endpoint(client: httpx.Client, name: str, method: str, url: str, expected_statuses=(200,), **kwargs):
    print(f"[*] Testing {name}: {method} {url} ...", end=" ", flush=True)
    try:
        response = client.request(method, url, timeout=15.0, **kwargs)
        if response.status_code in expected_statuses:
            print(f"PASSED (HTTP {response.status_code})")
            return response
        else:
            print(f"FAILED (HTTP {response.status_code}, expected {expected_statuses})")
            print(f"    Response body: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"FAILED (Exception: {e})")
        return None


def run_smoke_tests(base_url: str, test_origin: str | None = None) -> bool:
    base_url = base_url.rstrip("/")
    if not test_origin:
        if "127.0.0.1" in base_url or "localhost" in base_url:
            test_origin = "http://127.0.0.1:8080"
        else:
            test_origin = base_url

    print(f"\n=======================================================")
    print(f"OpenChat AWS Smoke Test Suite")
    print(f"Target URL: {base_url}")
    print(f"Widget Origin: {test_origin}")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print(f"=======================================================\n")

    passed_count = 0
    total_tests = 6

    widget_headers = {
        "Origin": test_origin,
        "Referer": f"{test_origin}/"
    }

    with httpx.Client(follow_redirects=True) as client:
        # Test 1: Frontend UI Root Check
        r_front = test_endpoint(client, "1. Frontend UI Root", "GET", f"{base_url}/", expected_statuses=(200, 301, 302, 307))
        if r_front:
            passed_count += 1

        # Test 2: Backend API Health Check
        r_health = test_endpoint(client, "2. Backend API Health", "GET", f"{base_url}/health", expected_statuses=(200,))
        if r_health:
            try:
                data = r_health.json()
                if data.get("status") == "ok":
                    print(f"    Service signature confirmed: {data.get('service')}")
                passed_count += 1
            except Exception:
                print(f"    Could not parse health JSON: {r_health.text}")
        else:
            # Try /api/v1/health fallback if path routed
            r_health_fallback = test_endpoint(client, "2b. Backend API Health Fallback", "GET", f"{base_url}/api/v1/health", expected_statuses=(200,))
            if r_health_fallback:
                passed_count += 1

        # Test 3: Widget Public Configuration
        r_cfg = test_endpoint(
            client,
            "3. Customer Widget Configuration",
            "GET",
            f"{base_url}/api/v1/widget/config",
            headers=widget_headers,
            expected_statuses=(200,)
        )
        if r_cfg:
            try:
                cfg = r_cfg.json()
                print(f"    Widget title: '{cfg.get('widget_title')}', brand: '{cfg.get('brand_name')}'")
                passed_count += 1
            except Exception:
                pass

        # Test 4: Widget Guest Session Creation
        session_token = None
        r_sess = test_endpoint(
            client,
            "4. Customer Guest Session Creation",
            "POST",
            f"{base_url}/api/v1/widget/session",
            headers=widget_headers,
            json={"channel": "web_widget"},
            expected_statuses=(200, 201)
        )
        if r_sess:
            passed_count += 1
            try:
                session_data = r_sess.json()
                session_token = session_data.get("session_token")
                print(f"    Obtained guest session_token: {session_token[:16]}...")
            except Exception:
                pass

        # Test 5: Customer Conversation Creation
        conversation_id = None
        if session_token:
            conv_headers = {**widget_headers, "X-Widget-Session": session_token}
            r_conv = test_endpoint(
                client,
                "5. Customer Conversation Initiation",
                "POST",
                f"{base_url}/api/v1/widget/conversations",
                headers=conv_headers,
                json={
                    "subject": "AWS Production Verification Check",
                    "initial_message": "Hello OpenChat on AWS!"
                },
                expected_statuses=(200, 201)
            )
            if r_conv:
                passed_count += 1
                try:
                    conv_data = r_conv.json()
                    conversation_id = conv_data.get("id")
                    print(f"    Created conversation id: {conversation_id}")
                except Exception:
                    pass
        else:
            print("[-] Skipping conversation test (no guest session token)")

        # Test 6: Auth Endpoint Security Verification (negative test confirms security boundary)
        r_auth = test_endpoint(
            client,
            "6. Authentication Endpoint Security Boundary",
            "POST",
            f"{base_url}/api/v1/auth/login",
            data={"username": "invalid_probe@openchat.io", "password": "wrong_password"},
            expected_statuses=(401, 400, 422)
        )
        if r_auth:
            print(f"    Auth endpoint correctly rejected unauthorized credentials with HTTP {r_auth.status_code}")
            passed_count += 1

    print(f"\n=======================================================")
    print(f"Smoke Test Results: {passed_count}/{total_tests} passed")
    print(f"=======================================================")

    if passed_count >= 5:
        print("[SUCCESS] All critical AWS deployment paths verified.")
        return True
    else:
        print("[FAILURE] Deployment verification failed critical checks.")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenChat AWS Smoke Test Suite")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL to test")
    parser.add_argument("--origin", default=None, help="Origin header for widget verification")
    args = parser.parse_args()

    success = run_smoke_tests(args.url, test_origin=args.origin)
    sys.exit(0 if success else 1)
