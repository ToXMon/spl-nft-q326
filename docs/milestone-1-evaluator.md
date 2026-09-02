# Milestone 1 Evaluator — `spl_init.ts` only

**Date:** 2026-08-26
**Scope of evaluation:** After the builder reports Milestone 1 done, this evaluator runs the checks below. **No edits to source files, no transactions submitted by the evaluator.**
**Status:** Drafted *before* the builder's changes. Re-run / finalize after the builder reports done.

> **Hard precondition.** Milestone 1 is **only** `src/spl/spl_init.ts`. If any other source file has been edited (`spl_metadata.ts`, `spl_mint.ts`, `spl_transfer.ts`, or anything under `src/nft/*`), the evaluator MUST stop and report a scope violation before running any check.

---

## 0. Scope gate (run first; reject on any hit)

```bash
# Only spl_init.ts may have been modified.
git status --short
```

| Condition | Verdict |
|---|---|
| Any modification outside `src/spl/spl_init.ts` (other than `docs/` and the lockfile produced by a `tsc`/`npm` side-effect) | **FAIL — scope violation.** Do not proceed. |
| Any new file under `src/nft/*` | **FAIL — out of scope for Milestone 1.** |
| Any change to `package.json` or `tsconfig.json` or `.gitignore` | **FAIL — out of scope.** |
| `devnet-wallet.json` modified | **FAIL — wallet must not be touched.** |
| Only `src/spl/spl_init.ts` modified (and incidental lockfile/doc noise) | Proceed. |

---

## 1. Compile check (read-only, deterministic)

```bash
cd /Users/tolushekoni/sb2026/spl-nft-q326
npx tsc --noEmit -p tsconfig.json
echo "exit=$?"
```

