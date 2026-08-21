# Environment briefing Worker

The Worker is the only process that reads the KMA and AirKorea service keys.
The mobile request contains only a KMA 5 km grid (`nx`, `ny`); never add raw
coordinates or work-schedule data to this wire contract.

Required secrets:

- `KMA_SERVICE_KEY`
- `AIRKOREA_SERVICE_KEY`

Enter the public-data portal's **decoding (decoded/general) service key** for
both secrets. Wrangler stores the values as secrets and the Worker performs URL
encoding exactly once.

Deployment bindings:

- `ALLOWED_ORIGIN` for the production web origin. Native requests omit Origin.
- `ENVIRONMENT_RATE_LIMITER` is configured at 120 requests per minute. Confirm
  that namespace `15001` is unique within the target Cloudflare account before
  deployment, because namespaces are account-wide.

The rate-limit key is `CF-Connecting-IP` because the request deliberately has no
persistent installation ID, account ID, raw coordinates, or schedule. Cloudflare
recommends a stable user identifier instead of IP where one exists; this app has
none. The relatively high 120/minute threshold reduces false positives for
carrier/shared NAT, while the provider/grid caches absorb normal traffic. A
shared NAT can still hit the limit, so monitor HTTP 429 counts during Alpha and
raise the threshold or introduce a privacy-reviewed anonymous installation ID
before wider rollout if legitimate requests are blocked. The binding receives
the IP only in memory; application code does not store or log it.

From this directory, authenticate Wrangler and run:

```text
npx --yes wrangler@4.125.0 secret put KMA_SERVICE_KEY
npx --yes wrangler@4.125.0 secret put AIRKOREA_SERVICE_KEY
npx --yes wrangler@4.125.0 deploy
```

Do not put either service key in `wrangler.jsonc`, `.env`, Expo public variables,
EAS configuration, build evidence, screenshots, or command output.

## Release gates

Do not point a V15 build at this Worker until all of the following are true:

1. KMA and AirKorea production use and required traffic increases are approved.
2. Rate-limit namespace `15001` is confirmed unique in the Cloudflare account.
3. Both decoding keys are stored with `wrangler secret put` and `wrangler
   secret list` shows both names (never capture secret values).
4. If the web build uses the endpoint, set `ALLOWED_ORIGIN` to its one exact
   HTTPS origin. Native Android requests have no Origin header.
5. `wrangler deploy --dry-run` and a deployed POST smoke test return schema v1
   with independent `weather` and `airQuality` statuses.
6. Set `EXPO_PUBLIC_ENVIRONMENT_BRIEFING_URL` to the deployed HTTPS Worker base
   URL in the EAS production environment before building. This URL is public;
   provider keys must never use an `EXPO_PUBLIC_` variable.
7. During Alpha, alert at 70% and 90% of each public-data quota and monitor
   Worker 429/provider-unavailable rates. Promotion is blocked if either source
   is not operational or legitimate shared-NAT traffic is being throttled.
