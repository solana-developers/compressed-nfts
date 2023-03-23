/**
 * Demonstrate how to transfer a compressed NFT from one account to another
 */

import {
  AccountMeta,
  PublicKey,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ConcurrentMerkleTreeAccount,
  MerkleTree,
  MerkleTreeProof,
} from "@solana/spl-account-compression";

// import custom helpers for demos
import {
  loadPublicKeysFromFile,
  loadKeypairFromFile,
  loadOrGenerateKeypair,
  printConsoleSeparator,
  extractSignatureFromFailedTransaction,
  explorerURL,
} from "@/utils/helpers";

// local import of the connection wrapper, to help with using the ReadApi
import { WrapperConnection } from "@/ReadApi/WrapperConnection";

import dotenv from "dotenv";
dotenv.config();

(async () => {
  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load the env variables and store the cluster RPC url
  const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

  // create a new rpc connection, using the ReadApi wrapper
  const connection = new WrapperConnection(CLUSTER_URL);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load or generate a new Keypair for testing, named `testWallet`
  const testWallet = loadOrGenerateKeypair("testWallet");

  // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
  const payer = process.env?.LOCAL_PAYER_JSON_ABSPATH
    ? loadKeypairFromFile(process.env?.LOCAL_PAYER_JSON_ABSPATH)
    : loadOrGenerateKeypair("payer");

  console.log("Payer address:", payer.publicKey.toBase58());
  console.log("Test wallet address:", testWallet.publicKey.toBase58());

  // load the stored PublicKeys for ease of use
  let keys = loadPublicKeysFromFile();

  // ensure the primary script was already run
  if (!keys?.assetIdTestAddress)
    return console.warn("No locally saved `assetId` was found, Please run a `fetchNFT` script");

  const assetIdTestAddress: PublicKey = keys.assetIdTestAddress;
  const assetIdUserAddress: PublicKey = keys.assetIdUserAddress;

  console.log("==== Local PublicKeys loaded ====");
  console.log("Test Asset ID:", assetIdTestAddress.toBase58());
  console.log("User Asset ID:", assetIdUserAddress.toBase58());

  // set the asset to test with
  // const assetId = assetIdTestAddress;
  const assetId = assetIdUserAddress;

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Get the asset details from the RPC
   */
  printConsoleSeparator("Get the asset details from the RPC");

  const asset = await connection.getAsset(assetId);

  console.log(asset);

  console.log("Is this a compressed NFT?", asset.compression.compressed);
  console.log("Current owner:", asset.ownership.owner);
  console.log("Current delegate:", asset.ownership.delegate);

  // ensure the current asset is actually a compressed NFT
  if (!asset.compression.compressed)
    return console.error(`The asset ${asset.id} is NOT a compressed NFT!`);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Get the asset's proof from the RPC
   */

  printConsoleSeparator("Get the asset proof from the RPC");

  const assetProof = await connection.getAssetProof(assetId);

  console.log(assetProof);

  /**
   * Get the tree's current on-chain account data
   */

  // parse the tree's address from the `asset`
  const treeAddress = new PublicKey(asset.compression.tree);
  console.log("Tree address:", treeAddress.toBase58());

  // get the tree's account info from the cluster
  const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, treeAddress);

  /**
   * Perform client side verification of the proof that was provided by the RPC
   * ---
   * NOTE: This is not required to be performed, but may aid in catching errors
   * due to your RPC providing stale or incorrect data (often due to caching issues)
   * The actual proof validation is performed on-chain.
   */

  printConsoleSeparator("Validate the RPC provided asset proof on the client side:");

  const merkleTreeProof: MerkleTreeProof = {
    leafIndex: asset.compression.leaf_id,
    leaf: new PublicKey(assetProof.leaf).toBuffer(),
    root: new PublicKey(assetProof.root).toBuffer(),
    proof: assetProof.proof.map((node: string) => new PublicKey(node).toBuffer()),
  };

  const currentRoot = treeAccount.getCurrentRoot();
  const rpcRoot = new PublicKey(assetProof.root).toBuffer();

  console.log(
    "Is RPC provided proof/root valid:",
    MerkleTree.verify(rpcRoot, merkleTreeProof, false),
  );

  console.log(
    "Does the current on-chain root match RPC provided root:",
    new PublicKey(currentRoot).toBase58() === new PublicKey(rpcRoot).toBase58(),
  );

  /**
   * INFO:
   * The current on-chain root value does NOT have to match this RPC provided
   * root in order to perform the transfer. This is due to the on-chain
   * "changelog" (set via the tree's `maxBufferSize` at creation) keeping track
   * of valid roots and proofs. Thus allowing for the "concurrent" nature of
   * these special "concurrent merkle trees".
   */

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Build the transfer instruction to transfer ownership of the compressed NFT
   * ---
   * By "transferring" ownership of a compressed NFT, the `leafOwner`
   * value is updated to the new owner.
   * ---
   * NOTE: This will also remove the `leafDelegate`. If a new delegate is
   * desired, then another instruction needs to be built (using the
   * `createDelegateInstruction`) and added into the transaction.
   */

  // set the new owner of the compressed NFT
  const newLeafOwner = testWallet.publicKey;

  // set the current leafOwner (aka the current owner of the NFT)
  const leafOwner = new PublicKey(asset.ownership.owner);

  // set the current leafDelegate
  const leafDelegate = !!asset.ownership?.delegate
    ? new PublicKey(asset.ownership.delegate)
    : leafOwner;

  /**
   * NOTE: When there is NOT a current `leafDelegate`,
   * the current leafOwner` address should be used
   */

  const treeAuthority = treeAccount.getAuthority();
  const canopyDepth = treeAccount.getCanopyDepth();

  // parse the list of proof addresses into a valid AccountMeta[]
  const proofPath: AccountMeta[] = assetProof.proof
    .map((node: string) => ({
      pubkey: new PublicKey(node),
      isSigner: false,
      isWritable: false,
    }))
    .slice(0, assetProof.proof.length - (!!canopyDepth ? canopyDepth : 0));

  //
  // console.log(proofPath);

  // create the NFT transfer instruction (via the Bubblegum package)
  const transferIx = createTransferInstruction(
    {
      merkleTree: treeAddress,
      treeAuthority,
      leafOwner,
      leafDelegate,
      newLeafOwner,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      anchorRemainingAccounts: proofPath,
    },
    {
      root: [...new PublicKey(assetProof.root.trim()).toBytes()],
      dataHash: [...new PublicKey(asset.compression.data_hash.trim()).toBytes()],
      creatorHash: [...new PublicKey(asset.compression.creator_hash.trim()).toBytes()],
      nonce: asset.compression.leaf_id,
      index: asset.compression.leaf_id,
    },
    BUBBLEGUM_PROGRAM_ID,
  );

  // return;

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Sending the transfer transaction...");

  try {
    // create and send the transaction to transfer ownership of the NFT
    const tx = new Transaction().add(transferIx);
    tx.feePayer = payer.publicKey;

    // send the transaction
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      // ensuring the feePayer signs the transaction
      [payer],
      {
        commitment: "confirmed",
        skipPreflight: true,
      },
    );

    console.log("\nTransfer successful!\n", explorerURL({ txSignature }));

    /**
     * Re-fetch the asset from the RPC to see the new ownership
     */
    const newAsset = await connection.getAsset(assetId);
    // console.log(newAsset);

    printConsoleSeparator();

    /**
     * NOTE: Since part of the asset's data changed (i.e. the owner),
     * the proof will have also changed
     */
    // const newAssetProof = await connection.getAssetProof(assetId);
    // console.log(newAssetProof);

    // display the new and old ownership values
    console.log("   Old owner:", asset.ownership.owner);
    console.log("   Old delegate:", asset.ownership.delegate);
    console.log("   New owner:", newAsset.ownership.owner);
    console.log("   New delegate:", newAsset.ownership.delegate);

    // the end :)
  } catch (err: any) {
    console.error("\nFailed to create transfer nft:", err);

    console.log("\n=======================");
    console.log("  Transfer failed!");
    console.log("=======================");

    // log a block explorer link for the failed transaction
    await extractSignatureFromFailedTransaction(connection, err);

    throw err;
  }
})();
