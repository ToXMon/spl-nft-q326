import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createV1, mplCore } from "@metaplex-foundation/mpl-core";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

//import your wallet (never log its contents)
import wallet from "../../devnet-wallet.json";

const RPC = "https://api.devnet.solana.com";

//paste the METADATA URI got from nft:metadata
const URI = "https://files.catbox.moe/m7446e.json";
const NAME = "SPL Bootcamp Q326 NFT";

(async () => {
  try {
    // SEND=1 mints the NFT asset on devnet.
    // Any other value (or unset) = safe dry run: derive the fresh asset
    // keypair and print the plan — nothing is sent.
    const SEND = process.env.SEND === "1";

    if (!URI) {
      console.error(
        "URI is empty — run `SEND=1 npm run nft:metadata` and paste the metadata URI into src/nft/nft_mint.ts first.",
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

    // Fresh keypair IS the asset address (mpl-core createV1 style).
    // updateAuthority + owner default to the identity signer (= wallet).
    const asset = generateSigner(umi);

    console.log(
      SEND
        ? "mode: SEND=1 — will mint NFT asset on devnet"
        : "mode: DRY RUN — transaction NOT sent",
    );
    console.log(`wallet (owner + update authority): ${signer.publicKey}`);
    console.log(`asset address (plan): ${asset.publicKey}`);
    console.log(`name: ${NAME}`);
    console.log(`uri: ${URI}`);

    if (!SEND) {
      console.log("Dry run complete — no transaction was sent.");
      console.log("Re-run with SEND=1 to mint (asset address changes per run).");
      return;
    }

    const builder = createV1(umi, { asset, name: NAME, uri: URI });
    const result = await builder.sendAndConfirm(umi);
    const signature = bs58.encode(Buffer.from(result.signature));

    console.log(`mint txid: ${signature}`);
    console.log(`asset address: ${asset.publicKey}`);
    console.log("Paste this address into src/nft/nft_update.ts and tests/verify.ts.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();