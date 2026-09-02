# Validation Plan — `spl-nft-q326`

**Project:** `scripts-solana-2` (`/Users/tolushekoni/sb2026/spl-nft-q326`)
**Scope:** Static/type validation + devnet on-chain checks for `src/spl/*` and (when added) `src/nft/*`.
**Posture:** Adversarial validation planner. **No code changes, no `npm install`, no transactions submitted by this plan.** This document only prescribes checks; executing them is a later step.

> **Wallet safety.** `devnet-wallet.json` is a raw keypair committed to the repo root. Per `.gitignore` it is *intended* to be ignored, but it currently sits at the project root and **must not** be read or logged by any validator. Validators must only consume its *public* `signer.address` after `createKeyPairSignerFromBytes`, never the secret bytes. No validator should echo `wallet`, the bytes, or `keypair.secretKey`. Treat the bytes as write-once at startup, then drop.

---

## 0. What exists today

| File | Status | Risk surface |
|---|---|---|
| `src/spl/spl_init.ts` | Imports wired up, body empty (only `try {} catch {}`). | Imports `assertIsTransactionMessageWithBlockhashLifetime` — needs `assertIsTransactionWithBlockhashLifetime` instead (see §6.3). |
| `src/spl/spl_mint.ts` | Hard-coded mint `E2Jazz2VXcVL9RZkn6ZFA4q1YGvgEvrns3Gr6w72DC4w`; ATA derivation wired; instruction bodies commented out. | Hard-coded mint is the only thing tying the script to a runnable state. |
| `src/spl/spl_transfer.ts` | Hard-coded `mint` and recipient `9EUd4VNcjMAysd7zQk3Q1a4tb28BYndLNBAQDiYnHJ64`; ATAs derived; instructions commented out. | Same as above + recipient must be an on-curve wallet you control on devnet (a PDA will fail at signing). |
| `src/spl/spl_metadata.ts` | UMI wired; `mint` hard-coded; metadata body is **broken source** — `change the metadata` is a stray comment, and the calls to `createMetadataAccountV3` are inside `//` line comments. | Won't compile as-is. Static check will catch this. |
| `src/nft/*` | Referenced in `package.json` and README but **no files exist on disk yet.** | Plan accommodates this with skipped-but-archivable checks. |

### Implementation risks already visible (read-only audit)

1. **`spl_metadata.ts` will not type-check.** It contains stray identifier `change the metadata` and dead commented code with unbalanced `{` / `}`. It also imports `CreateMetadataAccountV3InstructionAccounts` but not `CollectionDetails` / `Uses` types, and the type-of `DataV2` is named `DataV2Args` in v3.x — verify the actual export before relying on it (see §6.2).
2. **`spl_init.ts` imports the wrong assertion name.** `@solana/kit@^6.8.0` exports `assertIsTransactionWithBlockhashLifetime` (the **transaction** form). The file imports `assertIsTransactionMessageWithBlockhashLifetime` (the **message** form, used before signing). If the body is ever filled in with a pre-sign flow, the import is correct; if a post-sign flow is used, it must be the transaction form. Flag this and do not silently "fix" without confirming intent.
3. **Hard-coded addresses.** `E2Jazz2VXcVL9RZkn6ZFA4q1YGvgEvrns3Gr6w72DC4w` and `9EUd4VNcjMAysd7zQk3Q1a4tb28BYndLNBAQDiYnHJ64` are baked in. Running `spl_mint`/`spl_transfer` against an account you don't own will fail signing. Validators must check `getAccountInfo` ownership before any check that requires signing.
4. **`devnet-wallet.json` is committed to disk** at the project root despite `.gitignore` listing it. `.gitignore` is effective only going forward; the file is already tracked-ignored, but a validator that diffs `.gitignore` against `git ls-files devnet-wallet.json` will find this is untracked (good). Still: ensure no validator logs or prints the file contents.
5. **`"type": "commonjs"` + ts-node + `@solana/kit@^6.8.0`** is a known friction point. Kit ships dual ESM/CJS but ts-node's default CJS transpile path can produce `ERR_REQUIRE_ESM`-style errors for sub-imports. Plan does not resolve this — that is an implementation concern.

---

## 1. Goals & non-goals

**Goals**
- Assert that every script (a) compiles under `tsconfig.json`, (b) derives PDAs / addresses against the official Solana programs, (c) constructs instructions with the correct discriminators and account sets, (d) on devnet, mutates only the expected accounts and produces a confirmed signature.
- Catch regressions in **derivation logic** and **instruction shape** without spending SOL.
- Never expose wallet secret bytes in logs, exit codes, or test artifacts.

**Non-goals (this plan)**
- Implementing new scripts.
- Submitting any transaction.
- Installing packages (validators assume `node_modules` already matches `package-lock.json`).
- Running on mainnet.

---

## 2. Prerequisite invariants (asserted before any test runs)

These are preconditions that, if false, make every other check meaningless.

| # | Invariant | How to check (read-only) |
|---|---|---|
| P1 | `devnet-wallet.json` is a JSON array of 64 numbers in `[0,255]`. | `node -e "const a=require('./devnet-wallet.json'); console.assert(Array.isArray(a)&&a.length===64&&a.every(b=>Number.isInteger(b)&&b>=0&&b<=255))"` — read-only. **Never print the array.** |
| P2 | The wallet's public key equals the expected devnet funder. | `solana-keygen pubkey devnet-wallet.json` or, in TS, only `signer.address` (printed). |
| P3 | The wallet has ≥ 0.05 SOL on devnet (enough for ~3 mints + a metadata tx). | `solana balance devnet-wallet.json --url devnet` or RPC `getBalance`. |
| P4 | `devnet-wallet.json` is **not** tracked by git. | `git ls-files --error-unmatch devnet-wallet.json` should exit non-zero. |
| P5 | RPC endpoint reachable. | `curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`. |
| P6 | `@solana/kit` major version matches `^6.8.0`. | `node -p "require('@solana/kit/package.json').version"` (or `cat node_modules/@solana/kit/package.json | grep version`). |
| P7 | `@solana-program/token` exports `getMintSize`, `TOKEN_PROGRAM_ADDRESS`, `getInitializeMintInstruction`, `findAssociatedTokenPda`, `getCreateAssociatedTokenIdempotentInstructionAsync`, `getMintToInstruction`, `getTransferCheckedInstruction`. | Reflection test in §5.1. |

