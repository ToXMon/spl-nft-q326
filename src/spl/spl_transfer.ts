import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import wallet from "../../devnet-wallet.json";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

const rpc = createSolanaRpc("https://api.devnet.solana.com");

const rpcSubscriptions = createSolanaRpcSubscriptions(
  "wss://api.devnet.solana.com",
);

//paste your mint address got from spl_init.ts
const mint = address("8gYR2syTVk1a7mcScpSqo6oVcZRit95KZMQ6VezXL4VM");

//recipient = second devnet wallet (hw-wallet-2.json), printed at generation time
const to = address("HLnpgWg3zUovnQtVyJbTKUctfavCqt4ZfZTSjc7zM6G5");

//100 whole tokens with 6 decimals = 100 * 1_000_000 base units
const transfer_amount = 100n * 1_000_000n;

(async () => {
  try {
    // SEND=1 broadcasts the transaction on devnet.
    // Any other value (or unset) = safe dry run: build + sign locally and
    // print only public planning data. Nothing is ever sent in dry-run mode.
    const SEND = process.env.SEND === "1";

    const signer = await createKeyPairSignerFromBytes(new Uint8Array(wallet));

    const [fromAta] = await findAssociatedTokenPda({
      mint,
      owner: signer.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.log(`Your fromAta is : ${fromAta}`);

    const [toAta] = await findAssociatedTokenPda({
      mint,
      owner: to,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.log(`Your toAta is : ${toAta}`);

    // Idempotent ATA creation for the RECIPIENT: does nothing if the ATA
    // already exists, so re-running this script does not fail.
    const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: signer,
      owner: to,
      mint,
    });

    // TransferChecked: decimals must match the mint (6).
    const transferIx = getTransferCheckedInstruction({
      source: fromAta,
      mint,
      destination: toAta,
      authority: signer,
      amount: transfer_amount,
      decimals: 6,
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const msg = createTransactionMessage({ version: 0 });

    const msgWithPayer = setTransactionMessageFeePayerSigner(signer, msg);

    const msgWithLiftime = setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      msgWithPayer,
    );

    const txMessage = appendTransactionMessageInstructions(
      [createAtaIx, transferIx],
      msgWithLiftime,
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
    console.log(`mint: ${mint}`);
    console.log(`from ata: ${fromAta}`);
    console.log(`to ata: ${toAta}`);
    console.log(`recipient: ${to}`);
    console.log(`amount: ${transfer_amount} base units (100 tokens, 6 decimals)`);
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

    console.log(`transfer txid: ${signature}`);
  } catch (error) {
    console.log(error);
  }
})();
