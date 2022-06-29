// SPDX-License-Identifier: MIT

pragma solidity 0.8.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

error NftMarketplace__PriceMustBeGreaterThanZero();
error NftMarketplace__NotApprovedForMarketplace();
error NftMarketplace__AlreadyListed(address nftAddress, uint256 tokenId);
error NftMarketplace__NotListed(address nftAddress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NftMarketplace__NotOwner();
error NftMarketplace__NoProceeds();
error NftMarketplace__TransferFailed();

contract NftMarketplace {
    struct Listing {
        uint256 price;
        address seller;
    }

    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemBought(
        address indexed buyer,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemCanceled(address indexed seller, address indexed nftAddress, uint256 indexed tokenId);

    mapping(address => mapping(uint256 => Listing)) private s_listings;

    mapping(address => uint256) private s_proceeds;

    modifier notListed(
        address nftAddress,
        uint256 tokenId,
        address owner
    ) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) revert NftMarketplace__AlreadyListed(nftAddress, tokenId);
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price <= 0) revert NftMarketplace__NotListed(nftAddress, tokenId);
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        if (spender != owner) revert NftMarketplace__NotOwner();
        _;
    }

    /**
     * @notice Method for listing an NFT on the Marketplace
     * @param nftAddress: contract address of the NFT
     * @param tokenId: token ID of the NFT
     * @param price: price to be listed at
     * @dev We could have the contract be the escrow for the NFTs, but this way people can still hold their NFTs
     * even while they are listed
     */

    // CHALLENGE: Have this contract accept payment in a subset of tokens as well:
    // Use chainlink price feed to convert the price of the tokens between each other
    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external notListed(nftAddress, tokenId, msg.sender) isOwner(nftAddress, tokenId, msg.sender) {
        // Can't list NFT for zero ETH
        if (price <= 0) revert NftMarketplace__PriceMustBeGreaterThanZero();

        // Wrap nftAddress as an ERC721 to make sure it has all the correctly functionality attached to it
        IERC721 nft = IERC721(nftAddress);

        // Marketplace must be approved to sell (transfer) the nft
        if (nft.getApproved(tokenId) != address(this))
            revert NftMarketplace__NotApprovedForMarketplace();

        // If all conditions are met, update listing data structure on listItem() call
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);

        // emit an ItemListed() event to make querying on frontend easier
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    function buyItem(address nftAddress, uint256 tokenId)
        external
        payable
        isListed(nftAddress, tokenId)
    {
        // Get listing from the Listing data structure
        Listing memory listedItem = s_listings[nftAddress][tokenId];

        // Can't buy NFT for anything less than the price it is listed at
        if (msg.value < listedItem.price)
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);

        // NOTE: We don't just send the seller the ETH directly as per pull over push https://fravoll.github.io/solidity-patterns/pull_over_push.html
        // Update the proceeds data structure for the seller
        s_proceeds[listedItem.seller] = s_proceeds[listedItem.seller] + msg.value;

        // Remove the NFT from the listings data sctructure
        delete s_listings[nftAddress][tokenId];

        // Transfer the NFT from the seller, to the buyer
        // NOTE: safeTransferFrom will throw an error if the buyer address can not receive ERC721s
        IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);

        // emit an ItemBought() event to make querying on frontend easier
        emit ItemBought(msg.sender, nftAddress, tokenId, listedItem.price);
    }

    function cancelListing(address nftAddress, uint256 tokenId)
        external
        isOwner(nftAddress, tokenId, msg.sender)
        isListed(nftAddress, tokenId)
    {
        // Remove the NFT from the listings data structure
        delete s_listings[nftAddress][tokenId];

        // emit an ItemCanceled() event to make querying on frontend easier
        emit ItemCanceled(msg.sender, nftAddress, tokenId);
    }

    function updateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    ) external isListed(nftAddress, tokenId) isOwner(nftAddress, tokenId, msg.sender) {
        // update the listings data structure
        s_listings[nftAddress][tokenId].price = newPrice;

        // emit an ItemListed() event to make querying on frontend easier
        // NOTE: we could emit a different event (i.e. itemUpdated) but updating an item is essentially relisting, at a new price
        emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
    }

    function withdrawProceeds() external {
        // get the current proceeds of the function caller
        uint256 proceeds = s_proceeds[msg.sender];

        // Can't withdraw proceeds if there are none to withdraw
        if (proceeds <= 0) revert NftMarketplace__NoProceeds();

        // Update the proceeds data structure
        s_proceeds[msg.sender] = 0;

        // Withdraw the proceeds
        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) revert NftMarketplace__TransferFailed();
    }

    function getListing(address nftAddress, uint256 tokenId)
        external
        view
        returns (Listing memory)
    {
        return s_listings[nftAddress][tokenId];
    }

    function getProceeds(address seller) external view returns (uint256) {
        return s_proceeds[seller];
    }
}
