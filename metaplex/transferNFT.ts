/**
 * Demonstrate how to transfer a compressed NFT from one owner to another,
 * using the `@metaplex-foundation/js` SDK
 */

// imports from other libraries
import dotenv from "dotenv";
import { Metaplex, ReadApiConnection, keypairIdentity } from "@metaplex-foundation/js";
import { PublicKey, clusterApiUrl } from "@solana/web3.js";

// import custom helpers for demos
import {
  loadPublicKeysFromFile,
  loadKeypairFromFile,
  loadOrGenerateKeypair,
  explorerURL,
  printConsoleSeparator,
} from "@/utils/helpers";

// load the env variables and store the cluster RPC url
dotenv.config();
const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

// create a new rpc connection
// const connection = new Connection(CLUSTER_URL);
const connection = new ReadApiConnection(CLUSTER_URL);

(async () => {
  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // generate a new Keypair for testing, named `testWallet`
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

  const metaplex = Metaplex.make(connection).use(keypairIdentity(payer));
  // const metaplex = Metaplex.make(connection).use(keypairIdentity(testWallet));

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Get the compressed nft by its assetId:");

  /**
   * Fetch an asset from the ReadApi by its `assetId`
   */
  const nft = await metaplex.nfts().findByAssetId({ assetId });
  console.log(nft);

  /**
   * Use the Metaplex SDK to perform the transfer of a compressed NFT
   * ---
   * NOTE: When your `nftOrSft` was already retrieved using the ReadApi
   * (via `metaplex.nfts().findByAssetId()`), the Metaplex SDK will
   * auto-magically handle the rest of the data fetching (including the
   * proof and merkle tree), * as well as perform some client side verification
   * that the RPC provided proof is valid to complete the transfer
   */

  printConsoleSeparator("Transfer the compressed nft:");

  await metaplex
    .nfts()
    .transfer({
      nftOrSft: nft,
      toOwner: payer.publicKey,
    })
    .then(res => {
      console.log("transfer complete:", res);

      console.log(explorerURL({ txSignature: res.response.signature }));
    })
    .catch(err => {
      console.log("==================");
      console.log("  Transfer failed!");
      console.log("==================");
      console.error(err);
    });
})();