| Check | Expected |
|---|---|
| Exit code | `0` |
| Stderr/stdout | empty (or only `info`-level diagnostics that don't change exit code) |

If non-zero: capture the first 50 lines of diagnostic output, **stop**, and report. Do not edit.

---

## 2. Wallet-shape check (no printing of bytes)

The evaluator runs this assertion itself; it does NOT trust the script's own claim.

```bash
node -e '
  const a = require("/Users/tolushekoni/sb2026/spl-nft-q326/devnet-wallet.json");
  if (!Array.isArray(a)) throw new Error("not array");
  if (a.length !== 64) throw new Error("length " + a.length);
  for (const b of a) if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error("bad byte");
  console.log("OK wallet shape len=64");
'
echo "exit=$?"
```

| Check | Expected |
|---|---|
| Exit code | `0` |
| Stdout | exactly `OK wallet shape len=64` — **must not include any byte values** |

Reject any output that contains the digits 0–255 in array form. Reject any error referencing `wallet`, `keypair`, or `secretKey`.

---

## 3. Wallet-leak lint (static, against the source)

```bash
cd /Users/tolushekoni/sb2026/spl-nft-q326
# 3a. No script logs wallet/keypair/secretKey/signer
grep -nE 'console\.(log|info|warn|error|debug)\([^)]*(wallet|keypair|secretKey|\bsigner\b)' \
  src/spl/spl_init.ts
echo "grep-wallet-exit=$?"

# 3b. No file other than the four SPL scripts imports the wallet
grep -RIn "devnet-wallet" src/ | grep -v 'import wallet from'
echo "grep-wallet-other-exit=$?"

# 3c. No process.stdout.write / process.stderr.write of those names
grep -nE 'process\.(stdout|stderr)\.write[^;]*(wallet|keypair|secretKey|\bsigner\b)' \
  src/spl/spl_init.ts
echo "grep-procwrite-exit=$?"
```

| Check | Expected |
|---|---|
| 3a exit code | `1` (no matches) |
| 3b exit code | `1` (no matches outside the existing `import wallet from` lines) |
| 3c exit code | `1` (no matches) |
| Any non-empty stdout from any of the three | **FAIL — secret-leak path exists.** |

---

## 4. Gitignore effectiveness (file not tracked)

```bash
cd /Users/tolushekoni/sb2026/spl-nft-q326
git ls-files --error-unmatch devnet-wallet.json
echo "exit=$?"
```

Expected exit code: **non-zero** (file is untracked).

---

## 5. `SEND`-gate behavior (the centerpiece of Milestone 1)

This is the most important behavior to verify. The evaluator runs **three** invocations of `spl_init.ts` and inspects output + a wrapped RPC to count write calls.

### 5.1 Stub the RPC and count write calls

The evaluator creates a temporary test harness (`tests/eval/spl_init_harness.ts`, ephemeral, NOT committed) that:
1. Patches `createSolanaRpc` to return a stub that counts calls by method name.
2. Imports `spl_init.ts`'s main logic and invokes it with `process.env.SEND` set to each value.
3. Records (a) every RPC method called, (b) every console output line.

Allowed RPC methods under `SEND=0` or `SEND` unset:
- `getLatestBlockhash` (read)
- `getMinimumBalanceForRentExemption` (read)
- `getHealth` (read; if script calls it)

Disallowed RPC methods under `SEND=0` or `SEND` unset:
- `sendTransaction`
- `simulateTransaction` (read-only, but Milestone 1 plan §8.2 puts simulation under `SEND=1` only)
- any other write

Allowed RPC methods under `SEND=1`:
- everything above, plus
- `simulateTransaction` (must be called **before** any `sendTransaction`)
- `sendTransaction` (must be the **last** write)

### 5.2 Three runs

```bash
cd /Users/tolushekoni/sb2026/spl-nft-q326

# Run A: SEND unset (the default)
unset SEND
npx ts-node src/spl/spl_init.ts > /tmp/spl_init_A.out 2> /tmp/spl_init_A.err
echo "A exit=$?"

# Run B: SEND=0
SEND=0 npx ts-node src/spl/spl_init.ts > /tmp/spl_init_B.out 2> /tmp/spl_init_B.err
echo "B exit=$?"

# Run C: SEND=1 — must simulate-then-send; if simulation fails, exit non-zero without sending
SEND=1 npx ts-node src/spl/spl_init.ts > /tmp/spl_init_C.out 2> /tmp/spl_init_C.err
echo "C exit=$?"
```

### 5.3 Expected outputs

| Run | Exit | Required stdout content | Required stderr | Disallowed stdout |
|---|---|---|---|---|
| **A** (SEND unset) | `0` | a plan line(s): `mint=<base58>`, `rent=<lamports>`, `txBytes=<n>`, `sigPlan=<base58>` | empty or benign | wallet bytes, send-confirmation signature |
| **B** (`SEND=0`) | `0` | same as A | empty or benign | same as A |
| **C** (`SEND=1`) | `0` (after a successful sim) | the plan line(s) + a confirmed tx signature | empty or benign | wallet bytes |

### 5.4 Failure scenarios to also exercise

| Scenario | How | Expected behavior |
|---|---|---|
| `SEND=0`, broken RPC | point `createSolanaRpc` at `http://127.0.0.1:1` | script exits non-zero with a surfaced error, no `sendTransaction` call. The error message must NOT contain wallet bytes. |
| `SEND=1`, simulation returns `err` | stub RPC's `simulateTransaction` to return a populated `err` field | script exits non-zero **before** any `sendTransaction` call. |
| `SEND=1`, `signTransactionMessageWithSigners` throws | stub `signTransactionMessageWithSigners` to throw | script exits non-zero; no `sendTransaction` call. |

### 5.5 Adversarial grep over captured output

```bash
for f in /tmp/spl_init_A.out /tmp/spl_init_B.out /tmp/spl_init_C.err; do
  echo "=== $f ==="
  # Reject any line that contains 64 comma-separated integers (wallet array)
  grep -E '^\[([0-9]+,){63}[0-9]+\]$' "$f" && echo "FAIL: wallet array leaked" || echo "OK: no array"
  # Reject any 88-char base58 string (base58 of 64 bytes)
  grep -E '[1-9A-HJ-NP-Za-km-z]{88,}' "$f" | grep -v 'sigPlan\|signature\|mint' && echo "FAIL: possible wallet base58" || echo "OK: no wallet b58"
done
```

Reject any non-`OK` lines.

---

## 6. Decoded-transaction invariants

The evaluator writes a small test (`tests/eval/decode_spl_init_message.ts`, ephemeral) that:
1. Imports the message-building helpers directly.
2. Replays the exact same flow `spl_init.ts` performs with `SEND=0`.
3. **Without sending**, decodes the signed transaction's message and asserts:

```ts
// Discriminators
expect(instrs[0].programAddress).toBe(SYSTEM_PROGRAM_ADDRESS); // CreateAccount
expect(instrs[1].programAddress).toBe(TOKEN_PROGRAM_ADDRESS);  // InitializeMint

// Account order: CreateAccount = [payer(signer,writable), newAccount(signer,writable)]
expect(instrs[0].accounts.map(a => ({key: a.address, isSigner: a.role.includes("SIGNER"), isWritable: a.role.includes("WRITABLE")})))
  .toEqual([
    { key: feePayer.address,  isSigner: true,  isWritable: true  },
    { key: mint.address,      isSigner: true,  isWritable: true  },
  ]);

// Account order: InitializeMint (rent-based) = [mint(writable)]
expect(instrs[1].accounts[0].key).toBe(mint.address);
expect(instrs[1].accounts[0].isWritable).toBe(true);
expect(instrs[1].accounts[0].isSigner).toBe(false);

// InitializeMint data layout (Borsh):
//   u8  discriminator = 0
//   u8  decimals
//   pubkey mintAuthority (32 bytes)
//   Option<pubkey> freezeAuthority (1 + 32 bytes if Some, 1 byte if None)
const data = instrs[1].data;
expect(data[0]).toBe(0);          // disc
expect(data[1]).toBe(6);          // decimals (or whatever the builder chose; capture once)
expect(data.slice(2, 34)).toEqual(feePayer.address); // mintAuthority
expect(data[34]).toBe(0);         // freezeAuthority = None

// Lamports for CreateAccount >= getMinimumBalanceForRentExemption(82)
expect(BigInt(instrs[0].data.lamports))
  .toBeGreaterThanOrEqual(rent);
```

If any of these fails, the validator reports the diff; the script is not yet correct.

---

## 7. Plan-log format contract

The plan log line(s) emitted under `SEND=0` MUST contain, in some order, the substrings:

- `mint=` followed by a 32–44 char base58 pubkey (NOT 88 chars)
- `rent=` followed by a numeric lamports value ≥ some lower bound
- `txBytes=` followed by a small integer
- `sigPlan=` followed by a base58 string of the **signature over the unsigned bytes** (the placeholder signature produced by `signTransactionMessageWithSigners` before send — typically 88 chars base58, but this is the *plan signature*, not the wallet). Verify it is NOT the wallet key by asserting it appears nowhere in `devnet-wallet.json`.

The evaluator greps:

```bash
grep -E 'mint=[1-9A-HJ-NP-Za-km-z]{32,44}' /tmp/spl_init_A.out
grep -E 'rent=[0-9]+' /tmp/spl_init_A.out
grep -E 'txBytes=[0-9]+' /tmp/spl_init_A.out
grep -E 'sigPlan=[1-9A-HJ-NP-Za-km-z]{80,100}' /tmp/spl_init_A.out
```

All four must succeed. None of the four values may appear inside the wallet bytes (cross-check by base58-decoding `sigPlan` and asserting it is **not** equal to the wallet's ed25519 public key).

---

## 8. RPC endpoint hygiene

```bash
# 8a. Default RPC reachable
curl -sS -X POST https://api.devnet.solana.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | head -c 200

# 8b. Wallet balance ≥ 0.05 SOL on devnet (read-only)
# Use the public key derived from the wallet bytes — DO NOT print the wallet bytes themselves.
node -e '
  const w = require("/Users/tolushekoni/sb2026/spl-nft-q326/devnet-wallet.json");
  // Use @solana/kit to compute the pubkey without logging the secret.
  const { createKeyPairSignerFromBytes } = require("@solana/kit");
  (async () => {
    const s = await createKeyPairSignerFromBytes(new Uint8Array(w));
    console.log("pubkey=" + s.address);
  })();
'
# Then call getBalance against s.address with curl or the RPC client.
```

Expected: `result: "ok"` from `getHealth`; balance ≥ 50_000_000 lamports.

If balance < threshold: warn; do not auto-reject (a fresh airdrop may be in flight).

---

## 9. Scope-of-source check (post-build)

The evaluator re-reads `src/spl/spl_init.ts` after the builder's report and verifies:

```bash
wc -l src/spl/spl_init.ts
```

| Check | Expected |
|---|---|
| Line count | modest (≤ ~120). If >200, ask why before approving. |
| No TODO / FIXME / "placeholder" left behind | `grep -nE 'TODO\|FIXME\|placeholder' src/spl/spl_init.ts` should not introduce **new** matches (any pre-existing comment markers should be reported as findings, not blockers). |
| No commented-out large blocks (>10 consecutive `//` lines) | `grep -nE '^//.*$' src/spl/spl_init.ts \| wc -l` should be a small number. |
| The `try { … } catch` wraps everything, including the send call | confirmed by reading. |

The evaluator ALSO checks that the four OTHER files were **not** silently improved during Milestone 1:

```bash
git --no-pager diff --stat HEAD -- src/spl/spl_metadata.ts src/spl/spl_mint.ts src/spl/spl_transfer.ts
echo "diff-exit=$?"
```

Expected: empty output (no diff). If non-empty, **scope violation**.

---

## 10. The negative-test catalogue applied to Milestone 1

These are minimum failure-case checks the validator runs *before* declaring Milestone 1 green. Each one is cheap (no SOL spent on real failures; simulation-only or read-only).

| ID | Scenario | Expected |
|---|---|---|
| N1 | `SEND` unset, but RPC unreachable | Script exits non-zero with a surfaced error. **No wallet bytes in stderr.** |
| N2 | `SEND=1`, `simulateTransaction` returns `err` | Script exits non-zero; **no `sendTransaction` call observed**. |
| N3 | `SEND=1`, simulation succeeds, but `sendAndConfirm` times out | Script surfaces the timeout error; recorded for retry policy. |
| N4 | `devnet-wallet.json` corrupted to `[]` | Module-load fails (the empty array is invalid for `createKeyPairSignerFromBytes`). Script exits non-zero **before** any RPC call. |
| N5 | Two concurrent `spl_init` invocations under `SEND=1` | Blockhash race; the second must fail with a clear stale-blockhash error (not silently retry forever). |
| N6 | `SEND=0` but the script accidentally calls `sendTransaction` (regression) | **Hard FAIL** — the gate is supposed to prevent this. |

N6 is the single most important negative test: it directly verifies the safety property of Milestone 1.

---

## 11. Out-of-scope-but-recorded-for-Milestone-2

The evaluator does NOT run these for Milestone 1. They are noted here so they aren't invented twice.

- Token Metadata PDA derivation checks (covered by VP §4.1 Class A; deferred).
- Idempotent ATA assertion in `spl_mint` / `spl_transfer` (VP §4.2; deferred).
- Irys upload / paid actions (VP §4.6; deferred to Milestone 2).
- Core asset mint via `createV1` (VP §4.6; deferred to Milestone 2 or 3).

---

## 12. Final verdict template

When the builder reports done, the evaluator produces a single block:

```
MILESTONE 1 EVALUATION
Date: <ISO timestamp>
Commit: <git rev-parse HEAD>

[PASS|FAIL]  §0  Scope gate
[PASS|FAIL]  §1  Compile check
[PASS|FAIL]  §2  Wallet shape
[PASS|FAIL]  §3  Wallet-leak lint
[PASS|FAIL]  §4  Wallet gitignore
[PASS|FAIL]  §5  SEND-gate behavior (A/B/C + failures)
[PASS|FAIL]  §6  Decoded transaction invariants
[PASS|FAIL]  §7  Plan-log format contract
[PASS|FAIL]  §8  RPC endpoint hygiene
[PASS|FAIL]  §9  Scope-of-source check
[PASS|FAIL]  §10 Negative tests (N1–N6)

Wallet bytes observed in any captured output: <YES/NO>
Number of write RPC calls under SEND=0: <n>
Number of write RPC calls under SEND=1: <n> (n≥1 only if sim passed)

Overall: APPROVE / REJECT
Notes: …
```

---

## 13. Holding pattern

The evaluator is **drafted and waiting**. The builder has not yet reported Milestone 1 done. Current `git status` shows only:

- `M package-lock.json` — incidental (likely a `tsc` install side-effect; not a script change).
- `M src/spl/spl_metadata.ts` — stray diff that should be reverted before Milestone 1 evaluation, OR the evaluator notes it as scope-out (see §0) and asks the builder to confirm the change is intentional and not part of Milestone 1.

The evaluator will not finalize §5.2 expected outputs or §6 decoded-instruction assertions until after reading the post-build `spl_init.ts`. Final expectations in §5.3 / §6 may need light adjustment if the builder chose a slightly different plan-log format or account order — those adjustments will be reported as **findings**, not auto-rejects, unless they leak secrets or break the `SEND` gate.
