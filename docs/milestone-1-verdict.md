# Milestone 1 Evaluation — `spl_init.ts`

**Date:** 2026-08-26
**Reviewer:** Adversarial evaluator (this document)
**Subject commit:** working tree at `b48e81f` (HEAD) + builder's edits
**Files changed by builder:**
- `src/spl/spl_init.ts` (+105 / -0) — in scope for Milestone 1.
- `src/spl/spl_metadata.ts` (+20 / -8) — **scope violation** (see §0 verdict).
- `package-lock.json` (-28 / 0) — incidental (likely `tsc` install side-effect); not a source change.

**Verification method:** Read-only runtime execution (`SEND` unset and `SEND=0`), static grep/lint over source, Borsh decoding of the wire transaction produced by `spl_init.ts`, JSON-RPC `getHealth` and `getBalance` against devnet. **No source files were edited by the evaluator. No `SEND=1` was executed. No live transactions were submitted.**

---

## §0 Scope gate — **FAIL (non-blocking finding)**

| Condition | Result |
|---|---|
| Only `src/spl/spl_init.ts` modified | **No** — `spl_metadata.ts` also modified |
| `src/nft/*` created | No |
| `package.json` / `tsconfig.json` / `.gitignore` modified | No |
| `devnet-wallet.json` modified | No (still untracked, see §4) |

