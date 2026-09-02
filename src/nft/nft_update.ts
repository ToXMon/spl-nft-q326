import {
  createSignerFromKeypair,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchAsset, updateV1, mplCore } from "@metaplex-foundation/mpl-core";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

//import your wallet (never log its contents)
import wallet from "../../devnet-wallet.json";

const RPC = "https://api.devnet.solana.com";

//paste the ASSET address got from nft:mint
const ASSET = "9vCufeUJNh6i1wP6bSKPUjCEwCXBBiHbwkra2d2dK6gu";

//new values applied by the update-authority signature
const NEW_NAME = "SPL Bootcamp Q326 NFT (Updated)";
const NEW_URI = ""; // optional: paste a new metadata URI after re-running nft:metadata, or keep "" to leave unchanged

(async () => {
  try {
    // SEND=1 broadcasts the update on devnet.
    // Any other value (or unset) = safe dry run: print the plan only.
    const SEND = process.env.SEND === "1";

    if (!ASSET) {
      console.error(
        "ASSET is empty — run `SEND=1 npm run nft:mint` and paste the asset address into src/nft/nft_update.ts first.",
      );
      process.exitCode = 1;
      return;
    }

    const umi = createUmi(RPC).use(mplCore());
    const signer = createSignerFromKeypair(
      umi,
      fromWeb3JsKeypair(Keypair.fromSecretKey(new Uint8Array(wallet))),
    );
    umi.use(keypairIdentity(signer));

    const assetPub = publicKey(ASSET);

    console.log(
      SEND
        ? "mode: SEND=1 — will update the NFT asset on devnet"
        : "mode: DRY RUN — update transaction NOT sent",
    );
    console.log(`asset: ${ASSET}`);
    console.log(`update authority (wallet): ${signer.publicKey}`);
    console.log(`new name: ${NEW_NAME}`);
    console.log(`new uri: ${NEW_URI || "(unchanged)"}`);

    if (!SEND) {
      console.log("Dry run complete — no transaction was sent.");
      return;
    }

    const builder = updateV1(umi, {
      asset: assetPub,
      newName: NEW_NAME,
      newUri: NEW_URI || undefined,
    });
    const result = await builder.sendAndConfirm(umi);
    const signature = bs58.encode(Buffer.from(result.signature));
    console.log(`update txid: ${signature}`);

    // read-only verification that the chain reflects the new name
    const asset = await fetchAsset(umi, assetPub);
    console.log(`on-chain name now: ${asset.name}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();