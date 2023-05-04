/**
 * Demonstrate the use of a few of the Metaplex Read API methods,
 * (needed to fetch compressed NFTs)
 * using the `@metaplex-foundation/js` sdk
 */

// import custom helpers for demos
import {
  loadPublicKeysFromFile,
  printConsoleSeparator,
  savePublicKeyToFile,
} from "@/utils/helpers";

// imports from other libraries
import dotenv from "dotenv";
import { Metaplex, MetaplexError, ReadApiAssetList } from "@metaplex-foundation/js";
import { ReadApiConnection } from "@metaplex-foundation/js";
import { PublicKey } from "@solana/web3.js";

// load the env variables and store the cluster RPC url
dotenv.config();
const CLUSTER_URL = process.env.RPC_URL ?? "";

(async () => {
  // load the stored PublicKeys for ease of use
  let keys = loadPublicKeysFromFile();

  // ensure the primary script was already run
  if (!keys?.collectionMint || !keys?.treeAddress)
    return console.warn("No local keys were found. Please run the `index` script");

  const treeAddress: PublicKey = keys.treeAddress;
  const treeAuthority: PublicKey = keys.treeAuthority;
  const collectionMint: PublicKey = keys.collectionMint;
  const userAddress: PublicKey = keys.userAddress;
  const testWallet: PublicKey = keys.testWallet;

  console.log("==== Local PublicKeys loaded ====");
  console.log("Tree address:", treeAddress.toBase58());
  console.log("Tree authority:", treeAuthority.toBase58());
  console.log("Collection mint:", collectionMint.toBase58());
  console.log("User address:", userAddress.toBase58());
  console.log("Test address:", testWallet.toBase58());

  // define the address we are actually going to check (in this case, either are user's address or test address)
  // const checkAddress = testWallet.toBase58();
  const checkAddress = userAddress.toBase58();

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator(`getAssetsByOwner: ${checkAddress}`);

  const connection = new ReadApiConnection(CLUSTER_URL);
  const metaplex = Metaplex.make(connection);

  /**
   * Fetch a listing of NFT assets by an owner's address (via the ReadApi)
   * ---
   * NOTE: This will return both compressed NFTs AND traditional/uncompressed NFTS
   */
  const rpcAssets = await metaplex
    .rpc()
    .getAssetsByOwner({
      ownerAddress: checkAddress,
    })
    .then(res => {
      if ((res as MetaplexError)?.cause) throw res;
      else return res as ReadApiAssetList;
    });

  /**
   * Process the returned `rpcAssets` response
   */
  console.log("Total assets returned:", rpcAssets.total);

  // loop over each of the asset items in the collection
  rpcAssets.items.map(asset => {
    // only show compressed nft assets
    if (!asset.compression.compressed) return;

    // display a spacer between each of the assets
    console.log("\n===============================================");

    // locally save the addresses for the demo
    savePublicKeyToFile("assetIdTestAddress", new PublicKey(asset.id));

    // extra useful info
    console.log("assetId:", asset.id);

    // view the ownership info for the given asset
    console.log("ownership:", asset.ownership);

    // metadata json data (auto fetched thanks to the Metaplex Read API)
    // console.log("metadata:", asset.content.metadata);

    // view the compression specific data for the given asset
    console.log("compression:", asset.compression);

    if (asset.compression.compressed) {
      console.log("==> This NFT is compressed! <===");
      console.log("\tleaf_id:", asset.compression.leaf_id);
    } else console.log("==> NFT is NOT compressed! <===");
  });
})();
