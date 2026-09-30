# URI decoder CommonJS bridge

`query-string` 7 expects `require('decode-uri-component')` to return a function.
The official security fix, `decode-uri-component` 0.5.0, exports that function as
an ESM default export instead. This private adapter forwards the exact official
function; it contains no decoder implementation or copied vulnerable code.

## Host dependency contract

The application must declare both root production dependencies:

```json
{
  "dependencies": {
    "decode-uri-component": "file:./tooling/uri-decoder-compat",
    "decode-uri-component-patched": "npm:decode-uri-component@0.5.0"
  },
  "overrides": {
    "query-string@7.1.3": {
      "decode-uri-component": "$decode-uri-component"
    }
  }
}
```

The reference override reuses the root dependency. A bare relative `file:`
override was resolved beneath `query-string` by npm and created a dangling link;
do not reintroduce it. The lockfile must link the adapter to the existing root
`tooling/uri-decoder-compat` directory and contain no dangling nested copy.
The patched alias is intentionally a root production dependency: npm local-file
dependencies do not install their own dependencies automatically. Do not remove
or replace that alias with an older decoder. The lockfile must retain the
official package name, version, tarball URL and integrity for the alias.

This uses the pinned Node 24 synchronous ESM support for build/test tooling and
Metro's ESM default-export interop for the application. It is not an API upgrade
of `query-string` and does not modify its URL, array, duplicate-key or null-value
contracts. A native Android bundle/export must still verify Metro interop; a
Node-only test is not evidence of Hermes runtime compatibility.

`scripts/__tests__/uri-decoder-security.test.mjs` verifies function identity,
dependency provenance, Korean/emoji/percent decoding and `query-string` round
trips. Long malformed-input checks run only in child processes with a two-second
deadline, including the real `query-string` path, so a regression cannot block
the test runner. No vulnerable reference decoder is executed for comparison.

Remove this adapter only after every consumer supports the official fixed
decoder directly and the same compatibility/security checks pass.

Sources:

- [Security advisory GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
- [Official 0.5.0 release](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0)
- [Official single-pass decoder](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js)
- [npm dependency-reference overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides)
