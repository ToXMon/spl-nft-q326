import {
  createGenericFile,
  createSignerFromKeypair,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import path from "node:path";

//import your wallet (never log its contents)
import wallet from "../../devnet-wallet.json";

const RPC = "https://api.devnet.solana.com";

// Irys devnet default is https://devnet.irys.xyz — its TLS has been failing.
// IRYS_ENDPOINT env var forces a specific endpoint; otherwise we try the
// package default first and fall back to https://uploader.irys.xyz.
const DEFAULT_IRYS = undefined; // package default = https://devnet.irys.xyz
const FALLBACK_IRYS = "https://uploader.irys.xyz";

function umiWithUploader(address: string | undefined) {
  const umi = createUmi(RPC).use(
    irysUploader(address ? { address } : {}),
  );
  const signer = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(Keypair.fromSecretKey(new Uint8Array(wallet))),
  );
  umi.use(keypairIdentity(signer));
  return umi;
}

(async () => {
  try {
    // SEND=1 uploads the image to Irys (a paid storage action).
    // Any other value (or unset) = safe dry run: read the file, probe the
    // price, verify which endpoint works — but never upload.
    const SEND = process.env.SEND === "1";

    const envEndpoint = process.env.IRYS_ENDPOINT || undefined;
    const bytes = readFileSync(path.join(__dirname, "..", "..", "image.png"));
    const file = createGenericFile(bytes, "image.png", {
      contentType: "image/png",
    });

    console.log(
      SEND
        ? "mode: SEND=1 — will upload image.png to Irys"
        : "mode: DRY RUN — price probe only, image is NOT uploaded",
    );
    console.log(`image size: ${bytes.length} bytes`);

    // Endpoint resolution order: explicit IRYS_ENDPOINT > package default > fallback.
    let umi = umiWithUploader(envEndpoint);
    let workingEndpoint = envEndpoint ?? "package default (https://devnet.irys.xyz)";
    let price = await umi.uploader
      .getUploadPrice([file])
      .catch(async (err: unknown) => {
        console.warn(
          `irys endpoint failed: ${(err as Error).message} — trying fallback ${FALLBACK_IRYS}`,
        );
        umi = umiWithUploader(FALLBACK_IRYS);
        workingEndpoint = FALLBACK_IRYS;
        return umi.uploader.getUploadPrice([file]);
      });

    console.log(`working irys endpoint: ${workingEndpoint}`);
    console.log(`upload price: ${Number(price.basisPoints) / 1e9} SOL`);

    if (!SEND) {
      console.log("Dry run complete — no upload was performed.");
      return;
    }

    const [imageUri] = await umi.uploader.upload([file]);
    console.log(`image uri: ${imageUri}`);
    console.log("Paste this URI into src/nft/nft_metadata.ts as IMAGE_URI.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();