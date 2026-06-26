# Cycle 5 — Hardening

**PRD milestone:** M6 (Hardening)
**Exit criterion:** Bulk extraction is expensive and detectable; abnormal patterns alert.
Only pursue after the security baseline (Cycle 4) is solid and if real abuse appears — don't
over-fortify.

## Bot management
- [ ] Cloudflare WAF / Bot Management in front; enable known-bot + anomaly rules.
- [ ] Honeypot field or unused param that only bots fill → flag and throttle.

## Monitoring & alerts
- [ ] Alert on high distinct-query volume per token.
- [ ] Alert on sequential paging to the end.
- [ ] Alert on identical timing intervals (automation signature).

## Canary records
- [ ] Seed a few uniquely-named fake entries.
- [ ] Watch for them appearing on other sites — proof of republication + takedown basis.

## Guardrail
- [ ] Re-check the PRD §5.9 tension: no challenge/auth so aggressive it blocks a real relative.

**Done when:** automated abuse is detected and throttled, and there's a verifiable signal for
republication of the aggregate.
