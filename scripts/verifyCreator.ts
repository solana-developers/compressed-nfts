/**
 * Demonstrate the use of a few of the Metaplex Read API methods,
 * (needed to fetch compressed NFTs)
 */

// local import of the connection wrapper, to help with using the ReadApi
import { WrapperConnection } from "@/ReadApi/WrapperConnection";

// import custom helpers for demos
import {
  explorerURL,
  loadKeypairFromFile,
  loadOrGenerateKeypair,
  loadPublicKeysFromFile,
  printConsoleSeparator,
} from "@/utils/helpers";
import {
  TokenProgramVersion,
  TokenStandard,
  computeCreatorHash,
  computeDataHash,
  createVerifyCreatorInstruction,
} from "@metaplex-foundation/mpl-bubblegum";

import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ConcurrentMerkleTreeAccount,
} from "@solana/spl-account-compression";
import { MetadataArgs, Creator } from "@metaplex-foundation/mpl-bubblegum";
import {
  AccountMeta,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";

import dotenv from "dotenv";
dotenv.config();

(async () => {
  // generate a new Keypair for testing, named `wallet`
  const testWallet = loadOrGenerateKeypair("testWallet");

  // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
  const payer = process.env?.LOCAL_PAYER_JSON_ABSPATH
    ? loadKeypairFromFile(process.env?.LOCAL_PAYER_JSON_ABSPATH)
    : loadOrGenerateKeypair("payer");

  console.log("Payer address:", payer.publicKey.toBase58());
  console.log("Test wallet address:", testWallet.publicKey.toBase58());

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load the stored PublicKeys for ease of use
  let keys = loadPublicKeysFromFile();

  // ensure the primary script was already run
  if (!keys?.collectionMint || !keys?.treeAddress)
    return console.warn("No local keys were found. Please run the `index` script");

  const treeAddress: PublicKey = keys.treeAddress;
  const treeAuthority: PublicKey = keys.treeAuthority;
  const collectionMint: PublicKey = keys.collectionMint;
  const collectionMetadata: PublicKey = keys.collectionMetadataAccount;
  const collectionMasterEdition: PublicKey = keys.collectionMasterEditionAccount;

  const assetIdTestAddress: PublicKey = keys.assetIdTestAddress;
  const assetIdUserAddress: PublicKey = keys.assetIdUserAddress;

  console.log("==== Local PublicKeys loaded ====");
  console.log("Tree address:", treeAddress.toBase58());
  console.log("Tree authority:", treeAuthority.toBase58());
  console.log("Collection mint:", collectionMint.toBase58());
  console.log("Collection metadata:", collectionMetadata.toBase58());
  console.log("Collection master edition:", collectionMasterEdition.toBase58());

  console.log("Test Asset ID:", assetIdTestAddress.toBase58());
  console.log("User Asset ID:", assetIdUserAddress.toBase58());

  // set the asset to test with
  // const assetId = assetIdTestAddress;
  const assetId = assetIdUserAddress;

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load the env variables and store the cluster RPC url
  const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

  // create a new rpc connection, using the ReadApi wrapper
  const connection = new WrapperConnection(CLUSTER_URL);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Get the asset from the RPC");

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

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * define the creator address we want to verify on the specific nft
   * ---
   * note: this creator address is required to sign the transaction
   */
  const creatorAddress = payer.publicKey;

  /**
   * correctly format/type the list of `creators`
   * ---
   * note: the creator address you are going to verify should still be it's current `verified=false` value.
   * if the specific creator has already been verified, the instruction will throw an error and fail to execute
   */
  const creators: Creator[] = asset.creators.map(creator => {
    return {
      address: new PublicKey(creator.address),
      verified: creator.verified,
      share: creator.share,
    };
  });

  console.log("creators:", creators);

  /**
   * create a correctly formatted `metadataArgs` data object that will be used
   * for the on-chain hash verification
   * ---
   * note: this data object should be the correct, CURRENT data that is already
   * hashed and stored on-chain. if this data is incorrect, the on-chain hash
   * verification will throw and error and the instruction will fail
   */
  const metadataArgs: MetadataArgs = {
    name: asset.content.metadata?.name || "",
    symbol: asset.content.metadata?.symbol || "",
    uri: asset.content.json_uri,

    sellerFeeBasisPoints: asset.royalty.basis_points,

    creators: creators,
    collection: {
      key: new PublicKey(asset.grouping[0].group_value),
      // note: when a compressed nft is minted to a collection, the nft's collection value is auto verified
      verified: true,
    },
    editionNonce: asset.supply.edition_nonce,
    primarySaleHappened: asset.royalty.primary_sale_happened,
    isMutable: asset.mutable,
    uses: null,

    // values taken from the Bubblegum package
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.NonFungible,
  };

  // console.log("metadataArgs:", metadataArgs, "\n\n");

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Data hash and creator hash check");

  const currentDataHash = asset.compression.data_hash.trim();
  console.log("currentDataHash:", currentDataHash);
  const computedDataHash = new PublicKey(computeDataHash(metadataArgs)).toBase58();
  console.log("computedDataHash:", computedDataHash);
  console.log("Do they match:", computedDataHash == currentDataHash);

  const currentCreatorHash = asset.compression.creator_hash.trim();
  console.log("currentCreatorHash:", currentCreatorHash);
  const computedCreatorHash = new PublicKey(computeCreatorHash(creators)).toBase58();
  console.log("computedCreatorHash:", computedCreatorHash);
  console.log("Do they match:", currentCreatorHash == computedCreatorHash);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Get the tree's canopy depth to correctly slice the proof to send in the instruction
   */
  const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, treeAddress);
  const canopyDepth = treeAccount.getCanopyDepth();
  const slicedProof: AccountMeta[] = assetProof.proof
    .map((node: string) => ({
      pubkey: new PublicKey(node),
      isSigner: false,
      isWritable: false,
    }))
    .slice(0, assetProof.proof.length - (!!canopyDepth ? canopyDepth : 0));

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Build and send the transaction/instruction");

  // create an instruction to verify
  const verifyCreatorIx = createVerifyCreatorInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(asset.ownership.owner),
      leafDelegate: new PublicKey(asset.ownership.delegate || asset.ownership.owner),
      merkleTree: treeAddress,
      payer: payer.publicKey,

      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      creator: creatorAddress,

      // provide the sliced proof
      anchorRemainingAccounts: slicedProof,
    },
    {
      // use the current root provided via the `getAssetProof`
      root: [...new PublicKey(assetProof.root.trim()).toBytes()],
      // compute the creator hash from the creators array
      creatorHash: [...computeCreatorHash(creators)],
      // compute the data hash from the metadata
      dataHash: [...computeDataHash(metadataArgs)],
      nonce: asset.compression.leaf_id,
      index: asset.compression.leaf_id,

      // provide the full `metadataArgs` value for on-chain hash verification
      message: metadataArgs,
    },
  );

  // build the transaction
  let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [verifyCreatorIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  // sign with the fee payer and the authority addresses
  tx.sign([payer]);

  const sig = await connection.sendTransaction(tx);

  console.log(explorerURL({ txSignature: sig }));

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * note: based on the speed of indexing updates to compressed nfts,
   * this might not result in the updated asset data immediately after updating
   */

  printConsoleSeparator("Get the new asset data");

  const newAsset = await connection.getAsset(assetId);

  console.log(newAsset);
})();
