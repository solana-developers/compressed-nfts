# State Compression and Compressed NFTs

At a high level, state compression is a technique in which a off-chain data is secured by the Solana
ledger, using a hashing algorithm to "fingerprint" the _off-chain_ data and storing it inside a
special _on-chain_ Merkle tree, called a Concurrent Merkle Tree.

With this technology, compressed NFTs can be created on-chain in a similar manner as before, but for
a fraction of the cost as before. As a frame of reference of on-chain cost reduction, take a 1
million NFT collection:

- traditional NFTs (aka non-compressed):
  - 1 million NFTs ~= 12,000 SOL
- compressed NFTs:
  - 1 million NFTs ~= 5 SOL

## Tech stack of this repo

- uses TypeScript and NodeJS
- yarn (as the node package manager)

## Setup locally

1. Clone this repo to your local system
2. Install the packages via `yarn install`
3. Copy rename the `example.env` file to be named `.env`
4. Update the `RPC_URL` variable to be the cluster URL of a supporting RPC provider

If you have the Solana CLI installed locally: update the `LOCAL_PAYER_JSON_ABSPATH` environment
variable to be the **_absolute path_** of your local testing wallet keypair JSON file.

## Recommended flow to explore this repo

After setting up locally, I recommend exploring the code of the following files (in order):

1. `./scripts/verboseCreateAndMint.ts`
2. `./scripts/fetchNFTsByOwner.ts`
3. `./scripts/transferNFT.ts`

After reviewing the code, then running each of these scripts in the same order.

> **Note:** Running each of these scripts will save some bits of data to a `.local_keys` folder
> within this repo for use by the other scripts later in this ordered list. Therefore, running them
> in a different order will result in them not working as written. You have been warned :)

### Running the included Scripts

Once setup locally, you will be able to run the scripts included within this repo:

```
yarn demo ./scripts/<script>
```

#### `createAndMint.ts`

Performs all the following actions:

- create a new Merkle tree on-chain
- create a new NFT collection
- mint two compressed NFTs (to different addresses)

#### `verboseCreateAndMint.ts`

Functionally the same as `createAndMint.ts`. This scripts adds extra console logging and comments
for explanation purposes.

#### `fetchNFTsByOwner.ts`

Using the ReadApi `fetchAssetsByOwner` method to fetch the NFTs owners by the two addresses.

#### `fetchNFTsByCollection.ts`

Using the ReadApi `fetchAssetsByGroup` method to fetch the NFTs belonging to the same collection.

#### `transferNFT.ts`

Performs the complete process to transfer a compressed NFTs. Specifically:

- fetching the NFT asset data from the RPC
- fetching the asset's proof from the RPC
- verifying the RPC provided proof on the client side
- builds the compressed NFT transfer function

#### `mintToCollection.ts`

Mint additional compressed NFTs into an already existing collection and/or tree.

## Resources on State Compression and Compressed NFTS

- Account Compression Program:
  - Documentation - https://spl.solana.com/account-compression
  - Repository -
    https://github.com/solana-labs/solana-program-library/tree/master/account-compression
- Metaplex Read API:
  - open spec:
    https://github.com/metaplex-foundation/api-specifications/tree/main/specifications/read_api
  - Playground - https://metaplex-read-api.surge.sh/
- Metaplex Compression examples:
  - https://github.com/metaplex-foundation/compression-read-api-js-examples
  - Bubblegum program -
    https://github.com/metaplex-foundation/metaplex-program-library/tree/master/bubblegum