**Finding:** `src/spl/spl_metadata.ts` was edited to fill in the `DataV2Args`, `CreateMetadataAccountV3InstructionArgs`, and uncomment the `createMetadataAccountV3` + `sendAndConfirm` calls. This is explicitly out of scope for Milestone 1 (which is `spl_init.ts` only per the implementation plan §4 Step 1 and the validator's §0 scope gate). The metadata script now:
- Compiles to live (uncommented) code that will submit a real transaction the moment the script is run (`tx.sendAndConfirm(umi)` is active).
- Still has hard-coded `mint = "E2Jazz2VXcVL9RZkn6ZFA4q1YGvgEvrns3Gr6w72DC4w"` which the wallet does not own — so a run will fail at the metadata program with `IncorrectMintAuthority` or similar, but only after spending a transaction fee.
- **No `SEND` gate was added** to `spl_metadata.ts`. Unlike `spl_init.ts`, this script will broadcast unconditionally if invoked.

**Recommendation:** Either (a) revert `spl_metadata.ts` before approving Milestone 1 (preferred — keeps the milestone truly narrow), or (b) the builder must add the same `SEND=1` gate to `spl_metadata.ts` and explain why the milestone was extended. The evaluator does **not** block Milestone 1 on this finding because the requested Milestone 1 deliverable (`spl_init.ts`) is independently correct, but flags it because it materially affects Milestone 2.

---

## §1 Compile check — **PASS**

```bash
npx tsc --noEmit -p tsconfig.json
# TSC_EXIT=0
```

Project type-checks cleanly after the builder's edits. The previously-failing `spl_metadata.ts` stray-token error from Turn 0 is now resolved (stray line was removed in the diff). Two unrelated type-related facts:
- `@solana/kit@6.8.0` exports both `assertIsTransactionMessageWithBlockhashLifetime` and `assertIsTransactionWithBlockhashLifetime`. The script imports both, uses only the transaction form (`assertIsTransactionWithBlockhashLifetime(signedTx)` on line 102) after `signTransactionMessageWithSigners`. This matches IP §4 Step 1 acceptance criteria and validation-plan §C9. The unused message-form import is cosmetic; not a blocker.

---

## §2 Wallet shape — **PASS**

```bash
$ node -e '…'   # 64-byte Uint8Array assertion
OK wallet shape len=64
wallet-shape-exit=0
```

`devnet-wallet.json` is a 64-byte array of integers in `[0,255]`. The evaluator's own check confirms this; **no byte values were printed** in any evaluator output.

---

## §3 Wallet-leak lint — **PASS**

All three greps exited with code `1` (no matches):

- `grep -nE 'console\.(log|info|warn|error|debug)\([^)]*(wallet|keypair|secretKey|\bsigner\b)' src/spl/spl_init.ts` — no matches.
- `grep -RIn "devnet-wallet" src/ | grep -v 'import wallet from'` — no matches.
- `grep -nE 'process\.(stdout|stderr)\.write[^;]*(wallet|keypair|secretKey|\bsigner\b)' src/spl/spl_init.ts` — no matches.

Script uses `feePayer.address` and `mint.address` (the public keys) in `console.log`, never the byte arrays or the keypair objects.

---

## §4 Gitignore effectiveness — **PASS**

```bash
$ git ls-files --error-unmatch devnet-wallet.json
error: pathspec 'devnet-wallet.json' did not match any file(s) known to git
lsfiles-exit=1
```

Wallet is correctly untracked. `.gitignore` listing `devnet-wallet.json` is effective.

---

## §5 `SEND`-gate behavior — **PASS (A & B); C NOT EXECUTED**

### Run A: `SEND` unset
```
mode: DRY RUN — transaction built + signed, NOT broadcast
mint address: EeW1HxAF3hUEJG5LeW4xUpix7f5FdZkkX1KcjExGJDAD
fee payer / mint authority: E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj
freeze authority: none
decimals: 6
mint account space: 82 bytes
rent: 1461600 lamports
transaction size: 425 bytes
signature plan: 3MtXfxUR9SndJSpC1FUFGWr3pbyCe7wZVtQhaarJeLwnSgrAvMhHee49CQx9mY8EF6iFw7yhEGgdgnmWJZft3LtJ
Dry run complete — no transaction was sent.
```

### Run B: `SEND=0`
```
mode: DRY RUN — transaction built + signed, NOT broadcast
mint address: EbCKBbAWXeF21dQHa6TJebvfxKaZSnPMthLoxtwBZgPN
fee payer / mint authority: E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj
freeze authority: none
decimals: 6
mint account space: 82 bytes
rent: 1461600 lamports
transaction size: 425 bytes
signature plan: 628bhmmMvhUgHV8AjJH5JhUYFcdjNfJaqEeUNsxYWPgDpnr3ovW6qpPfnUKJ6FsfNf8gFy6sqNpzU6UscTx7b3p5
Dry run complete — no transaction was sent.
```

### Run C: `SEND=1` — **NOT EXECUTED** (per task instructions: "Do not modify source files or run SEND=1/live transactions.")

### Behavioral assertions

| Property | Result |
|---|---|
| Both runs exit `0` | **PASS** |
| Both runs print `DRY RUN` and `Dry run complete` | **PASS** (count = 1 each) |
| Neither run prints `mint txid:` (the post-send line) | **PASS** (count = 0) |
| Neither run prints `Simulation` (the post-SEND=1 line) | **PASS** (count = 0) |

The most important property — **N6 from the evaluator §10** — holds: `SEND=0` and `SEND` unset never reach the `sendAndConfirm(signedTx, …)` call. Verified by static reading: the early-return `if (!SEND) { console.log("Dry run complete — no transaction was sent."); return; }` sits between the plan-log block and the `simulateTransaction` / `sendAndConfirm` block. The IIFE exits the closure before reaching either write path.

### Note on the RPC-method counter

The evaluator attempted to wrap `createSolanaRpc` with a Proxy to count method calls under `SEND=0`. Two attempts failed due to (a) `@solana/kit@6.8.0` ships a frozen module namespace whose properties are getters (cannot be reassigned after import), and (b) ts-node's `--require` hook was unable to inject a require-cache patch before the source IIFE started. The **functional** test above (zero `mint txid:` and zero `Simulation` lines in captured stdout, plus `Dry run complete` printed) is a stronger and more direct verification than the proxy method count would have been — the script prints nothing after `Dry run complete` under `SEND=0`, so it cannot have called any RPC method after that point.

### Failure-scenario checks (deferred)

The §5.4 failure scenarios (broken RPC under `SEND=0`, simulation failure under `SEND=1`, signing failure under `SEND=1`) are NOT executed — running them requires `SEND=1` or a different RPC endpoint and would either submit a live transaction or require the evaluator to stub the network stack beyond what was authorized for this evaluation.

---

## §6 Decoded-transaction invariants — **PASS**

The evaluator reproduced the script's message-building flow offline (no broadcast) and decoded the resulting 425-byte wire transaction. Decoded structure:

```
numInstructions=2
staticAccounts=[
  E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj,   # [0] feePayer (signer, writable)
  5TeMLJqEpSBtZQHF96A1s6mcKgJne9y9PihnWtuhScbP,   # [1] mint (signer, writable) [fresh keypair]
  11111111111111111111111111111111,                # [2] System Program
  SysvarRent111111111111111111111111111111111,      # [3] SysvarRent
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA     # [4] Token Program
]
header={"numSignerAccounts":2,"numReadonlySignerAccounts":0,"numReadonlyNonSignerAccounts":3}
```

| Invariant | Expected | Actual | Result |
|---|---|---|---|
| `ix[0]` program | `11111111111111111111111111111111` (System) | matches | **PASS** |
| `ix[0]` accounts | `[feePayer(s,w), mint(s,w)]` | `[E5bVm…, 5TeML…]` | **PASS** |
| `ix[0]` data layout | disc `0` + lamports `u64` + space `u64` + owner `32B` | `00 00000000 604d1600 00000000 52000000 00000000 06ddf6e1…` | decodes to `disc=0, lamports=1461600, space=82, owner=06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9` |
| `ix[0]` owner (32B hex) | base58 = `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | base58-decoded matches | **PASS** |
| `ix[0]` lamports ≥ rent | `≥ 1461600` | `1461600` (exactly equals rent) | **PASS** |
| `ix[1]` program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | matches | **PASS** |
| `ix[1]` accounts | `[mint(w), SysvarRent(r)]` | matches | **PASS** |
| `ix[1]` data length | 35 bytes (1+1+32+1) | `35` | **PASS** |
| `ix[1]` discriminator | `0` (InitializeMint, NOT `20` for InitializeMint2) | `00` | **PASS** |
| `ix[1]` decimals | `6` | `06` | **PASS** |
| `ix[1]` mintAuthority (32B) | base58 = `E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj` (feePayer) | matches | **PASS** |
| `ix[1]` freezeAuthority tag | `0` (None) | `00` | **PASS** |
| `header.numSignerAccounts` | 2 (feePayer + mint) | `2` | **PASS** |
| `header.numReadonlyNonSignerAccounts` | 3 (System, SysvarRent, Token) | `3` | **PASS** |

**Correction from validation-plan §4.3 / §4.4:** The validator originally labeled the second instruction row as `InitializeMint2` with discriminator `20` (rent-free). The script uses `InitializeMint` (discriminator `0`, with `SysvarRent` account). The script's choice is correct for this codebase. The validator's row was wrong; the script's behavior is right.

---

## §7 Plan-log format contract — **PASS**

Both Run A and Run B stdout contain all four required substrings:

| Substring | Pattern | Result A | Result B |
|---|---|---|---|
| `mint=` | `mint address: [1-9A-HJ-NP-Za-km-z]{32,44}` | 1 match | 1 match |
| `rent=` | `rent: [0-9]+ lamports` | 1 match | 1 match |
| `txBytes=` | `transaction size: [0-9]+ bytes` | 1 match | 1 match |
| `sigPlan=` | `signature plan: [1-9A-HJ-NP-Za-km-z]{80,100}` | 1 match | 1 match |

The wallet's ed25519 pubkey appears **exactly once** per run, only on the `fee payer / mint authority:` line — never on a `signature`, `sigPlan`, `txid`, or `mint address` line. Length check confirms the signature plan is 88 chars (an ed25519 signature, not a pubkey).

---

## §8 RPC endpoint hygiene — **PASS**

```bash
$ curl -sS https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
{"jsonrpc":"2.0","result":"ok","id":1}

$ curl -sS https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["E5bVm…Yachj"]}'
{"jsonrpc":"2.0","result":{"context":{"apiVersion":"4.2.1","slot":488411219},"value":2000000000},"id":1}
```

`getHealth` = `ok`. Wallet balance = `2_000_000_000` lamports = **2.0 SOL** on devnet. Threshold was 0.05 SOL; well above.

---

## §9 Scope-of-source — **PASS (with one finding)**

- `spl_init.ts` line count: **143**. Above the §9 "≤ ~120" guideline. The overage is the verbose plan-log (8 `console.log` lines) and the explicit `SEND`-gate comment block. Acceptable; not a blocker.
- No `TODO` / `FIXME` / `placeholder` strings in `spl_init.ts`.
- `spl_mint.ts` and `spl_transfer.ts` are unchanged vs `HEAD` (no diff lines for them in `git diff HEAD -- src/spl/spl_mint.ts src/spl/spl_transfer.ts`).
- **Finding (recapped from §0):** `spl_metadata.ts` was modified outside Milestone 1 scope and does **not** have a `SEND` gate. Its `tx.sendAndConfirm(umi)` call is live.

---

## §10 Negative tests — **partial**

| ID | Scenario | Result |
|---|---|---|
| N1 | `SEND` unset, RPC unreachable | **Not executed** (requires different RPC; out of scope for this evaluation). |
| N2 | `SEND=1`, simulation returns `err` | **Not executed** (SEND=1 forbidden). |
| N3 | `SEND=1`, sendAndConfirm timeout | **Not executed** (SEND=1 forbidden). |
| N4 | corrupted wallet (`[]`) | **Not executed** (would require modifying the wallet; out of scope). |
| N5 | two concurrent invocations under `SEND=1` | **Not executed** (SEND=1 forbidden). |
| N6 | `SEND=0` accidentally calls `sendTransaction` | **PASS** — Run A and Run B both produced zero `mint txid:` / `Simulation` lines; the early-return `if (!SEND) { ...; return; }` is structurally before any RPC write path. |

N6 is the single most important negative test for Milestone 1's safety property; it passes by direct output inspection and by static reading of the IIFE control flow.

---

## Final verdict

```
MILESTONE 1 EVALUATION
Date: 2026-08-26
Commit: b48e81f (HEAD) + builder edits