If any precondition fails, stop and report — do not proceed to on-chain checks.

---

## 3. Static / type validation

Run, in order, on the existing source tree. **Do not modify the scripts as part of validation.**

### 3.1 TypeScript compile (whole project)

```bash
npx tsc --noEmit -p tsconfig.json
```

**Expected output:** no errors. **Current state:** `spl_metadata.ts` will fail (`change the metadata` stray token, unclosed `// { ...` block). Record the actual error list. **Do not fix.**

If the project's TypeScript pin (`^6.0.3` — note this is ahead of the released TS line as of 2025; verify installed) cannot resolve Kit's CJS dual-package output, also run:

```bash
npx tsc --noEmit --module commonjs --moduleResolution node --skipLibCheck -p tsconfig.json
```

### 3.2 Targeted per-script shape checks (no execution)

For each of `src/spl/spl_init.ts`, `src/spl/spl_mint.ts`, `src/spl/spl_transfer.ts`, `src/spl/spl_metadata.ts`:

```bash
# Confirm the script parses as ES2022 + CommonJS without running it.
node --check dist/<name>.js      # only after a throwaway transpile, see §3.3
npx esbuild src/spl/<name>.ts --bundle=false --format=cjs --platform=node --outfile=/tmp/<name>.cjs
node --check /tmp/<name>.cjs
```

