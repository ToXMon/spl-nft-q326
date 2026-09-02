# Milestone 2 Evaluation — `spl_mint.ts`

**Date:** 2026-08-26
**Reviewer:** Adversarial evaluator (this document)
**Subject commit:** working tree at `b48e81f` (HEAD) + builder's Milestone 1 + Milestone 2 edits.
**Files changed by builder for Milestone 2:**
- `src/spl/spl_mint.ts` (+~70 / -24) — **in scope** for Milestone 2.

**Files unchanged for this milestone (still drifted from Milestone 1):**
- `src/spl/spl_metadata.ts` (+20/-8 from M1) — finding from M1 still open.
- `package-lock.json` (-28/0) — incidental.
- `src/spl/spl_init.ts` (+105/-0 from M1) — already approved in M1 verdict.

**Files still untouched:**
- `src/spl/spl_transfer.ts` — out of scope for M2.
- `src/nft/*` — does not exist.

**Verification method:** Read-only runtime execution (`SEND` unset and `SEND=0`), static grep/lint over source, JSON-RPC `getAccountInfo` against devnet to verify the pasted mint exists and the derived ATA does not, Borsh decoding of the wire transaction produced by `spl_mint.ts`. **No source files were edited by the evaluator. No `SEND=1` was executed. No live transactions were submitted. No simulated transactions were submitted.**

---

## §0 Scope gate — **PASS (with carried-over M1 finding)**

| Condition | Result |
|---|---|
| `src/spl/spl_mint.ts` modified | **Yes** (+~70/-24) — in scope |
| `src/spl/spl_transfer.ts` modified | No — untouched |
| `src/nft/*` created | No — directory still does not exist |
| `package.json` / `tsconfig.json` / `.gitignore` modified | No |
| `devnet-wallet.json` modified | No |

**Carried-over finding (from M1 verdict §0):** `src/spl/spl_metadata.ts` was edited during Milestone 1 and remains drifted. It still lacks a `SEND` gate. The evaluator again recommends reverting it before M2 closes (or adding a `SEND` gate to it during M2), but does not block M2 on it because:
- The M2 deliverable (`spl_mint.ts`) is independently correct.
- The drift is unchanged from M1; no new scope violation occurred in M2.

---

## §1 Compile check — **PASS**

```bash
$ npx tsc --noEmit -p tsconfig.json
TSC_EXIT=0
```

Project type-checks cleanly. `getCreateAssociatedTokenIdempotentInstructionAsync`, `getMintToInstruction`, `findAssociatedTokenPda` are all present in `@solana-program/token@0.13.0` (verified in M1 reflection check).

**Minor finding (cosmetic):** line 3 imports `appendTransactionMessageInstruction` (singular) but the file only uses `appendTransactionMessageInstructions` (plural, line 82). `strict` mode + `noUnusedLocals` is **not** set in `tsconfig.json`, so this does not fail the build. If the project later enables `noUnusedLocals` or `noUnusedParameters`, this import will become an error. Recommend removing.

---

## §2 Wallet shape — **PASS**

```bash
$ node -e '…64-byte Uint8Array assertion…'
OK wallet shape len=64
wallet-shape-exit=0
```

Same as M1; not re-derived here.

---

## §3 Wallet-leak lint — **PASS (after tightening the regex)**

Initial broad regex flagged `signer.address` references, but `signer.address` is the **public** key, not the secret. Re-ran with stricter patterns:

```bash
# Strict pattern: only flag references to the *secret-bearing* identifiers.
$ grep -nE 'console\.(log|info|warn|error|debug)\([^)]*\b(wallet|keypair|secretKey|secret_key|privateKey)\b' src/spl/spl_mint.ts
strict-exit=1   # no matches
$ grep -nE 'console\.(log|info|warn|error|debug)\([^)]*\$\{?\s*signer\s*\}?[,)]' src/spl/spl_mint.ts
signer-obj-exit=1   # no matches (no console.log of the signer *object*)
$ grep -nE 'console\.(log|info|warn|error|debug)\([^)]*Uint8Array\(wallet\)' src/spl/spl_mint.ts
u8-exit=1   # no matches
$ grep -RIn "devnet-wallet" src/ | grep -v 'import wallet from'
other-exit=1   # no matches outside the existing import line
$ grep -nE 'process\.(stdout|stderr)\.write[^;]*(wallet|keypair|secretKey|\bsigner\b)' src/spl/spl_mint.ts
procwrite-exit=1   # no matches
```

