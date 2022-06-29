const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", () => {
          let nftMarketplace, nftMarketplaceContract, basicNft, basicNftContract
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              user = accounts[1]

              await deployments.fixture(["all"])
              nftMarketplaceContract = await ethers.getContract("NftMarketplace")
              nftMarketplace = nftMarketplaceContract.connect(deployer)
              basicNftContract = await ethers.getContract("BasicNft")
              basicNft = basicNftContract.connect(deployer)

              await basicNft.mintNft()
              await basicNft.approve(nftMarketplaceContract.address, TOKEN_ID)
          })

          describe("listItem", () => {
              it("emit an event after an item is listed", async () => {
                  expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      "ItemListed"
                  )
              })
              it("cant list items that are already listed", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const error = `NftMarketplace__AlreadyListed("${basicNft.address}", ${TOKEN_ID})`

                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })
              it("only owners of the NFT can list", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await basicNft.approve(user.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("approval is needed to list an NFT", async () => {
                  await basicNft.mintNft()
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID + 1, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })
              it("updates listing data structure with seller and price", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE.toString())
                  assert(listing.seller.toString() == deployer.address)
              })
          })

          describe("buyItem", () => {
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)
              })

              it("emit an event after an item is bought", async () => {
                  expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  ).to.emit("ItemBought")
              })
              it("cant be purchased for less than the listed price", async () => {
                  const error = `NftMarketplace__PriceNotMet("${basicNft.address}", ${TOKEN_ID}, ${PRICE})`
                  expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE - 1 })
                  ).to.be.revertedWith(error)
              })
              it("cant purchase an NFT that is not listed", async () => {
                  await basicNft.mintNft()
                  const error = `NftMarketplace_NotListed("${basicNft.address}", ${TOKEN_ID + 1})`
                  expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID + 1, { value: PRICE })
                  ).to.be.revertedWith(error)
              })
              it("updates the proceeds data structure for the seller", async () => {
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  const endingProceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert.equal(endingProceeds.toString(), PRICE.toString())
              })
              it("updates the listings data structure", async () => {
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  expect(nftMarketplace.getListing(basicNft.address, TOKEN_ID)).to.be.reverted
              })
              it("transfers the nft from the seller to the buyer", async () => {
                  const originalOwner = await basicNft.ownerOf(TOKEN_ID)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)

                  assert.equal(originalOwner.toString(), deployer.address)
                  assert.equal(newOwner.toString(), user.address)
              })
          })

          describe("cancelListing", () => {
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
              })

              it("cant cancel listing if you dont own the NFT", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("cant cancel listing if the NFT is not listed", async () => {
                  await basicNft.mintNft()
                  const error = `NftMarketplace_NotListed("${basicNft.address}", ${TOKEN_ID + 1})`
                  expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID + 1)
                  ).to.be.revertedWith(error)
              })
              it("updates the listings data structure", async () => {
                  await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  expect(nftMarketplace.getListing(basicNft.address, TOKEN_ID)).to.be.reverted
              })
              it("emit an event after a listing is canceled", async () => {
                  expect(nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      "ItemCanceled"
                  )
              })
          })

          describe("updateListing", () => {
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
              })

              it("cant update a listing for an NFT that is not listed", async () => {
                  await basicNft.mintNft()
                  const error = `NftMarketplace_NotListed("${basicNft.address}", ${TOKEN_ID + 1})`
                  expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID + 1, PRICE + 1)
                  ).to.be.revertedWith(error)
              })
              it("cant update a listing if you do not own the NFT", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("updates the listings data structure", async () => {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == updatedPrice.toString())
              })
              it("emits an ItemListed event", async () => {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  expect(
                      await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)
                  ).to.emit("ItemListed")
              })
          })

          describe("withdrawProceeds", () => {
              it("cant withdraw when there are no proceeds", async () => {
                  expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })
              it("updates thhe proceeds data structure for the caller of the function", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  nftMarketplace = nftMarketplaceContract.connect(deployer)
                  await nftMarketplace.withdrawProceeds()
                  const updatedProceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert(updatedProceeds == 0)
              })
              it("withdraws proceeds", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  nftMarketplace = nftMarketplaceContract.connect(deployer)

                  const startingProceeds = await nftMarketplace.getProceeds(deployer.address)
                  const startingBalance = await deployer.getBalance()
                  const tx = await nftMarketplace.withdrawProceeds()
                  const txReceipt = await tx.wait(1)
                  const { gasUsed, effectiveGasPrice } = txReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const endingBalance = await deployer.getBalance()

                  assert(
                      endingBalance.add(gasCost).toString() ==
                          startingBalance.add(startingProceeds).toString()
                  )
              })
          })
      })