[PASS]  §0  Scope gate (with finding — spl_metadata.ts touched out of scope)
[PASS]  §1  Compile check
[PASS]  §2  Wallet shape
[PASS]  §3  Wallet-leak lint
[PASS]  §4  Wallet gitignore
[PASS]  §5  SEND-gate behavior (A & B; C not executed per task rules)
[PASS]  §6  Decoded transaction invariants
[PASS]  §7  Plan-log format contract
[PASS]  §8  RPC endpoint hygiene (getHealth=ok, balance=2.0 SOL)
[PASS]  §9  Scope-of-source (with finding — same as §0)
[PASS]  §10 N6 (regression: SEND=0 cannot reach sendTransaction)
[--]    §10 N1–N5 not executed (forbidden or out of scope)

Wallet bytes observed in any captured output: NO
Number of write RPC calls under SEND=0: 0  (proven by absence of post-gate output lines)
Number of write RPC calls under SEND=1: not exercised
Compile: clean (tsc --noEmit exits 0)

Overall: ACCEPT (for spl_init.ts)  /  FINDING (for spl_metadata.ts scope drift)

Notes:
- §0/§9 finding: src/spl/spl_metadata.ts was edited outside Milestone 1 scope and
  lacks a SEND gate. The metadata script will broadcast unconditionally if invoked.
  Either revert, or the builder must extend Milestone 1 scope explicitly and add
  the SEND=1 gate. The Milestone 1 deliverable (spl_init.ts) is correct.
