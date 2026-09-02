import {
  createSignerFromKeypair,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";

//import your wallet (never log its contents)
import wallet from "../../devnet-wallet.json";

const RPC = "https://api.devnet.solana.com";
const FALLBACK_IRYS = "https://uploader.irys.xyz";

//paste the IMAGE URI got from nft:image (here: hosted on catbox because Irys devnet is offline)
const IMAGE_URI = "https://files.catbox.moe/5xokag.png";

function umiWithUploader(address: string | undefined) {
  const umi = createUmi(RPC).use(irysUploader(address ? { address } : {}));
  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(new Uint8Array(wallet))),
  );
  umi.use(keypairIdentity(signer));
  return umi;
}

(async () => {
  try {
    // SEND=1 uploads the metadata JSON to Irys (a paid storage action).
    // Any other value (or unset) = safe dry run: print the JSON, probe the
    // price — never upload.
    const SEND = process.env.SEND === "1";

    if (!IMAGE_URI) {
      console.error(
        "IMAGE_URI is empty — run `SEND=1 npm run nft:image` and paste the image URI into src/nft/nft_metadata.ts first.",
      );
      process.exitCode = 1;
      return;
    }

    const metadata = {
      name: "SPL Bootcamp Q326 NFT",
      description: "A class-project NFT minted with MPL Core on Solana devnet.",
      image: IMAGE_URI,
      attributes: [
        { trait_type: "Class", value: "solana-bootcamp q3-2026" },
        { trait_type: "Program", value: "MPL Core" },
        { trait_type: "Network", value: "devnet" },
      ],
    };

    console.log(
      SEND
        ? "mode: SEND=1 — will upload metadata JSON to Irys"
        : "mode: DRY RUN — metadata printed, NOT uploaded",
    );
    console.log(JSON.stringify(metadata, null, 2));

    const envEndpoint = process.env.IRYS_ENDPOINT || undefined;
    let umi = umiWithUploader(envEndpoint);
    let workingEndpoint =
      envEndpoint ?? "package default (https://devnet.irys.xyz)";

    try {
      await umi.uploader.getUploadPrice([JSON.stringify(metadata)] as never);
    } catch {
      umi = umiWithUploader(FALLBACK_IRYS);
      workingEndpoint = FALLBACK_IRYS;
    }
    console.log(`working irys endpoint: ${workingEndpoint}`);

    if (!SEND) {
      console.log("Dry run complete — no upload was performed.");
      return;
    }

    const uri = await umi.uploader.uploadJson(metadata);
    console.log(`metadata uri: ${uri}`);
    console.log("Paste this URI into src/nft/nft_mint.ts as URI.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();