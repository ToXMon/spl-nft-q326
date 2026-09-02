# Homework Evaluation Prep — SPL Bootcamp Q326

Captured pre-build so the actual review is a checklist, not a re-read.

## Deliverables to verify (per Turn 0 spec)

| # | Item | Expected location | Key invariant |
|---|------|-------------------|---------------|
| 1 | SPL transfer to new second wallet `hw-wallet-2.json` | modified `src/spl/spl_transfer.ts` | uses recipient derived from hw-wallet-2; SEND gate intact |
| 2 | MPL Core NFT image script | `src/nft/nft_image.ts` | SEND gate; never logs wallet secret |
| 3 | MPL Core NFT metadata script | `src/nft/nft_metadata.ts` | SEND gate; never logs wallet secret |
| 4 | MPL Core NFT mint script | `src/nft/nft_mint.ts` | SEND gate; never logs wallet secret |
| 5 | NFT metadata update script | `src/nft/nft_update.ts` | uses `updateV1`; `newName` invariant; SEND gate |
| 6 | Optional NFT transfer+burn | TBD — check if present | only exists if present |
| 7 | Read-only npm test verification | `tests/verify.ts` | exits 0; never broadcasts; skips on missing prereqs |
| 8 | Submission README | `README.md` | accurately reflects scripts + commands |

## Gates to verify on every new/modified script

- **SEND gate**: `process.env.SEND === "1"` — default dry-run, only `SEND=1` broadcasts.
  - Reject if any script broadcasts without an explicit `SEND` check.
  - Verify the dry-run path prints the plan and returns early (no `sendAndConfirm`).
- **No secret exposure**: search the diff for `console.log` of `wallet`, `secretKey`,
  `bs58.encode(...wallet...)`, `Keypair.fromSecretKey` passed to logger, etc.
  Importing the JSON is fine; logging the bytes is not.
- **Instruction invariants**:
  - `spl_init`: mint = `generateKeyPairSigner`; freeze authority null; fee payer = wallet.
  - `spl_mint`: `getCreateAssociatedTokenIdempotent`; amount = 1_000 × 10^6 base units.
  - `spl_transfer`: `getTransferChecked` with decimals=6; recipient = `hw-wallet-2.json`-derived pubkey (NOT a hardcoded address from a different wallet).
  - `nft_image`: reads `image.png` (or whatever the README says); uses Irys; SEND gate.
  - `nft_metadata`: requires `IMAGE_URI` non-empty (otherwise error + exit 1 OK).
  - `nft_mint`: `createV1` from mpl-core; asset = `generateSigner(umi)`.
  - `nft_update`: `updateV1`; `newName` set; `newUri` optional.
- **Recipient derivation for `hw-wallet-2.json`**: must derive from the 64-byte array,
  not copy from a previously used wallet. The transfer script already shows
  `HLnpgWg3zUovnQtVyJbTKUctfavCqt4ZfZTSjc7zM6G5` — that needs to be re-derived
  from `hw-wallet-2.json` (the file I read contains a 64-byte secret) and may
  already match, or may not. **Verify before approving.**

## Test-suite gate (`tests/verify.ts`)

- Must `process.exit(0)` always (even on errors) — current code does this, good.
- Must be **read-only** — no `sendAndConfirm`, no Irys upload, no keypair signing
  with funds.
- Recipient ATA derivation looks suspicious:
  - Uses `require("../hw-wallet-2.json")` (CommonJS — fine, project is CJS).
  - Then does a tortured double-`await import` of `@solana/kit` to call `address(...)`
    with a value that's been constructed by a function defined *below* the IIFE
    (hoisting works for function declarations, so OK) but whose return is then
    used inside an `address(...)` call. The expression
    `(await import("@solana/kit")).address ? await deriveRecipientAddress(wallet2) : ""`
    is also broken logic: `address` is a function (truthy), so the ternary always
    picks `deriveRecipientAddress(...)`, but only because `address` happens to
    be defined. Fragile — flag but not a blocker if it works.
  - `deriveRecipientAddress` slices `secret.slice(32)` to get the 32-byte public
    key portion of a 64-byte Ed25519 secret key — correct convention.
- NFT_ASSET constant is `""` — that's intentional until mint broadcast.

## README gate

- Must list every new script with command + one-liner.
- Must mention `SEND=1` requirement to actually broadcast.
- Must mention `hw-wallet-2.json` placement + usage for the transfer.
- `image.png` is 615KB — note that README says `image.jpeg`; should match reality.

## Pre-known working state (from prior milestone verdicts)

- `spl_init`, `spl_mint`, `spl_transfer` already follow the SEND-gate pattern
  (verified by reading the files).
- `spl_metadata.ts` is the *outlier* — it has NO SEND gate, broadcasts directly,
  and has a stray base58 txid in a trailing comment (looks like a leftover from
  prior debugging). It is **not** in the new deliverable list, but if the
  modified-files list shows it changed, check whether the change ADDED a SEND
  gate or just edited metadata strings. (Modified per `git status` — must inspect
  diff when review starts.)

## Review execution plan (when signalled)

1. `git diff --stat` + `git --no-pager diff` on modified files
   (`.gitignore`, `package-lock.json`, `src/spl/spl_metadata.ts`,
   `src/spl/spl_transfer.ts`).
2. Check `spl_transfer.ts` recipient — re-derive pubkey from `hw-wallet-2.json`
   and compare to the `to` constant.
3. Run `npm test` (or whatever the test command resolves to) — confirm exit 0.
4. Grep new NFT scripts for `console.log(.*wallet` and `bs58.encode(...wallet`.
5. Spot-check each new script for SEND gate presence.
6. Read README — accuracy vs scripts.
7. Verdict: PASS / PASS-WITH-NITS / FAIL with specific gate failures.

## Time-box

~15 minutes for the actual review. Homework due <2h, so this leaves time for
one round of fixes if anything fails.
