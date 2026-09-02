# Implementation Plan — spl-nft-q326 (SPL Token + NFT class project)

Date: 2026-08-26
Status: PLANNING ONLY — no source edits, no installs, no transactions performed.
Repo root: /Users/tolushekoni/sb2026/spl-nft-q326 (git branch: main, single commit b48e81f "init")

---

## 1. Repository inventory (verified)

| Path | State |
|---|---|
| `package.json` | 7 npm scripts: `spl:init`, `spl:metadata`, `spl:mint`, `spl:transfer`, `nft:image`, `nft:metadata`, `nft:mint` (all `npx ts-node …`) |
| `tsconfig.json` | target ES2022, module commonjs, strict, resolveJsonModule (needed for the wallet JSON import) |
| `src/spl/spl_init.ts` | Skeleton: imports present, try-block EMPTY |
| `src/spl/spl_metadata.ts` | Partial skeleton with SYNTAX ERROR (line 33: stray text `change the metadata`), unfinished `data`/`args` |
| `src/spl/spl_mint.ts` | Skeleton: ATA derivation implemented, instruction + send/confirm code commented out |
| `src/spl/spl_transfer.ts` | Skeleton: ATA derivation implemented, instruction + send code commented out |
| `src/nft/` | DIRECTORY DOES NOT EXIST — nft_image.ts, nft_metadata.ts, nft_mint.ts referenced by package.json/README are missing |
| `assets/` | Empty |
| `devnet-wallet.json` | Present (contents intentionally NOT read; .gitignore'd) |
| `node_modules/` | All dependencies already installed (no installs needed) |

Installed dependency versions (verified from node_modules):
- @solana/kit 6.8.0
- @solana-program/token 0.13.0, @solana-program/system 0.12.0
- @metaplex-foundation/umi 1.5.1, umi-bundle-defaults 1.5.1, umi-uploader-irys 1.5.0
- @metaplex-foundation/mpl-token-metadata 3.4.0, mpl-core 1.10.0
- bs58 6.0.0

## 2. Concepts (from official docs, for the edits below)

- Mint account: global token record (supply, decimals, mint authority, freeze authority). Created by (a) allocating an account of `getMintSize()` bytes owned by the Token Program, then (b) `InitializeMint`. [solana.com/docs/tokens]
- Token account: per-owner balance for one mint. ATA = PDA derived from (owner, mint, tokenProgram) via the Associated Token Program — the default account to receive/mint tokens into. Must exist before `MintTo`/`TransferChecked` touches it. [solana.com/docs/tokens#associated-token-account]
- Token Metadata (legacy but supported for this class): Metadata PDA attached to a mint via `createMetadataAccountV3` (DataV2: name, symbol, uri, sellerFeeBasisPoints, creators, collection, uses). [metaplex.com/docs/smart-contracts/token-metadata]
- Metaplex Core NFT: single Asset account; `createV1(umi, { asset, name, uri })` with `asset = generateSigner(umi)`; off-chain JSON `{ name, description, image, attributes }`. [metaplex.com/docs/smart-contracts/core/create-asset]
- Solana Kit transaction pipeline (used by all 4 SPL scripts): createTransactionMessage → setTransactionMessageFeePayerSigner → setTransactionMessageLifetimeUsingBlockhash → appendTransactionMessageInstructions → signTransactionMessageWithSigners → assertIsTransactionWithBlockhashLifetime → getSignatureFromTransaction → sendAndConfirmTransactionFactory({rpc, rpcSubscriptions}) (commitment "confirmed"). [solanakit.com / anza-xyz/kit]

## 3. Verified API surface (from installed type declarations)

@solana-program/token 0.13.0:
- `getInitializeMintInstruction({ mint, decimals, mintAuthority, freezeAuthority? })` — freezeAuthority is OptionOrNullable; pass null to drop it.
- `getMintSize(): number`
- `findAssociatedTokenPda({ mint, owner, tokenProgram })` → `[pda, bump]`
- `getCreateAssociatedTokenInstructionAsync({ payer, owner, mint, ata?, tokenProgram? })` — NOT idempotent: fails if ATA exists.
- `getCreateAssociatedTokenIdempotentInstructionAsync(…same input…)` — idempotent variant (recommended for re-runs / recipient ATA).
- `getMintToInstruction({ mint, token, mintAuthority, amount })` — amount: bigint.
- `getTransferCheckedInstruction({ source, mint, destination, authority, amount, decimals })` — amount: bigint, decimals: number.
- Exports: `TOKEN_PROGRAM_ADDRESS`, `ASSOCIATED_TOKEN_PROGRAM_ADDRESS`.
- Helper modules also exist: `createMint`, `mintToATA`, `transferToATA` (higher-level, optional; not required).

@solana-program/system 0.12.0:
- `getCreateAccountInstruction({ payer, newAccount, lamports, space, programAddress })` — newAccount must be a TransactionSigner (the fresh mint keypair).

@s0lana/kit 6.8.0: all pipeline helpers imported by the skeletons exist; `rpc.getLatestBlockhash()`, `rpc.getMinimumBalanceForRentExemption(space: bigint)` available.

mpl-token-metadata 3.4.0:
- `createMetadataAccountV3(umi, { mint, mintAuthority, payer?, updateAuthority?, data: DataV2Args, isMutable, collectionDetails })` returns TransactionBuilder (`.sendAndConfirm(umi)`).
- DataV2Args = { name, symbol, uri, sellerFeeBasisPoints, creators (nullable), collection (nullable), uses (nullable) }.

mpl-core 1.10.0:
- `createV1(umi, { asset: Signer, name, uri, collection?, owner?, plugins? })` → TransactionBuilder.
- Also a newer `create()` helper wrapping createV2, plus `mplCore()` plugin and `fetchAsset` helpers — `createV1` matches the README/class level.

umi 1.5.1:
- `generateSigner(umi)`, `createSignerFromKeypair`, `signerIdentity`, `publicKey`.
- `createGenericFile(content: string|Uint8Array, fileName, { contentType, tags })`, `createGenericFileFromJson(json)`.
- `umi.uploader.upload([files]) → string[]`, `umi.uploader.uploadJson(json) → string`.

umi-uploader-irys 1.5.0:
- `irysUploader(options?)` plugin; default address chosen by cluster: devnet → https://devnet.irys.xyz, else https://uploader.irys.xyz. Gateway: https://gateway.irys.xyz/{id}.

## 4. Current skeletons → exact work per file

### Step 1 — src/spl/spl_init.ts (implement empty try-block)
Reusable: all imports already present (generateKeyPairSigner, getCreateAccountInstruction, getInitializeMintInstruction, getMintSize, TOKEN_PROGRAM_ADDRESS, full kit pipeline).
Edits (inside try):
1. `const mint = generateKeyPairSigner();`
2. `const feePayer = await createKeyPairSignerFromBytes(new Uint8Array(wallet));`
3. `const space = BigInt(getMintSize());` — note: getMintSize() returns number; convert for rent call which takes bigint.
4. `const rent = (await rpc.getMinimumBalanceForRentExemption(space)).value;` (check exact rpc return shape at implementation time).
5. `const createAccountIx = getCreateAccountInstruction({ payer: feePayer, newAccount: mint, lamports: rent, space, programAddress: TOKEN_PROGRAM_ADDRESS });`
6. `const initMintIx = getInitializeMintInstruction({ mint: mint.address, decimals: 6, mintAuthority: feePayer.address, freezeAuthority: null });` (decimals 6 to match the 1_000_000n unit used in spl_mint.ts)
7. Build message (version 0) + fee payer + blockhash, `appendTransactionMessageInstructions([createAccountIx, initMintIx], …)`, sign, assert, send+confirm (same pattern as spl_mint.ts).
8. `console.log` the mint address (needed by steps 2–4).
Class decision point: decimals and whether to keep freeze authority (plan: decimals=6, freezeAuthority=null).

### Step 2 — src/spl/spl_metadata.ts (fix syntax error + finish)
Reusable: umi setup, signer, accounts object, send/confirm pattern already correct.
Edits:
1. Delete stray line 33 (`change the metadata`) — it is invalid TypeScript and blocks compilation of the whole project.
2. Fill `const data: DataV2Args = { name: "...", symbol: "...", uri: "...", sellerFeeBasisPoints: 0, creators: null, collection: null, uses: null };` (uri may be empty string for a fungible class token, or a JSON URI if desired).
3. Fill `const args: CreateMetadataAccountV3InstructionArgs = { data, isMutable: true, collectionDetails: null };`.
4. Keep `mint` const as the paste-point from spl_init output (currently holds stale example address `E2Jazz2VXcVL9RZkn6ZFA4q1YGvgEvrns3Gr6w72DC4w` — user must paste their own).
5. Optional: add `updateAuthority: signer` in accounts (defaults to identity if omitted).
Risk: Token Metadata program charges small protocol fees; payer needs SOL.

### Step 3 — src/spl/spl_mint.ts (uncomment + fill 2 instructions)
Reusable: ATA derivation (lines 39–44), message pipeline scaffolding.
Edits:
1. `const createAtaIx = await getCreateAssociatedTokenInstructionAsync({ payer: signer, owner: signer.address, mint });`
   - Prefer `getCreateAssociatedTokenIdempotentInstructionAsync` so re-runs don't fail with "already exists" (educational note: plain create fails on existing ATA).
2. `const mintToIx = getMintToInstruction({ mint, token: ata, mintAuthority: signer, amount: 1000n * token_decimals });` (token_decimals=1_000_000n already defined; amount is bigint in base units).
3. Uncomment lines 60–78 (append instructions, sign, assert, signature, sendAndConfirm, log txid).
4. Keep paste-point `mint` (stale example address currently).

### Step 4 — src/spl/spl_transfer.ts (uncomment + fill 2 instructions)
Reusable: from/to ATA derivation (lines 43–55), sendAndConfirm factory already built.
Edits:
1. `const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner: to, mint });` — create RECIPIENT's ATA (idempotent: recipient may already have one).
2. `const transferIx = getTransferCheckedInstruction({ source: fromAta, mint, destination: toAta, authority: signer, amount: <amount>n, decimals: 6 });` — decimals must match mint (6); amount in base units.
3. Uncomment lines 72–85, rename misleading `transferTx` comment to instruction list `[createAtaIx, transferIx]`, fix final log label ("mint txid" → "transfer txid").
4. Keep paste-points `mint` and `to` (stale example addresses currently).

### Step 5 — src/nft/nft_image.ts (CREATE new file)
Pattern: umi + irysUploader (same umi/signer setup as spl_metadata.ts).
Content:
1. `createUmi(devnet rpc)` + keypair signer + `umi.use(signerIdentity(signer))` + `umi.use(irysUploader())`.
2. Read image from disk with node `fs/promises` (README says `image.jpeg` at project root; NOTE: file currently missing — prerequisite).
3. `const file = createGenericFile(bytes, "image.jpeg", { contentType: "image/jpeg" });`
4. `const [imageUri] = await umi.uploader.upload([file]);` then `console.log(imageUri)` (paste into step 6).
5. Optional: price check via `umi.uploader.getUploadPrice([file])` and log before uploading (supports the "no accidental transactions/spend" rule — see §7).

### Step 6 — src/nft/nft_metadata.ts (CREATE new file)
Content:
1. Same umi + irysUploader setup.
2. Paste-point `const imageUri = "<from nft_image.ts>";`.
3. Build JSON `{ name, description, image: imageUri, attributes: [...] }` per Core JSON schema (name/description/image/attributes).
4. `const uri = await umi.uploader.uploadJson(metadata); console.log(uri)` (paste into step 7).

### Step 7 — src/nft/nft_mint.ts (CREATE new file)
Content:
1. Same umi setup + `umi.use(mplCore())` (plugin optional — programs resolve by default, but explicit is clearer for class).
2. Paste-point `const uri = "<from nft_metadata.ts>";`.
3. `const asset = generateSigner(umi);`
4. `const builder = createV1(umi, { asset, name: "...", uri });`
5. `const result = await builder.sendAndConfirm(umi); console.log(asset.publicKey, signature)` (bs58-encoded as in spl_metadata.ts).
Cost ~0.003 SOL (asset rent) + tx fee; asset keypair must be fresh.

## 5. Intended execution sequence (data flows downward)

1. `npm run spl:init` → logs MINT address
2. `npm run spl:metadata` ← paste MINT → logs signature
3. `npm run spl:mint` ← paste MINT → logs ATA + txid
4. `npm run spl:transfer` ← paste MINT + recipient → logs txid
5. `npm run nft:image` (needs image.jpeg present) → logs IMAGE URI
6. `npm run nft:metadata` ← paste IMAGE URI → logs METADATA URI
7. `npm run nft:mint` ← paste METADATA URI → logs ASSET address + signature

## 6. Prerequisites

1. `devnet-wallet.json` at root (present; 64-byte keypair JSON array). Funded with devnet SOL (airdrop) — needed for: mint rent (~0.002 SOL), metadata account + protocol fee, ATA rents, NFT asset rent (~0.003 SOL), and Irys upload payment.
2. `image.jpeg` at project root for nft:image — MISSING today; .gitignore also mentions images-cat.jpeg (assumption: user will add one).
3. Devnet RPC reachability: https://api.devnet.solana.com and wss://api.devnet.solana.com (public endpoints, rate-limited).
4. No new packages required — everything is already in dependencies.

## 7. Dependency / API risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Irys devnet endpoint: `umi-uploader-irys` defaults to https://devnet.irys.xyz for devnet; probe from this machine failed (TLS alert protocol version; could be local LibreSSL or endpoint deprecation). Irys docs describe migration to Irys L1 (uploader.irys.xyz responds 200). | nft:image/nft:metadata uploads may fail | Test upload early (step 5 first); if devnet.irys.xyz is dead: pass `irysUploader({ address: "https://uploader.irys.xyz" })` — note mainnet Irys payment implications — or switch uploader. Decide at implementation time, not now. |
| R2 | `getCreateAssociatedTokenInstructionAsync` is NOT idempotent | Re-running spl:mint fails "ATA already exists" | Use idempotent variant (verified available in 0.13.0) |
| R3 | Token Metadata is legacy; createMetadataAccountV3 incurs Metaplex protocol fees | Small extra SOL cost; API stable in mpl-token-metadata 3.4.0 | Keep devnet wallet funded; errors surface clearly |
| R4 | Stale hardcoded addresses (mint `E2Jazz…`, recipient `9EUd…`) from a previous class run | Running without pasting new values produces confusing runtime errors (mint not found / wrong mint authority) | Plan keeps paste-points as designed; validation (§8) includes a read-only check of pasted mint before sending |
| R5 | decimals mismatch between spl_init (choose 6) and transferChecked `decimals` arg | TransferChecked fails with decimals mismatch | Fix decimals=6 in both; single source comment |
| R6 | ts-node + strict TS: current repo does not compile (spl_metadata.ts syntax error) | All scripts fail until fixed | Step 2 fix unblocks `tsc --noEmit` validation |
| R7 | Public devnet RPC rate limits / airdrop throttling | sendAndConfirm hangs or errors | Retry guidance; optional custom RPC later |
| R8 | mpl-core `create` helper (wraps createV2) vs `createV1` — docs show `create`; installed 1.10.0 has both | API confusion | Use `createV1` (matches README's "mpl-core" class level; verified signature) |
| R9 | Irys upload is a PAID action (funds node storage) even on devnet | Accidental spend | §7/§8 validation: price check + explicit confirmation before upload |

## 8. Validation plan (transaction-safe until explicitly intended)

Read-only / compile-time (run any time, no chain effects):
1. `npx tsc --noEmit` — must pass after each step (currently FAILS due to spl_metadata.ts line 33).
2. `npx ts-node src/spl/spl_init.ts` DRY helper (optional, proposed): before sending, log derived values only; gate send behind an env flag (e.g. `SEND=1`). Proposed addition: wrap `sendAndConfirm` in `if (process.env.SEND === "1")` so default runs build+sign+log the signature plan WITHOUT broadcasting. (Requires explicit user approval since it alters skeleton behavior — see Questions Q5.)
3. Wallet balance check (read-only RPC): `getBalance(feePayer.address)` — verify funds before any send.
4. Post-init paste-point check (read-only): `rpc.getAccountInfo(mint)` / `getMint`-style fetch to confirm the pasted mint exists before metadata/mint/transfer.
5. Irys price probe: `umi.uploader.getUploadPrice([file])` (no upload) before nft:image.

With explicit user approval only (real transactions, devnet):
6. Run scripts 1→7 in order, pasting logged values between steps; verify each txid in Solana Explorer (devnet).
7. After step 3: check ATA balance via `rpc.getTokenAccountsByOwner` (read-only).
8. After step 7: verify asset on core.metaplex.com / explorer by asset address.

## 9. Files touched summary (planned)

- EDIT: src/spl/spl_init.ts (fill try-block, ~25 lines)
- EDIT: src/spl/spl_metadata.ts (remove stray line 33, fill data/args, ~10 lines)
- EDIT: src/spl/spl_mint.ts (2 instructions + uncomment pipeline, ~12 lines)
- EDIT: src/spl/spl_transfer.ts (2 instructions + uncomment pipeline, ~12 lines)
- CREATE: src/nft/nft_image.ts (~45 lines)
- CREATE: src/nft/nft_metadata.ts (~40 lines)
- CREATE: src/nft/nft_mint.ts (~40 lines)
- No package.json changes, no new dependencies, no config changes.
- README update optional (document SEND flag if adopted) — out of scope until Q5 answered.

## 10. Questions / assumptions

1. Q1 (assumed): Mint decimals = 6 and freeze authority = null in spl_init (consistent with `token_decimals = 1_000_000n` already in spl_mint.ts). Confirm?
2. Q2 (assumed): Mint amount = 1000 tokens (1000n * 1_000_000n base units), transfer amount = 100 tokens. Confirm amounts?
3. Q3 (need answer): Token metadata DataV2 values — name/symbol/uri for the class token (uri can be ""). What should they be?
4. Q4 (need answer): NFT metadata values — name, description, attributes for the Core asset. Also confirm image file name/location (README says root `image.jpeg`; assets/ exists but is empty).
5. Q5 (design decision): Add a `SEND=1` env gate so scripts can be executed safely (build+sign, no broadcast) by default? This slightly changes skeleton behavior but prevents accidental transactions. Recommend yes.
6. Q6 (assumed): Keep the stale hardcoded paste-point addresses as-is until the user replaces them (per "preserve existing behavior"); do not rewrite them to placeholders.
7. Q7 (risk-dependent): If devnet.irys.xyz is confirmed dead at implementation time, approve fallback to `irysUploader({ address: "https://uploader.irys.xyz" })` (mainnet Irys — real cost) or pause and discuss alternatives?
8. Q8 (assumed): Recipient for transfer stays the hardcoded `9EUd4VN…` paste-point; user will replace before running.
9. Q9 (need answer): Should validation step 2 (dry-run gating) also print the would-be transaction size/CU estimate, or keep it minimal?

---

## Response to Validation Plan

Reviewed `docs/validation-plan.md` (VP) on 2026-08-26 against this implementation plan and the installed packages. All claims below were verified via read-only runtime reflection and the installed `.d.ts` files — no source edits, no installs, no transactions.

### A. Ground truth (verified against installed packages)

| Item | Verified value |
|---|---|
| `getMintSize()` (@solana-program/token 0.13.0) | **82 bytes** |
| `getInitializeMintInstruction` | discriminator **0**, accounts `[mint, SysvarRent]`, dataLen 35 |
| `getInitializeMint2Instruction` | discriminator **20**, accounts `[mint]` (rent-free) — exists in 0.13.0 but is NOT what this plan uses |
| ATA Create / CreateIdempotent | disc **0 / 1**; both have exactly **6** accounts `[payer(ws), ata(w), owner, mint, systemProgram, tokenProgram]` |
| MintTo / TransferChecked | disc **7 / 12** |
| TOKEN_PROGRAM / ATA_PROGRAM | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` / `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| `createMetadataAccountV3` (mpl-token-metadata 3.4.0) | discriminator **33**; accounts `[metadata, mint, mintAuthority, payer, updateAuthority, systemProgram]` |
| Program IDs | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` (Token Metadata), `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` (Core) |
| mpl-core 1.10.0 `createV1` | `asset: Signer` — a fresh **keypair**, NOT a PDA; `create` helper (wraps createV2) exists; `createCoreAsset` does **not** exist |
| @solana/kit 6.8.0 | exports **both** `assertIsTransactionWithBlockhashLifetime` and `assertIsTransactionMessageWithBlockhashLifetime` |
| `DataV2Args` | **type-only** export (`dist/src/generated/types/dataV2.d.ts`); runtime `undefined` — invisible to `Object.keys` reflection |
| TypeScript installed | 6.0.3 (matches the package.json pin) |
| `devnet-wallet.json` | untracked by git (`git ls-files` errors); must stay unread/unlogged |
| esbuild | **not present** in node_modules |

### B. Accepted corrections

1. **ACCEPT — Kit assertion choice (VP §0.2, §6.3).** Both assertions exist; our flow asserts **post-signing**, so `spl_init.ts` must use `assertIsTransactionWithBlockhashLifetime` after `signTransactionMessageWithSigners`. The skeleton imports both names today; implementation Step 1 will use the transaction form and drop the unused message-form import. (Implementation plan Step 1 already specifies the transaction form — this confirms it.)
2. **ACCEPT — idempotent ATA (VP §4.2, §6.2).** Verified `getCreateAssociatedTokenIdempotentInstructionAsync` (disc 1) exists. Implementation will use the idempotent variant in BOTH `spl_mint.ts` (own ATA, re-run safe) and `spl_transfer.ts` (recipient ATA). Overrides the skeleton's plain `getCreateAssociatedTokenInstructionAsync` reference. Matches this plan's risk R2.
3. **ACCEPT — verified discriminator rows.** VP §4.3 rows for MintTo=7, TransferChecked=12, ATA Create=0 / CreateIdempotent=1, CreateMetadataAccountV3=33, System CreateAccount=0 are correct against the installed serializers — keep as-is for validation.
4. **ACCEPT — Metadata PDA seeds.** `["metadata", MPL_TOKEN_METADATA_PROGRAM_ID, mint]` is correct; additionally mpl-token-metadata 3.4.0 exports `findMetadataPda` — validators should use it instead of hand-rolling the derivation.
5. **ACCEPT — wallet-safety posture (VP §0 box, §3.4, P1/P4).** Validators consume only `signer.address`; never log wallet/bytes/secretKey; P1 shape check must not print the array. Confirmed wallet is git-untracked. Adopted verbatim.
6. **ACCEPT — simulate before send (VP §4.5).** Kit's RPC API confirms option names `replaceRecentBlockhash: true` + `sigVerify` exactly as VP writes them. Fold into the SEND-gated path (this plan §8.2) so every real send is preceded by a free simulation.
7. **ACCEPT — pre-flight existence checks (VP §4.1).** Read-only `getAccountInfo` on pasted mint / metadata PDA before signing — already covered by §8.4 of this plan; keep.

### C. Rejected suggestions (would break the scripts or make validation fail wrongly)

1. **REJECT — "mint account size = 165" (VP §4.1, §4.4 Class D, §10).** Installed `getMintSize()` returns **82**; 165 is the **token account** size, not the mint size. If `spl_init` allocated 165 bytes, InitializeMint would reject the account, and Class D's `data length = 165` assertion would fail a correct mint. Fix both VP rows to 82 / `getMintSize()`.
2. **REJECT — "spl-token.InitializeMint2, disc 20, v0.13 ships InitializeMint2" as the row for our scripts (VP §4.3).** Verified: `getInitializeMintInstruction` — the API this plan uses — emits discriminator **0** with `[mint, SysvarRent]`. `getInitializeMint2Instruction` (disc 20, rent-free) exists in the package but we do not call it. A validator asserting disc 20 / no rent account would fail a correct implementation. See decision D3.
3. **REJECT — ATA Create "7 accounts incl. spl_associated_token_program" (VP §4.3).** Verified account set for disc 0/1 is exactly **6 accounts**: payer, ata, owner, mint, systemProgram, tokenProgram. The ATA program is not an account of its own instructions.
4. **REJECT — "Core asset PDA from seeds ['asset', collection?, owner, asset_index]" (VP §4.1, §4.6).** In mpl-core 1.10.0 the asset is `asset: Signer` — a fresh keypair via `generateSigner(umi)`, NOT a PDA. There is no derivation to check; correct validation is (a) asset address is an on-curve signer of the tx, (b) account exists after confirm, (c) `fetchAsset` returns the intended name/uri. Remove the PDA check; keep the fetchAsset check. This plan's Step 7 (createV1 + generateSigner) stands.
5. **REJECT — runtime reflection for type-only exports (VP §3.3, P7).** `Object.keys(require('@metaplex-foundation/mpl-token-metadata'))` will never list `DataV2Args`, `CreateMetadataAccountV3InstructionAccounts`, etc. — they are erased TS types (runtime undefined; declared in `.d.ts`). The import-surface test must be `tsc --noEmit` over a probe file (or a grep of the `.d.ts`), not runtime reflection. `DataV2Args` itself is confirmed valid — `spl_metadata.ts`'s import stands unchanged.
6. **REJECT — "createCoreAsset (or createV1 per SDK)" (VP §4.6).** `createCoreAsset` does not exist in mpl-core 1.10.0 (verified undefined). Use `createV1` (Step 7). Also: an Irys upload is not a umi TransactionBuilder — `umi.uploader.upload()` / `uploadJson()` return URI strings directly; `tx.sendAndConfirm(umi)` applies only to the Core mint step.
7. **REJECT — esbuild shape checks (VP §3.2).** esbuild is not installed and installs are disallowed; the static gate is `tsc --noEmit` (this plan §8.1) plus the optional SEND-gated dry run.
8. **REJECT (as an open risk) — TS pin concern (VP §6.5).** Installed TypeScript is exactly 6.0.3, matching the pin; keep only a one-line version echo in validation, not an open question.
9. **REJECT — VP §0 claim that spl_metadata.ts has the createMetadataAccountV3 calls "inside // line comments".** Verified: lines 38–44 are live code; only lines 33–36 hold the stray text and unfinished assignments. The compile-failure conclusion is right, the description is wrong — matters for editing exactly the right lines in Step 2.

### D. Partial accepts / adjustments

1. **commonjs + ts-node ESM friction (VP §0.5):** @solana/kit ships a Node CJS entry (`index.node.cjs`), so ts-node/commonjs `require` resolves; downgrade from "known friction" to "watch-item" (if ERR_REQUIRE_ESM ever appears, fix via ts-node config, not package changes).
2. **Class B spl_init re-run semantics (VP §4.2):** correct only when the SAME mint keypair is reused. Our script generates a fresh keypair per run, so a plain re-run creates a second mint (by design); the fail-fast assertion applies only to a deliberate same-keypair repeat. Adjust the test to pin the keypair.
3. **Class D spl_mint expected amount (VP §4.4):** "amount = 1_000_000" assumes minting exactly 1 token. Parameterize the assertion on the same amount constant used in Step 3 (proposed: 1000 tokens — see Q2), do not hardcode.

### E. Decisions needed

- **D1** (VP §6.1 / this plan Q1): keep mintAuthority = wallet, freezeAuthority = null? Plan default: YES (spl_mint requires the wallet to remain mint authority; the class flow breaks otherwise).
- **D2** (VP §6.2 / risk R2): confirm switching to the idempotent ATA variant in both spl_mint and spl_transfer. Plan default: YES.
- **D3** (new — VP §4.3 vs plan): stay with rent-based `InitializeMint` (disc 0; matches the skeleton's getMintSize + createAccount + rent imports), or switch to `InitializeMint2` (disc 20, one fewer account)? Plan default: **keep InitializeMint**; if switching, both plans and Class C rows change together.
- **D4** (VP §6.7 / Q8): confirm recipient `9EUd4VN…` is a devnet wallet you control — otherwise the transfer succeeds on-chain but funds an address nobody can use.
- **D5** (VP §3.1–3.2): confirm `tsc --noEmit` as the single static gate (esbuild unavailable). Plan default: YES.
- **D6** (carried over, still open): Q3 (token name/symbol/uri), Q4 (NFT name/description/attributes + image file), Q5 (SEND=1 gate), Q9 (dry-run verbosity) — all need user input before implementation.