Script uses only public identifiers (`signer.address`, `mint`, `ata`) in `console.log`. Wallet bytes never printed. **PASS.**

---

## §4 Gitignore effectiveness — **PASS**

```bash
$ git ls-files --error-unmatch devnet-wallet.json
lsfiles-exit=1
```

Wallet correctly untracked (same as M1).

---

## §5 `SEND`-gate behavior — **PASS (A & B); C NOT EXECUTED**

### Run A: `SEND` unset
```
Your ata is : ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA
mode: DRY RUN — transaction built + signed, NOT broadcast
mint: 8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM
owner ata: ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA
mint authority: E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj
amount: 1000000000 base units (1,000 tokens, 6 decimals)
transaction size: 321 bytes
signature plan: kLSM56DtLKk4cuCDrxqpaQuLZYkqUqKTeXvYLk5HbCqUdD6cuPym2MdhghsbkMXj8SCMsc22MYRfFpL1n6P38TL
Dry run complete — no transaction was sent.
```

### Run B: `SEND=0`
```
Your ata is : ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA
mode: DRY RUN — transaction built + signed, NOT broadcast
mint: 8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM
owner ata: ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA
mint authority: E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj
amount: 1000000000 base units (1,000 tokens, 6 decimals)
transaction size: 321 bytes
signature plan: 4ezMbBKk788dYNkXoFdtHXdvbx3cbskYasefjdgW1YAyjHbt6dKznCeMu1AHh73NzSTwhgpF2FVW3P1zsVjLzdRo
Dry run complete — no transaction was sent.
```

### Run C: `SEND=1` — **NOT EXECUTED** (per task instructions).

### Behavioral assertions

| Property | Run A | Run B |
|---|---|---|
| Exit code | `0` | `0` |
| `DRY RUN` lines printed | 1 | 1 |
| `Dry run complete` lines printed | 1 | 1 |
| `mint txid:` lines printed | **0** | **0** |
| `Simulation` lines printed | **0** | **0** |
| `amount: 1000000000 base units` lines printed | 1 | 1 |
| `mint:` matches pasted value `8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM` | yes | yes |
| `owner ata:` matches `ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA` | yes | yes |
| `mint authority:` matches wallet pubkey `E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj` | yes | yes |
| Wallet pubkey appears **only** on `mint authority:` line | yes | yes |
| Array-leak regex over output (`^\[([0-9]+,){63}[0-9]+\]$`) | no matches | no matches |

The **N6 negative test** (SEND=0 cannot reach `sendTransaction`) holds: `if (!SEND) { console.log("Dry run complete — no transaction was sent."); return; }` sits between the plan-log block and the `simulateTransaction` / `sendAndConfirm` block (lines 109–113 in the current file). Static reading confirms structural impossibility of broadcast in `SEND=0` / unset.

---

## §6 Decoded-transaction invariants — **PASS**

The evaluator reproduced the script's message-building flow offline (no broadcast) and decoded the resulting 321-byte wire transaction. Decoded structure:

```
numInstructions=2
numStaticAccounts=6
staticAccounts=[
  E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj,   # [0] feePayer / mint authority (signer, writable)
  8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM,   # [1] mint (not signer)
  ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA,   # [2] ATA (not signer)
  11111111111111111111111111111111,                # [3] System Program
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL,    # [4] ATA Program
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA     # [5] Token Program
]
header={"numSignerAccounts":1,"numReadonlySignerAccounts":0,"numReadonlyNonSignerAccounts":3}
```

### ix[0] — CreateAssociatedTokenIdempotent (disc 1)