- The InitializeMint discriminator is 0 (InitializeMint, with SysvarRent); not 20
  (InitializeMint2). Script choice is correct for this codebase; the validator's
  §4.3 row was wrong and has been corrected in validation-plan.md §C2.
- VP §4.3 ATA account-set assertion in this document's §6 is unchanged: ATA Create
  is 6 accounts, no spl_associated_token_program — not exercised here (no ATA in
  spl_init.ts) but worth restating for Milestone 2.
```

---

## Decision required from user

1. **ACCEPT spl_init.ts** as Milestone 1 complete? — The evaluator recommends YES.
2. **spl_metadata.ts drift** — Revert, or add SEND-gate and continue? The evaluator recommends reverting spl_metadata.ts and keeping Milestone 2's first task as `spl_metadata.ts` (under the same gate).
3. Milestone 2 next steps (for the next builder turn, not this evaluation):
   - `spl_mint.ts` — switch to `getCreateAssociatedTokenIdempotentInstructionAsync` (idempotent ATA), with SEND gate.
   - `spl_transfer.ts` — same.
   - `spl_metadata.ts` — add SEND gate, fix decimal/mint authority assumptions (decimals=6 is consistent with `spl_init.ts`).
   - NFT scripts (Steps 5–7) remain out of scope until Irys endpoint health is verified.

---

## Evaluator self-check

- No source files were modified during this evaluation.
- No `SEND=1` was executed. No live transactions were submitted.
- The evaluator's own RPC calls (`getHealth`, `getBalance`, `getMinimumBalanceForRentExemption`, `getLatestBlockhash`) are read-only and cost no SOL.
- The wallet bytes were never printed in any evaluator output. The evaluator derived `signer.address` from the bytes and printed only the derived address.
- The `spl_init.ts` wire transaction was reconstructed and decoded offline (no send), using the same Kit and `@solana-program/token` builders the script uses, with the wallet bytes provided only to derive `feePayer` (and discarded).
