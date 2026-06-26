"use client";

/**
 * Minimal, unstyled Cloudflare Turnstile widget (PRD §5.1).
 *
 * Loads Turnstile (hand-rolled script loader — no extra dependency; ADR 0002 defers the
 * widget SDK and a ~10-line loader keeps the Workers bundle lean), renders the challenge, and
 * on pass POSTs the response token to `/api/auth/turnstile` to obtain the httpOnly session
 * cookie. After that, same-origin search requests carry the cookie automatically.
 *
 * Turnstile is mostly-invisible by design — no extra puzzle for a panicked relative (PRD §5.9).
 * Renders NOTHING when no site key is configured (dev: gate disabled). Intentionally
 * presentational-minimal; the frontend can restyle later.
 */

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

async function exchangeToken(token: string): Promise<void> {
  try {
    await fetch("/api/auth/turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Network hiccup — the widget's expired/error callbacks will re-challenge.
  }
}

export function TurnstileGate({
  siteKey,
  action,
}: {
  siteKey: string;
  action?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!siteKey || renderedRef.current) return;

    function renderWidget() {
      if (!window.turnstile || !containerRef.current || renderedRef.current) {
        return;
      }
      renderedRef.current = true;
      window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        ...(action ? { action } : {}),
        callback: (token: string) => void exchangeToken(token),
      });
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    let script = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget);
    return () => script?.removeEventListener("load", renderWidget);
  }, [siteKey, action]);

  if (!siteKey) return null;
  return <div ref={containerRef} />;
}