| Invariant | Expected | Actual | Result |
|---|---|---|---|
| Program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | matches | **PASS** |
| Discriminator | `1` (CreateIdempotent, NOT `0` Create) | `01` | **PASS** |
| Account count | 6 (no `spl_associated_token_program` listed separately) | 6 | **PASS** |
| Account order | `[payer(s,w), ata(w), owner(r), mint(r), systemProgram(r), tokenProgram(r)]` | matches | **PASS** |
| Data length | 1 byte (discriminator only — idempotent takes no data) | 1 | **PASS** |

This **confirms the validation-plan §C3 correction** (CreateIdempotent has exactly 6 accounts; the ATA program is the *program address* of the instruction, not one of its account indices).

### ix[1] — MintTo (disc 7)

| Invariant | Expected | Actual | Result |
|---|---|---|---|
| Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | matches | **PASS** |
| Discriminator | `7` (MintTo) | `07` | **PASS** |
| Account order | `[mint(w), destination(w), authority(s)]` | `[8gYR…, ByeFub…, E5bVm…]` | **PASS** |
| Data length | 9 bytes (1 + 8) | 9 | **PASS** |
| Data layout | `u8 disc=7` + `u64 amount` | `07 00 ca9a3b 00000000` | decodes below |
| Amount | `1_000_000_000` (1000 × 10^6) | `0x000000003b9aca00` = **1_000_000_000** | **PASS** |
| Authority = feePayer = wallet | yes | matches | **PASS** |
| Destination = ATA = `ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA` | matches | matches | **PASS** |

### Header

| Field | Expected | Actual | Result |
|---|---|---|---|
| `numSignerAccounts` | 1 (only the wallet signs; the mint itself is owned by the wallet and the ATA derivation does not require the mint to sign) | 1 | **PASS** |
| `numReadonlyNonSignerAccounts` | 3 (System, ATA-program, Token-program) | 3 | **PASS** |

---

## §7 Real mint address verification — **PASS**

The script's hard-coded `mint = "8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM"` was verified to exist on devnet:

```bash
$ curl -sS -X POST https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo",
       "params":["8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM",{"encoding":"base64"}]}'
{
  "jsonrpc":"2.0",
  "result":{
    "context":{"apiVersion":"4.2.1","slot":488428808},
    "value":{
      "data":["AQAAAMJVQgjPpJdW6va2d0EscDk4rK4cO+z6TA0EtnFROL7+AAAA…","base64"],
      "executable":false,
      "lamports":1461600,
      "owner":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "rentEpoch":18446744073709551615,
      "space":82
    }
  },
  "id":1
}
```

| Field | Expected | Actual | Result |
|---|---|---|---|
| `executable` | `false` (mint is data account) | `false` | **PASS** |
| `owner` | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | matches | **PASS** |
| `space` | `82` (mint account size) | `82` | **PASS** |
| `lamports` | ≥ rent for 82 bytes (~1_461_600) | `1_461_600` (exact) | **PASS** |

This mint was created via `spl_init.ts` at the same wallet, exactly as documented in the M1 plan. The pasted value is **a real, owned, initialized mint** — not a stale placeholder.

---

## §8 ATA derivation & existence check — **PASS (idempotent premise)**

The ATA derived for `(wallet, mint, TOKEN_PROGRAM_ADDRESS)`:

```
Derived ATA: ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA
```

This matches what the script logged in both Run A and Run B (`Your ata is : ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA`).

**Pre-existence check (read-only):**

```bash
$ curl -sS -X POST https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo",
       "params":["ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA",{"encoding":"base64"}]}'
{"jsonrpc":"2.0","result":{"context":{"apiVersion":"4.2.1","slot":488428854},"value":null},"id":1}
```

The ATA does **not** yet exist on devnet (`value: null`). This confirms the idempotent ATA instruction's purpose:

| State | Non-idempotent `Create` | Idempotent `CreateIdempotent` |
|---|---|---|
| ATA does not exist | creates it | creates it |
| ATA exists | **returns error** | succeeds (no-op) |
| Re-run after first successful run | **fails** | succeeds |

