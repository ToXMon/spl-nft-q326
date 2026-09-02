import {
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  assertIsTransactionMessageWithBlockhashLifetime,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  getInitializeMintInstruction,
  getMintSize,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getCreateAccountInstruction } from "@solana-program/system";

//import your wallet
import wallet from "../../devnet-wallet.json";

const rpc = createSolanaRpc("https://api.devnet.solana.com");

const rpcSubscriptions = createSolanaRpcSubscriptions(
  "wss://api.devnet.solana.com",
);

(async () => {
  try {
    // SEND=1 broadcasts the transaction on devnet.
    // Any other value (or unset) = safe dry run: build + sign locally and
    // print only public planning data. Nothing is ever sent in dry-run mode.
    const SEND = process.env.SEND === "1";

    // Fresh keypair for the new mint account.
    const mint = await generateKeyPairSigner();

    // Your devnet wallet pays the fees and stays the mint authority.
    const feePayer = await createKeyPairSignerFromBytes(new Uint8Array(wallet));

    // Mint account size (82 bytes) and the rent needed to keep it alive.
    const space = BigInt(getMintSize());
    const rent = await rpc.getMinimumBalanceForRentExemption(space).send();

    // 1. Allocate the account and assign it to the Token program.
    const createAccountIx = getCreateAccountInstruction({
      payer: feePayer,
      newAccount: mint,
      lamports: rent,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    });

    // 2. Initialize the mint: 6 decimals, wallet as mint authority,
    //    no freeze authority (null drops it).
    const initializeMintIx = getInitializeMintInstruction({
      mint: mint.address,
      decimals: 6,
      mintAuthority: feePayer.address,
      freezeAuthority: null,
    });

    // Build the transaction message.
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const msg = createTransactionMessage({ version: 0 });

    const msgWithPayer = setTransactionMessageFeePayerSigner(feePayer, msg);

    const msgWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      msgWithPayer,
    );

    const txMessage = appendTransactionMessageInstructions(
      [createAccountIx, initializeMintIx],
      msgWithLifetime,
    );

    // Sign locally — signing is an offline operation and sends nothing.
    const signedTx = await signTransactionMessageWithSigners(txMessage);

    assertIsTransactionWithBlockhashLifetime(signedTx);

    const signature = getSignatureFromTransaction(signedTx);
    const wireTx = getBase64EncodedWireTransaction(signedTx);
    const txByteLength = Buffer.from(wireTx, "base64").length;

    // Safe, public planning data only (never any key material).
    console.log(
      SEND
        ? "mode: SEND=1 — will simulate + broadcast on devnet"
        : "mode: DRY RUN — transaction built + signed, NOT broadcast",
    );
    console.log(`mint address: ${mint.address}`);
    console.log(`fee payer / mint authority: ${feePayer.address}`);
    console.log("freeze authority: none");
    console.log("decimals: 6");
    console.log(`mint account space: ${space} bytes`);
    console.log(`rent: ${rent} lamports`);
    console.log(`transaction size: ${txByteLength} bytes`);
    console.log(`signature plan: ${signature}`);

    if (!SEND) {
      console.log("Dry run complete — no transaction was sent.");
      return;
    }

    // SEND=1 only: simulate first (read-only RPC, costs no SOL).
    const simulation = await rpc
      .simulateTransaction(wireTx, {
        commitment: "confirmed",
        encoding: "base64",
        replaceRecentBlockhash: true,
        sigVerify: false,
      })
      .send();

    if (simulation.value.err) {
      console.error("Simulation FAILED — aborting, nothing was sent:");
      console.error(simulation.value.err);
      return;
    }
    console.log("Simulation OK — broadcasting...");

    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc,
      rpcSubscriptions,
    });

    await sendAndConfirm(signedTx, { commitment: "confirmed" });

    console.log(`mint txid: ${signature}`);
  } catch (error) {
    console.log(error);
  }
})();
