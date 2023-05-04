/**
 * Demonstrate how to perform a simple client side proof verification, using
 * data provided from the `@metaplex-foundation/js` SDK
 */

// import custom helpers for demos
import { loadPublicKeysFromFile, printConsoleSeparator } from "@/utils/helpers";

import dotenv from "dotenv";
import { GetAssetProofRpcResponse, Metaplex, ReadApiConnection } from "@metaplex-foundation/js";

// imports from other libraries
import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  ConcurrentMerkleTreeAccount,
  MerkleTree,
  MerkleTreeProof,
} from "@solana/spl-account-compression";

// load the env variables and store the cluster RPC url
dotenv.config();
const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

// create a new rpc connection
// const connection = new Connection(CLUSTER_URL);
const connection = new ReadApiConnection(CLUSTER_URL);

(async () => {
  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load the stored PublicKeys for ease of use
  let keys = loadPublicKeysFromFile();

  // ensure the primary script was already run
  if (!keys?.assetIdTestAddress)
    return console.warn(
      "No locally saved `assetIdTestAddress` was found, Please run a `fetchNFT` script",
    );

  const assetIdTestAddress: PublicKey = keys.assetIdTestAddress;
  const assetIdUserAddress: PublicKey = keys.assetIdUserAddress;

  console.log("==== Local PublicKeys loaded ====");
  console.log("Test Asset ID:", assetIdTestAddress.toBase58());
  console.log("User Asset ID:", assetIdUserAddress.toBase58());

  // set the asset to test with
  const assetId = assetIdTestAddress;
  // const assetId = assetIdUserAddress;

  const metaplex = Metaplex.make(connection);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Get the compressed nft by its assetId:");

  /**
   * Fetch an asset from the ReadApi by its `assetId`
   */
  const nft = await metaplex.nfts().findByAssetId({ assetId });
  console.log(nft);

  printConsoleSeparator("Get the asset proof from the RPC:");

  /**
   * Perform client side verification of the proof that was provided by the RPC
   * ---
   * NOTE: This is not required to be performed, but may aid in catching errors
   * due to your RPC providing stale or incorrect data (often due to caching issues)
   * The actual proof validation is performed on-chain.
   * ---
   * NOTE: This client side validation is also handled by the Metaplex SDK when
   * transferring a compressed NFT. But it is also show here for convenience
   */

  // fetch an asset's proof from the ReadApi by its `assetId`
  const assetProof = (await metaplex.rpc().getAssetProof(assetId)) as GetAssetProofRpcResponse;
  console.log(assetProof);

  // construct a valid proof object to check against
  const merkleTreeProof: MerkleTreeProof = {
    leafIndex: nft.compression?.leaf_id || 0,
    leaf: new PublicKey(assetProof.leaf).toBuffer(),
    root: new PublicKey(assetProof.root).toBuffer(),
    proof: assetProof.proof.map((node: string) => new PublicKey(node).toBuffer()),
  };

  /**
   * note:
   * the `merkleTreeProof.proof` value is the COMPLETE list of all the "proof values".
   * The entire list of these "proof hashes" are required to be used when performing this
   * client side verification check. Since this client side check does not know/care about
   * the proof hashes that are stored on chain in the tree's canopy.
   *
   * warning:
   * This is different than when you are sending proof hashes inside of a compressed nft transfer instruction.
   * In that case, sending the "complete proof hash list" will result in a failed transaction.
   * This is because the on-chain program will use ALL the proof hashes included in the transaction
   * (via the `anchorRemainingAccounts` field) to compute the root hash on chain.
   *
   */

  printConsoleSeparator("Client side checks of the RPC provided proof");

  // get the actual merkle tree data from the Solana blockchain
  const merkleTree = new PublicKey(assetProof.tree_id);
  const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, merkleTree);

  const currentRoot = treeAccount.getCurrentRoot();
  const rootFromRpc = new PublicKey(assetProof.root).toBuffer();

  console.log("Is RPC provided proof/root valid:", MerkleTree.verify(rootFromRpc, merkleTreeProof));

  /**
   * note: the current on-chain root hash (`currentRoot`) does NOT have to match the
   * RPC provided root hash (`rootFromRpc`). This is because a "secure changelog"
   * of valid root hashes are stored on-chain via the trees on-chain buffer
   * (set by your tree's `maxBufferSize` at tree creation)
   *
   * This check is show here purely for demonstration, and is not required to be performed
   */
  console.log(
    "Does the current on-chain root match RPC provided root:",
    new PublicKey(currentRoot).toBase58() === new PublicKey(rootFromRpc).toBase58(),
  );
})();