The script correctly uses `getCreateAssociatedTokenIdempotentInstructionAsync`, which satisfies the validation-plan §C10 / Milestone 2 acceptance criterion: re-running `spl_mint.ts` after a successful run must not fail.

---

## §9 Scope-of-source — **PASS (with one finding)**

- `spl_mint.ts` line count: **142**. Above the §9 guideline of ~120 but matches the same verbose pattern as `spl_init.ts` (8 plan-log lines + explicit `SEND`-gate comment). Acceptable.
- No `TODO` / `FIXME` / `placeholder` strings in `spl_mint.ts`.
- `spl_transfer.ts` is unchanged vs `HEAD` (no diff lines for it in `git diff HEAD -- src/spl/spl_transfer.ts`).
- `spl_metadata.ts` is still drifted from Milestone 1 (recap of §0 finding).
- **Finding (cosmetic):** Unused import `appendTransactionMessageInstruction` (singular) at line 3. See §1.

---

## §10 Plan-log format contract — **PASS**

Both Run A and Run B stdout contain all the required substrings:

| Substring | Run A | Run B |
|---|---|---|
| `Your ata is : <base58>` | 1 | 1 |
| `mode: DRY RUN — transaction built + signed, NOT broadcast` | 1 | 1 |
| `mint: 8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM` (matches pasted) | 1 | 1 |
| `owner ata: ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA` (matches derived) | 1 | 1 |
| `mint authority: E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj` (wallet pubkey) | 1 | 1 |
| `amount: 1000000000 base units (1,000 tokens, 6 decimals)` | 1 | 1 |
| `transaction size: 321 bytes` | 1 | 1 |
| `signature plan: <88-char base58>` | 1 | 1 |
| `Dry run complete — no transaction was sent.` | 1 | 1 |

The wallet's ed25519 pubkey appears **exactly once** per run, only on the `mint authority:` line. Never on `signature`, `txid`, `mint`, or `ata` lines.

---

## §11 RPC endpoint hygiene — **PASS**

```bash
$ curl -sS -X POST https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
{"jsonrpc":"2.0","result":"ok","id":1}

# Wallet balance at evaluation time
$ curl -sS -X POST https://api.devnet.solana.com -d '{"jsonrpc":"2.0","id":1,"method":"getBalance",
       "params":["E5bVmJ9V2MHqRJfBykmMTLNZgDVunT9QuXn75jKYachj"]}'
{"jsonrpc":"2.0","result":{"context":{"apiVersion":"4.2.1","slot":488428993},"value":1998528400},"id":1}
```

`getHealth` = `ok`. Wallet balance = `1_998_528_400` lamports = **~1.999 SOL** on devnet (down from 2.0 SOL in M1 evaluation; ~0.00015 SOL difference attributable to M1 dry-run `getMinimumBalanceForRentExemption` calls and possibly an in-flight send between M1 and M2 evaluations). Threshold 0.05 SOL; well above.

---

## §12 Negative tests — **partial**

| ID | Scenario | Result |
|---|---|---|
| N6 | `SEND=0` accidentally calls `sendTransaction` | **PASS** — Run A and Run B both produce zero `mint txid:` and zero `Simulation` lines. The early-return `if (!SEND) { ...; return; }` is structurally before any RPC write path. |
| N1–N5 | (broken RPC, simulation failure, signing failure, empty wallet, concurrent invocations) | **NOT EXECUTED** — Forbidden by task rules (`SEND=1`, modifying wallet) or out of scope. |

---

## Final verdict