(`esbuild` is already pulled in transitively by Kit's toolchain in most setups; if not present, skip and rely on `tsc`. Do not `npm install` new packages for this.)

### 3.3 Identifier surface test

A small `tools/validate-imports.ts` (added by a future implementation step, **not by this plan**) would assert that the names imported by each script actually exist on the installed packages. For this plan, document the expected imports per file:

| File | Expected names |
|---|---|
| `spl_init.ts` | `appendTransactionMessageInstruction(s)`, `assertIsTransactionMessageWithBlockhashLifetime` *(or `…WithBlockhashLifetime` — see §6.3)*, `createKeyPairSignerFromBytes`, `createSolanaRpc`, `createSolanaRpcSubscriptions`, `createTransactionMessage`, `generateKeyPairSigner`, `getSignatureFromTransaction`, `sendAndConfirmTransactionFactory`, `setTransactionMessageFeePayerSigner`, `setTransactionMessageLifetimeUsingBlockhash`, `signTransactionMessageWithSigners`, `getInitializeMintInstruction`, `getMintSize`, `TOKEN_PROGRAM_ADDRESS`, `getCreateAccountInstruction`. |
| `spl_mint.ts` | `address`, … (rest as `spl_init`), plus `findAssociatedTokenPda`, `getCreateAssociatedTokenInstructionAsync`, `getMintToInstruction`. **Note:** for re-runs use `getCreateAssociatedTokenIdempotentInstructionAsync` instead (see §4.2). |
| `spl_transfer.ts` | `findAssociatedTokenPda`, `getTransferCheckedInstruction` (+ same Kit names as `spl_init`). |
| `spl_metadata.ts` | `createSignerFromKeypair`, `publicKey`, `signerIdentity`, `createUmi`, `createMetadataAccountV3`, `CreateMetadataAccountV3InstructionAccounts`, `CreateMetadataAccountV3InstructionArgs`, `DataV2Args`. **Verify** `DataV2Args` is the actual v3 export — if not, the import must change. |

Reflection check (read-only, no install):

```bash
node -e "console.log(Object.keys(require('@solana/kit')).filter(k => /assertIs|sendAndConfirm|getSignatureFromTransaction/.test(k)).sort())"
node -e "console.log(Object.keys(require('@solana-program/token')).filter(k => /AssociatedToken|InitializeMint|MintTo|TransferChecked|fMintSize|TOKEN_PROGRAM/.test(k)).sort())"
node -e "console.log(Object.keys(require('@metaplex-foundation/mpl-token-metadata')).filter(k => /Metadata|DataV2|CreateMetadata/.test(k)).sort())"
```

Cross-check each emitted name against the "Expected names" table above. Discrepancies are findings, not blockers — record them.

### 3.4 Wallet-handle safety lint

Grep asserts that no source file other than the four existing scripts ever references `devnet-wallet.json`:

```bash
grep -RIn "devnet-wallet" src/ | grep -v "import wallet from"
```

**Expected:** zero output beyond the existing `import wallet from "../../devnet-wallet.json"` lines.

Asserts that no source line ever calls `console.log` on `wallet`, `keypair`, `signer`, or `secretKey`:

```bash
grep -RInE "console\.(log|info|error|warn|debug)\([^)]*(wallet|keypair|secretKey|signer\b)" src/
```

**Expected:** zero output. (Commented-out lines are still a finding — record them.)

---

## 4. On-chain / devnet validation classes

Each class is a *kind* of check, not a script. Implementation will produce concrete validators later.

### 4.1 Class A — Address derivation invariants

**What:** Every PDA / address a script references must match what the program would compute.

| Check | Expected | Method |
|---|---|---|
| `TOKEN_PROGRAM_ADDRESS` | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | Constant equality. |
| `ASSOCIATED_TOKEN_PROGRAM_ID` (ATA) | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | Constant equality. |
| `METAPLEX_TOKEN_METADATA_PROGRAM_ID` | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` | Constant equality. |
| `METAPLEX_CORE_PROGRAM_ID` | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` | Constant equality. |
| Mint account size | `165` bytes | `getMintSize()` === 165. |
| ATA derivation | `findAssociatedTokenPda({ mint, owner, tokenProgram: TOKEN_PROGRAM_ADDRESS })` returns `[address, bump]` | Tuple shape + `address === deriveAta(mint, owner, TOKEN_PROGRAM_ADDRESS)`. |
| Metadata PDA | `["metadata", METAPLEX_TOKEN_METADATA_PROGRAM_ID, mint]` | `getProgramDerivedAddress({ programAddress: META_ID, seeds: [textEncoder.encode("metadata"), b58ToBytes(META_ID), b58ToBytes(mint)] })`. |
| Master Edition PDA | `["metadata", META_ID, mint, "edition"]` | Same shape with extra `"edition"` seed. |
| Core asset PDA | `["asset", collection?, owner, asset_index]` (collection-less variant when no collection) | Mirror per Core docs §3; flagged as TBD-verify because seed order can change between Core minor versions. |

**Failure case to assert:** if a script's hard-coded `mint` (e.g. `E2Jazz2VXcVL9RZkn6ZFA4q1YGvgEvrns3Gr6w72DC4w`) does not own a Metadata PDA on devnet, the metadata call will fail at the `createMetadataAccountV3` step. Pre-flight RPC:

```ts
rpc.getAccountInfo(metadataPda, { encoding: "base64" }).send()
```

If `value === null`, the mint has no metadata — record the finding; this is **not** automatically a bug (could be the script's job).

### 4.2 Class B — Idempotency & re-run safety

| Check | Assertion | Why it matters |
|---|---|---|
| Re-running `spl_init` for the same keypair should **fail fast** (keypair already has a mint account at that pubkey). | After a successful first run, the second invocation must error at `sendTransaction` with `0x0`/`AccountAlreadyInitialized` or similar. | Prevents accidentally overwriting an existing mint. |
| Re-running `spl_mint` after the ATA is created should **not error** *only if* the script uses the **idempotent** ATA instruction (`getCreateAssociatedTokenIdempotentInstructionAsync`). | The non-idempotent `getCreateAssociatedTokenInstructionAsync` returns an error when the ATA already exists. The idempotent variant succeeds. | The current source uses the *non-idempotent* path. A second `spl_mint` invocation will fail unless the script is updated to the idempotent variant. **Finding for the implementation step.** |
| Re-running `spl_metadata` should fail (Token Metadata rejects overwriting metadata). | Re-send returns `InstructionError` or `AlreadyInitialized`. | Matches user intent — you can't quietly overwrite metadata. |
| Re-running `spl_transfer` after the destination has no balance should produce a Token-program `InsufficientFunds` error, not a generic RPC error. | Decode the program error if present. | Distinguishes "no balance" from "wrong mint/owner". |
| Blockhash lifetime. | Use `getLatestBlockhash` and assert `lastValidBlockHeight` > current slot at send time. | Stale-blockhash failures are the most common silent failure. |

### 4.3 Class C — Instruction discriminators & account sets

For each constructed instruction, fetch the program's IDL from the on-chain program (`bincode`/`AccountInfo` returns the program as executable; for IDL use the Metaplex IDL repo) and assert:

| Instruction | Discriminator (u8 first byte) | Required account set (order matters for some SDKs) | Signers |
|---|---|---|---|
| `SystemProgram.CreateAccount` | `0` | `[from (signer, payer), to (signer, writable), ...]` | payer, new account |
| `spl-token.InitializeMint2` | `20` | `[mint (writable), ...]` (no decimals arg — spl-token uses `InitializeMint` for decimals; v0.13 ships `InitializeMint2` which is rent-free.) | mint authority |
| `spl-associated-token-account.Create` | `0` | `[payer (signer, writable), associated_account (writable), owner (readonly), mint (readonly), system_program (readonly), spl_token_program (readonly), spl_associated_token_program (readonly)]` | payer |
| `spl-associated-token-account.CreateIdempotent` | `1` | same | payer |
| `spl-token.MintTo` | `7` | `[mint (writable), destination (writable), authority (signer)]` | mint authority |
| `spl-token.TransferChecked` | `12` | `[source (writable), mint (readonly), destination (writable), authority (signer)]` plus decimals via instruction data | owner/delegate |
| `mpl-token-metadata.CreateMetadataAccountV3` | `33` | `[metadata (writable), mint (readonly), mint_authority (signer), payer (signer, writable), update_authority (signer), system_program (readonly)]` | mint authority, payer, update authority |
| `mpl-core.CreateV1` | `TBD-verify per mpl-core@1.10 IDL` | asset, collection?, owner, payer, system_program | payer, owner |

> **Action for implementation step:** fetch the IDL for each program from the on-chain BPF cache or from the program's `idl.json` in `node_modules` if present. Do **not** assume these discriminators are stable across all SDK versions — re-check against the actually-installed package.

### 4.4 Class D — Account state mutations

After a confirmed transaction, re-read the relevant accounts via `getMultipleAccounts` and assert the expected deltas:

| Mutation | Before | After |
|---|---|---|
| `spl_init` | mint account absent or owned by System program | mint exists, owner = `TOKEN_PROGRAM_ADDRESS`, data length = 165, `state = Initialized`, mintAuthorityOption ≠ 0, supply = 0 |
| `spl_mint` (first run) | no ATA at derived address for `(mint, signer.address)` | ATA exists, owner = `TOKEN_PROGRAM_ADDRESS`, mint = expected mint, amount = `token_decimals` (1_000_000) |
| `spl_metadata` | metadata PDA absent | metadata PDA exists, owner = `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`, data decodes to a `DataV2` whose `name/symbol/uri` match the inputs, `isMutable` reflects the script's flag |
| `spl_transfer` | source ATA amount = X, dest ATA amount = Y (or absent) | source amount = X − amount, dest amount = Y + amount, both mint fields equal |

If a state assertion fails, the script either:
- wrote to the wrong account (compare against the expected PDA),
- supplied wrong data (decode instruction data and assert fields), or
- signed with a wrong authority (decode signers from the transaction's `message.header`).

### 4.5 Class E — Failure-case enumeration

These are *negative* tests. They must be cheap (no SOL spent on real failures — use simulation).

| Scenario | Expected behavior | How to simulate |
|---|---|---|
| `spl_init` re-run against an existing mint keypair | Simulation returns `AccountAlreadyInitialized`. | `rpc.simulateTransaction(tx)` before sending. |
| `spl_mint` with zero decimals and amount = 0 | `MintTo` instruction passes simulation but produces no on-chain change. | Simulate, then `getAccountInfo` (should be unchanged). |
| `spl_mint` with mint authority = a pubkey the signer doesn't own | `Signature verification failed`. | Simulate. |
| `spl_transfer` where source ATA is not owned by signer | `owner does not match` / missing-signer error. | Simulate. |
| `spl_metadata` with `isMutable = false` | Succeeds; subsequent metadata update tx must fail. | Send + replay an update. |
| `spl_metadata` to a mint that already has metadata | `already initialized` (Token Metadata program rejects). | Simulate or send. |
| RPC outage / wrong endpoint | `getLatestBlockhash` throws; script should surface the error, not swallow it. | Point at `https://api.devnet.solana.com` but mock with a closed port for the test. |

> **Simulation note.** Always call `rpc.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })` **before** sending. This is a read-only RPC and costs no SOL. If simulation fails, do not send.

### 4.6 Class F — NFT scripts (`src/nft/*`) — when they exist

`src/nft/*` is not yet on disk. When implementation lands, validate:

| Check | Assertion |
|---|---|
| Irys upload of an image | `tx.sendAndConfirm(umi)` returns a string URI; `fetch(uri)` returns HTTP 200 and `content-type: image/*`; bytes match the SHA-256 of the local file. |
| Metadata JSON upload | Same; body decodes as JSON; `image` field equals the image URI; `name`, `symbol`, `attributes`, `properties.files[0].uri` are well-formed. |
| Core asset mint | `createCoreAsset` (or `createV1` per SDK) produces an account at a PDA derivable from `(collection?, owner, assetIndex)`; `fetchAsset` returns the metadata the script intended to attach; the `Attributes` plugin reflects the JSON's attributes. |
| Core collection mint (if used) | Same shape, plus the asset's `collection` field matches the collection address. |

---

## 5. Recommended validator layout (future implementation)

This is the shape the implementation step should land, **not** what this plan builds.

```
tests/
  static/
    tsc-noemit.test.ts          # compiles whole project, no errors
    import-surface.test.ts      # reflects installed packages, asserts expected exports
    wallet-safety-lint.test.ts  # greps src/ for wallet leaks
  onchain/
    class-a-derivations.test.ts # PDAs equal expected
    class-b-idempotency.test.ts # re-run semantics
    class-c-discriminators.test.ts # instruction shapes
    class-d-state-mutations.test.ts # pre/post account diffs
    class-e-failure-modes.test.ts  # simulation-based negative tests
    class-f-nft.test.ts         # only when src/nft/* lands
```

All on-chain tests should:
1. Run against `https://api.devnet.solana.com` (and its `wss://` equivalent for subscriptions).
2. Use the project's existing `devnet-wallet.json` *only* to derive the public key; do not echo or store secret bytes.
3. Use `simulateTransaction` before any `sendTransaction`.
4. Run in series (not parallel) to avoid blockhash conflicts.
5. Skip (not fail) if `SOLANA_PRIVATE_SKIP_ONCHAIN=1` is set, so CI without devnet credentials still passes static checks.

---

## 6. Open questions for the implementation step (do **not** answer in this plan)

1. **Mint authority.** Should the script keep mint authority after `InitializeMint2`, or hand it to a PDA? Today the source never sets a separate freeze authority and never revokes. The choice affects whether re-running `spl_mint` works.
2. **Idempotent ATA instruction.** `spl_mint.ts` currently uses `getCreateAssociatedTokenInstructionAsync` (which fails on a re-run). Confirm whether the intent is fail-fast (use the non-idempotent variant) or safe-re-run (switch to `getCreateAssociatedTokenIdempotentInstructionAsync`).
3. **`assertIsTransactionMessageWithBlockhashLifetime` vs `…WithBlockhashLifetime`.** `spl_init.ts` imports the message form. `@solana/kit@6.8` exports both. Which one the file should use depends on whether the script asserts before signing (message) or after (transaction). Without seeing the filled-in body, both are valid; record this as a pending decision rather than a fix.
4. **`DataV2Args` vs `DataV2`.** v3.x of `mpl-token-metadata` ships both names in some sub-versions. Confirm against the installed package before the metadata script is implemented.
5. **`tsc@^6.0.3` pin.** The package.json pin is ahead of any released TypeScript line as of mid-2025. If `npm install` produced an older TS, the validator should not assume new syntax.
6. **`devnet-wallet.json` provenance.** Where did this keypair come from? If it was airdropped for development, fine; if it's a repurposed key, rotate. This plan does not rotate — only flags.
7. **Hard-coded recipient in `spl_transfer.ts`** (`9EUd4VNcjMAysd7zQk3Q1a4tb28BYndLNBAQDiYnHJ64`). Confirm it is a keypair you control on devnet.

---

## 7. Exact commands the implementation step will run

Static (read-only, no installs, no network):

```bash
# 1. Type-check
npx tsc --noEmit -p tsconfig.json

# 2. Reflection of installed packages (no install)
node -e "console.log(Object.keys(require('@solana/kit')).sort())"
node -e "console.log(Object.keys(require('@solana-program/token')).sort())"
node -e "console.log(Object.keys(require('@solana-program/system')).sort())"
node -e "console.log(Object.keys(require('@metaplex-foundation/mpl-token-metadata')).sort())"

# 3. Wallet-safety lint
grep -RInE "console\.(log|info|error|warn|debug)\([^)]*(wallet|keypair|secretKey|signer\b)" src/

# 4. Confirm gitignore effectiveness
git ls-files --error-unmatch devnet-wallet.json || echo "wallet correctly untracked"

# 5. Wallet shape (no printing of the bytes themselves)
node -e "const a=require('./devnet-wallet.json'); console.assert(Array.isArray(a)&&a.length===64)"
```

On-chain (read-only RPC, then devnet with simulation first):

```bash
# 6. RPC reachable
curl -s -X POST https://api.devnet.solana.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# 7. Wallet balance check
solana balance devnet-wallet.json --url devnet

# 8. Per-class validators (each a future script under tests/onchain/)
npx ts-node tests/onchain/class-a-derivations.test.ts
npx ts-node tests/onchain/class-b-idempotency.test.ts
npx ts-node tests/onchain/class-c-discriminators.test.ts
npx ts-node tests/onchain/class-d-state-mutations.test.ts
npx ts-node tests/onchain/class-e-failure-modes.test.ts
```

---

## 8. Failure-case catalogue (consolidated)

| Code | Trigger | Symptom | Detection |
|---|---|---|---|
| `E_WALLET_MISSING` | `devnet-wallet.json` not found / wrong shape | Module load throws | §2 P1 |
| `E_WALLET_NOSOL` | Wallet < 0.05 SOL on devnet | Transactions fail with insufficient funds | §2 P3 |
| `E_RPC_DOWN` | Endpoint unreachable | `getLatestBlockhash` / `getHealth` throws | §2 P5 |
| `E_DUP_MINT` | `spl_init` re-run | `AccountAlreadyInitialized` | §4.5 |
| `E_DUP_ATA` | `spl_mint` re-run with non-idempotent ATA ix | `spl-associated-token-account` returns error | §4.2 |
| `E_DUP_METADATA` | `spl_metadata` re-run | Token Metadata rejects overwrite | §4.5 |
| `E_WRONG_AUTHORITY` | Signer lacks mint/freeze authority | Simulation fails signature check | §4.5 |
| `E_BAD_PDA` | PDA seed mismatch | `AccountNotFound` or wrong owner | §4.1 |
| `E_STALE_BLOCKHASH` | Blockhash expired before confirmation | `BlockhashNotFound` | §4.2 |
| `E_TX_SIM_FAIL` | Simulation rejects before send | Logged; no SOL spent | §4.5 |

---

## 9. Out of scope for this plan

- Writing the validator scripts.
- Filling in the commented-out bodies of `src/spl/*.ts`.
- Adding `src/nft/*.ts`.
- Modifying `package.json`, `tsconfig.json`, `.gitignore`.
- Any install / publish / git push.

---

## 10. References

- Solana Associated Token Account spec — `https://spl.solana.com/associated-token-account` (covers `Create` / `CreateIdempotent` / `RecoverNested`).
- SPL Token program — `https://spl.solana.com/token` (instruction list and discriminators; mint state size 165 bytes).
- `@solana/kit` (formerly `@solana/web3.js` v2) — `https://github.com/anza-xyz/kit`.
- `@solana-program/token` — `https://github.com/solana-program/token` (codecs for Kit).
- `@solana-program/system` — `https://github.com/solana-program/system`.
- Metaplex Token Metadata — `https://www.metaplex.com/docs/smart-contracts/token-metadata`.
- Metaplex Core — `https://www.metaplex.com/docs/smart-contracts/core`.
- Metaplex UMI — `https://github.com/metaplex-foundation/umi`.

---

## Response to Implementation Plan

**Date:** 2026-08-26
**Reviewed:** `docs/implementation-plan.md` (IP) against this `validation-plan.md` (VP) and the actually-installed packages in `node_modules/`. All claims verified by read-only runtime reflection (`Object.keys(require(...))`) and inspection of the installed `.d.ts` files. **No source edited, no installs, no transactions.**

### A. Installed ground truth (empirically verified)

| Item | Verified |
|---|---|
| `@solana/kit` | 6.8.0 — 835 exports; both `assertIsTransactionWithBlockhashLifetime` and `assertIsTransactionMessageWithBlockhashLifetime` exist. |
| `@solana-program/token` | 0.13.0 — `getMintSize()` returns **82** (not 165). `getInitializeMintInstruction` (disc **0**, accounts `[mint, SysvarRent]`) and `getInitializeMint2Instruction` (disc **20**, accounts `[mint]`, rent-free) both exist. ATA helpers present in both non-idempotent and idempotent forms. |
| `@solana-program/system` | 0.12.0 — `getCreateAccountInstruction` present. |
| `@metaplex-foundation/mpl-token-metadata` | 3.4.0 — `createMetadataAccountV3` present at runtime; `DataV2`, `DataV2Args`, `CreateMetadataAccountV3InstructionAccounts`, `CreateMetadataAccountV3InstructionArgs` are **type-only** (`dist/src/generated/types/*.d.ts`), invisible to runtime `Object.keys`. Valid type imports still work in source. |
| `@metaplex-foundation/mpl-core` | 1.10.0 — `createV1` and `create` (wraps `createV2`) exist; **`createCoreAsset` does NOT exist** in this version. |
| `@metaplex-foundation/umi-uploader-irys` | 1.5.0 — present; default cluster routing `devnet → https://devnet.irys.xyz`. |
| TypeScript installed | 6.0.3 (matches `package.json` pin). |
| `esbuild` | **Not installed**; not in lockfile. |
| `devnet-wallet.json` | Untracked by git (`git ls-files` errors); not read by this review. |

### B. Should the first milestone be limited to `spl_init` + safe-transaction gating + compile checks + wallet/address protection?

**Yes — with the additions below.** The implementation plan tries to do everything in one sweep (7 scripts in one milestone). That conflates "compile-time correctness" with "devnet behavior" and puts wallet secrets, paste-point addresses, and paid Irys uploads behind a single `npm run`. A safer first milestone:

**Milestone 1 (recommended gate before any other step touches the network):**

1. **Compile-only.** `npx tsc --noEmit -p tsconfig.json` passes. This already fails today (`spl_metadata.ts` line 33 stray text + unfinished assignments); that failure is the whole reason `spl_metadata.ts` cannot ship first.
2. **Static-only runtime smoke for `spl_init`.** Run the script with `SEND=0` (default). It must: load the wallet (without logging it), generate a fresh mint keypair, derive rent, build the message, sign, and **stop before `sendAndConfirm`**. Log only the mint pubkey, the planned fee, the tx size, and the signature plan. *No RPC write calls.*
3. **Wallet/address protection.** Assert before step 1 that (a) wallet file is a 64-byte Uint8Array, (b) `signer.address` is on the ed25519 curve, (c) `git ls-files devnet-wallet.json` exits non-zero, (d) no `console.log` references `wallet`, `keypair`, `secretKey`, or `signer` (the lint in VP §3.4).
4. **Compile + lint pass.** No scripts other than `spl_init` touched yet. **`spl_metadata.ts`, `spl_mint.ts`, `spl_transfer.ts`, and `src/nft/*` are out of scope for Milestone 1.** Don't edit them until Milestone 1 is green.
5. **Devnet-readiness probe** (read-only RPC): `getHealth`, `getBalance(signer.address)` ≥ 0.05 SOL, `getMinimumBalanceForRentExemption(BigInt(82))` succeeds.

**Milestone 1 acceptance criteria (all must hold before unlocking Milestone 2):**

- A1. `npx tsc --noEmit` exits 0.
- A2. With `SEND=0` (default), `npx ts-node src/spl/spl_init.ts` exits 0 after logging `[plan] mint=<base58> rent=<lamports> txBytes=<n> sigPlan=<base58>`. No RPC write method is called. No wallet bytes are in stdout/stderr.
- A3. With `SEND=1`, the same script must call `simulateTransaction` first; if simulation fails, exit non-zero *without* sending. The send path must be the literal last RPC call.
- A4. `git ls-files --error-unmatch devnet-wallet.json` exits non-zero; wallet bytes never appear in any log line of any script (grep `tests/` + `src/` after a dry run).
- A5. `spl_init`'s plan log shows: mint is a fresh ed25519 pubkey; rent ≥ `getMinimumBalanceForRentExemption(82)`; account set for the message is exactly `[feePayer(signer), mint(signer), systemProgram, tokenProgram]` for `CreateAccount` and `[mint(w)]` for `InitializeMint`, in that order — verified by decoding the unsigned message after `signTransactionMessageWithSigners` and before any RPC call.
- A6. README's `image.jpeg` prerequisite for `nft:*` scripts is documented as a blocker; `assets/` is empty; `src/nft/` does not exist. **Do not create `src/nft/*` until Milestone 2 explicitly authorizes it** (paid Irys uploads are a separate risk).

**Why limit to `spl_init`:** it is the only script whose failure mode is purely "wallet exists, rent is wrong, instruction shape is wrong" — no external dependencies, no paste-point, no paid upload, no recipient keypair. Validating the **transaction pipeline** (Kit message building, fee payer, blockhash, sign, simulate, send) once against a single known-good instruction unlocks all later scripts *without* re-validating the pipeline each time.

### C. Corrections to VP — accepted from implementation plan

1. **C1 (ACCEPT) — Mint size is 82, not 165.** VP §4.1 row "Mint account size = 165" and §4.4 "data length = 165" are wrong. 165 is the SPL **token-account** size (ATA); 82 is the SPL **mint** size. Both rows must read `getMintSize() === 82`. **VP §10 reference line** "Mint state size 165 bytes" must also be corrected.
2. **C2 (ACCEPT) — Use `getInitializeMintInstruction` (disc 0, with rent), not `InitializeMint2` (disc 20).** VP §4.3 row labeled `spl-token.InitializeMint2` with disc 20 / no rent account contradicts what the skeletons actually call (the skeletons import `getInitializeMintInstruction` and pair it with `getCreateAccountInstruction` + `getMinimumBalanceForRentExemption`). Re-label that row to `InitializeMint`, disc **0**, accounts `[mint(w), SysvarRent(r)]`. `InitializeMint2` exists in the package but is not in use here; if implementation later switches to it, both VP and the implementation must move together.
3. **C3 (ACCEPT) — ATA Create has 6 accounts, not 7.** VP §4.3 row lists `spl_associated_token_program`; verified the ATA program is not an account of its own instruction. Correct account set is `[payer(signer, writable), ata(writable), owner, mint, systemProgram, tokenProgram]` for both disc 0 (Create) and disc 1 (CreateIdempotent).
4. **C4 (ACCEPT) — Core asset is a fresh signer, not a PDA.** VP §4.1 "Core asset PDA" row and §4.6 "Core asset mint — `createCoreAsset` (or `createV1` per SDK)" are wrong on two counts: (a) the asset is a keypair from `generateSigner(umi)`, not a PDA; (b) `createCoreAsset` does not exist in `mpl-core@1.10.0`. The correct validation is `createV1(umi, { asset, name, uri })`, then assert (post-confirm) `fetchAsset(asset.publicKey)` returns the intended name/uri, and that `asset.publicKey` signed the tx.
5. **C5 (ACCEPT) — Irys upload is not a TransactionBuilder.** VP §4.6 "Irys upload — `tx.sendAndConfirm(umi)`" is wrong. `umi.uploader.upload([file])` and `umi.uploader.uploadJson(json)` return URI strings; no transaction is involved. Only the Core mint step (`createV1`) uses `sendAndConfirm`.
6. **C6 (ACCEPT) — Type-only exports need a TS probe, not runtime reflection.** VP §3.3 / P7 `Object.keys(require('@metaplex-foundation/mpl-token-metadata'))` will not surface `DataV2Args`, `CreateMetadataAccountV3InstructionAccounts`, etc. These are erased TS types living under `node_modules/@metaplex-foundation/mpl-token-metadata/dist/src/generated/types/*.d.ts`. The import-surface check for that package must be `tsc --noEmit` over a probe file that references each type, or a `grep` of the `.d.ts`. The reflection approach remains valid for the runtime exporters (`@solana/kit`, `@solana-program/*`).
7. **C7 (ACCEPT) — esbuild is not available; drop it.** VP §3.2 uses `npx esbuild`. esbuild is not installed and installs are out of scope. The single static gate is `npx tsc --noEmit -p tsconfig.json` (see D5).
8. **C8 (ACCEPT) — `spl_metadata.ts` description.** VP §0 says "the calls to `createMetadataAccountV3` are inside `//` line comments." Verified: lines 38–44 are live code; only lines 33–36 hold the stray text and unfinished assignments. The compile-failure conclusion stands; the line numbers matter when Milestone 2 fixes it.
9. **C9 (ACCEPT) — Both Kit assertions exist; post-sign flow uses the transaction form.** VP §0 / §6.3 were ambiguous. Verified both names exist in Kit 6.8.0. Implementation will use `assertIsTransactionWithBlockhashLifetime` after `signTransactionMessageWithSigners`, drop the unused message-form import.
10. **C10 (ACCEPT) — Idempotent ATA in both `spl_mint` and `spl_transfer`.** Verified `getCreateAssociatedTokenIdempotentInstructionAsync` exists in `@solana-program/token@0.13.0`. Use the idempotent variant in **both** scripts (own ATA in `spl_mint`; recipient ATA in `spl_transfer`). Re-running either script must not fail.

### D. Suggestions in implementation plan — accepted, adjusted, or rejected

1. **D1 (ACCEPT) — `SEND=1` env gate.** Implementation plan §8.2 proposes a `SEND` flag; this is the right pattern. Adopt verbatim: default `SEND=0`; build+sign only; `SEND=1` enables `simulateTransaction` then `sendAndConfirm`. `SEND=0` runs must perform **zero** RPC write calls (read-only `getLatestBlockhash` and `getMinimumBalanceForRentExemption` are fine — they don't mutate state).
2. **D2 (ACCEPT with adjustment) — InitializeMint vs InitializeMint2 (plan's R3 / VP §6).** Stay with `getInitializeMintInstruction` (disc 0) + rent-based `CreateAccount`. Switching to `InitializeMint2` saves one instruction-data byte but requires changing the plan, VP, and Class C rows together; not worth it for a class project.
3. **D3 (ACCEPT with adjustment) — Class B `spl_init` re-run semantics.** Implementation plan correctly notes a fresh mint keypair is generated per run, so plain re-runs create independent mints. The "fail-fast on re-run" assertion in VP §4.2 only applies if the *same keypair* is reused. Adjust the test to pin the keypair and assert the second send fails with `AccountAlreadyInitialized`.
4. **D4 (ACCEPT with adjustment) — Class D `spl_mint` expected amount.** VP §4.4 hardcodes "amount = 1_000_000" assuming 1 token. Implementation plan Q2 proposes 1000 tokens (1000 × 10^decimals base units). Parameterize the validator on the amount constant actually used, do not hardcode.
5. **D5 (ACCEPT) — `tsc --noEmit` as the single static gate.** esbuild unavailable; `tsc --noEmit -p tsconfig.json` is sufficient for Milestone 1.
6. **D6 (REJECT as a first-milestone goal) — Implementing all 7 scripts in one pass.** Implementation plan's Steps 1–7 spread across `spl_init`, `spl_metadata`, `spl_mint`, `spl_transfer`, plus three new `src/nft/*` files. The first milestone must not include (a) any Irys upload (paid action, external endpoint, no rollback) or (b) any script that depends on a paste-point from a prior step. See Milestone 1 scope in §B.
7. **D7 (REJECT as written) — Decimals = 6.** Default for class project, but VP must parameterize rather than assume. The validator should read decimals from `getAccountInfo(mint)` after `spl_init` and use that everywhere downstream.
8. **D8 (REJECT — open question, not a fact) — "devnet-wallet.json is git-untracked ⇒ safe."** Correct for git, but the file is on disk and readable by any process running in the repo. The validator must additionally ensure no script ever logs the bytes; this is a stronger property than git status.
9. **D9 (ACCEPT with caveat) — Kit commonjs + ts-node friction.** Implementation plan acknowledges and IP §1 lists `node_modules` as already installed. Verified Kit ships a Node CJS entry (`index.node.cjs`); ts-node CJS `require` resolves. Downgrade VP §0.5 from "known friction" to "watch-item" — if `ERR_REQUIRE_ESM` ever appears, fix via ts-node config (`TS_NODE_COMPILER_OPTIONS={"module":"commonjs"}`), not package changes.
10. **D10 (REJECT) — VP §6 "TypeScript pin ^6.0.3 ahead of released TS."** Verified installed TypeScript is exactly 6.0.3, matching the pin. Remove this open question.

### E. Rejections (corrections VP must take, or stays incorrect)

1. **R1 — VP §4.1, §4.4, §10 — "mint account size = 165".** Wrong. Correct value: **82** (from `getMintSize()`). A validator asserting 165 will fail every correct mint.
2. **R2 — VP §4.3 row labeled `InitializeMint2` with disc 20 / no rent account.** Wrong for this project. The skeletons use `InitializeMint` (disc 0, accounts `[mint, SysvarRent]`). Re-label.
3. **R3 — VP §4.3 ATA Create account set includes `spl_associated_token_program`.** Wrong. The ATA program is not an account of its own instruction. Account set is exactly 6 entries.
4. **R4 — VP §4.1 "Core asset PDA" / §4.6 "`createCoreAsset`".** Both wrong for `mpl-core@1.10.0`. Asset is a fresh signer; the helper is `createV1`.
5. **R5 — VP §4.6 "Irys upload — `tx.sendAndConfirm(umi)`".** Wrong. `umi.uploader.upload` returns a URI string; no tx.
6. **R6 — VP §3.3 / P7 runtime reflection for `DataV2Args` etc.** Wrong; those are type-only. Use a TS probe or grep of `.d.ts`.
7. **R7 — VP §3.2 esbuild shape checks.** esbuild not installed. Drop; rely on `tsc --noEmit`.
8. **R8 — VP §0 stray-comment framing of `spl_metadata.ts`.** Description wrong; line numbers matter for the fix.
9. **R9 — VP §0.5 "commonjs + ts-node + Kit is a known friction point".** Verified it works via Kit's CJS entry. Downgrade to watch-item.
10. **R10 — VP §6 "tsc@^6.0.3 ahead of released TS".** Installed TS is exactly 6.0.3. Remove.

### F. Final acceptance criteria for the recommended first milestone

The first milestone ships only when **all** of the following are measurable and pass:

| ID | Criterion | How to verify |
|---|---|---|
| F1 | `npx tsc --noEmit -p tsconfig.json` exits 0 | exit code only |
| F2 | `npx ts-node src/spl/spl_init.ts` with `SEND` unset or `SEND=0` exits 0 without calling any RPC write method | capture RPC traffic via a stubbed `createSolanaRpc` in a test, or assert via the `SEND` gate in source |
| F3 | With `SEND=0`, stdout contains: `mint=<base58>` (fresh ed25519), `rent=<lamports>` ≥ `getMinimumBalanceForRentExemption(82)`, `txBytes=<n>`, `sigPlan=<base58>`. No line contains `[`, `]`, `0,` (wallet array), or any 64-byte sequence | grep over captured stdout |
| F4 | With `SEND=1`, the script calls `simulateTransaction` first; if simulation returns `err`, the script exits non-zero **before** any `sendTransaction` | instrument the RPC; or assert by reading source for `simulateTransaction` appearing before `sendTransaction` |
| F5 | `git ls-files --error-unmatch devnet-wallet.json` exits non-zero | shell exit code |
| F6 | `grep -RInE "console\.(log\|info\|error\|warn\|debug)\([^)]*(wallet\|keypair\|secretKey\|\bsigner\b)" src/spl/spl_init.ts` returns zero matches | shell exit code |
| F7 | Decoded unsigned message has account order `[feePayer(s,w), mint(s,w), systemProgram, tokenProgram]` for `CreateAccount` and `[mint(w)]` for `InitializeMint` | decode via Kit message codecs in a test |
| F8 | `devnet-wallet.json` has length 64, every element integer in `[0,255]` | one-line node assertion; no print of the array |
| F9 | `src/nft/` does not exist; `assets/` is empty (NFT scripts gated until Milestone 2) | `ls`/`stat` |
| F10 | README's `image.jpeg` prerequisite is acknowledged in Milestone 2 plan, not silently satisfied | doc review |

When F1–F10 pass, Milestone 2 can begin — `spl_metadata.ts` fix, `spl_mint.ts` (with idempotent ATA), `spl_transfer.ts` (with idempotent recipient ATA), under the same `SEND` gate.

### G. Decisions still needed before Milestone 2

Carried over from the implementation plan's open questions and re-flagged here so they aren't lost:

- **G1 (Q3):** Token metadata `DataV2` values (name / symbol / uri). Empty `uri` is acceptable for a class fungible token.
- **G2 (Q4):** NFT metadata values (name / description / attributes) and the image file location (README says `image.jpeg` at project root; `assets/` is empty).
- **G3 (Q5):** Confirm `SEND=1` env gate for Milestones 2+ (the validation plan recommends YES).
- **G4 (Q7):** If `devnet.irys.xyz` is dead at Milestone 2 implementation time, authorize `irysUploader({ address: "https://uploader.irys.xyz" })` (mainnet Irys — real SOL cost), or pause for alternatives.
- **G5 (Q8):** Confirm `9EUd4VNcjMAysd7zQk3Q1a4tb28BYndLNBAQDiYnHJ64` is a devnet wallet the user controls; otherwise the transfer ships tokens to an unspendable address.

### H. Out of scope for this response

- Editing `src/spl/*.ts` or creating `src/nft/*.ts`.
- Running any script (even with `SEND=0`), installing packages, or modifying `package.json` / `tsconfig.json` / `.gitignore`.
- Submitting transactions, even simulated ones.