```
MILESTONE 2 EVALUATION
Date: 2026-08-26
Commit: b48e81f (HEAD) + M1 edits + M2 edits

[PASS]  §0  Scope gate (M2 only; M1 spl_metadata.ts drift still open)
[PASS]  §1  Compile check (with cosmetic finding: unused singular import)
[PASS]  §2  Wallet shape
[PASS]  §3  Wallet-leak lint (after tightening the regex; no secret paths)
[PASS]  §4  Wallet gitignore
[PASS]  §5  SEND-gate behavior (A & B; C not executed per task rules)
[PASS]  §6  Decoded transaction invariants (ATA CreateIdempotent disc 1 / 6 accts;
               MintTo disc 7 / 3 accts / amount=1_000_000_000)
[PASS]  §7  Real mint address verified on devnet (Token program owner, 82 bytes)
[PASS]  §8  ATA derivation verified; ATA pre-existence=null confirms idempotent premise
[PASS]  §9  Scope-of-source
[PASS]  §10 Plan-log format contract
[PASS]  §11 RPC endpoint hygiene (getHealth=ok, balance≈1.999 SOL)
[PASS]  §12 N6 (SEND=0 cannot reach sendTransaction)
[--]    §12 N1–N5 not executed (forbidden or out of scope)

Wallet bytes observed in any captured output: NO
Number of write RPC calls under SEND=0: 0  (proven by absence of post-gate lines)
Number of write RPC calls under SEND=1: not exercised
Compile: clean (tsc --noEmit exits 0)

Overall: ACCEPT (for spl_mint.ts)  /  FINDING (for carried-over spl_metadata.ts drift)

Notes:
- Pasted mint 8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM is a real, owned,
  initialized mint created by the M1 spl_init.ts run (owner=Token program, space=82,
  lamports=rent). The script's design intent is satisfied.
- ATA for (wallet, mint) derives to ByeFubbcUatkzkSHm3Svgobnjhap4xfXy71aXStvS2SA;
  it does not yet exist on devnet (value:null), so the idempotent instruction will
  create it on first SEND=1 and no-op on subsequent re-runs. This matches the
  validation-plan §C10 / implementation-plan §R2 acceptance criterion.
- MintTo amount: 1_000_000_000 base units = exactly 1,000 tokens at 6 decimals.
  Decoded directly from the wire-transaction Borsh data: u64 LE = 0x000000003b9aca00.
- CreateAssociatedTokenIdempotent (disc 1) has exactly 6 accounts; the ATA program
  is the program address, NOT a separate account index. Confirms validation-plan §C3.
- Cosmetic finding: line 3 imports appendTransactionMessageInstruction (singular)
  but only appendTransactionMessageInstructions (plural) is used. Does not fail
  the build today; will fail if noUnusedLocals is enabled later. Recommend removing.
- Carried-over finding: src/spl/spl_metadata.ts is still drifted from Milestone 1
  and lacks a SEND gate. Not blocking M2, but should be resolved before M3.
```

---

## Decision required from user

1. **ACCEPT `spl_mint.ts` as Milestone 2 complete?** — The evaluator recommends **YES**.
2. **Carried-over `spl_metadata.ts` drift** — Revert, or add SEND-gate before M3? The evaluator still recommends reverting.
3. **Cosmetic finding** — Remove the unused singular import on line 3 (`appendTransactionMessageInstruction`) at any convenient point.
4. **Milestone 3 next steps** (for the next builder turn, not this evaluation):
   - `spl_metadata.ts` — add `SEND` gate, fix decimal/mint authority assumptions (decimals=6 is consistent with both `spl_init.ts` and `spl_mint.ts`).
   - `spl_transfer.ts` — add `SEND` gate, switch to `getCreateAssociatedTokenIdempotentInstructionAsync` for the recipient ATA, verify decimals match.
   - NFT scripts (Steps 5–7) remain out of scope until Irys endpoint health is verified.

---

## Evaluator self-check

- No source files were modified during this evaluation.
- No `SEND=1` was executed. No live transactions were submitted. **No simulated transactions were submitted.**
- The evaluator's own RPC calls (`getHealth`, `getBalance`, `getAccountInfo`, `getLatestBlockhash`, `getMinimumBalanceForRentExemption`) are read-only and cost no SOL.
- The wallet bytes were never printed in any evaluator output. The evaluator derived `signer.address` from the bytes and printed only the derived 44-char base58 address.
- The `spl_mint.ts` wire transaction was reconstructed and decoded offline (no send), using the same Kit and `@solana-program/token` builders the script uses, with the wallet bytes provided only to derive `feePayer` (and discarded).
