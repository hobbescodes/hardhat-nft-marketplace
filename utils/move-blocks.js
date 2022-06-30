// sleepAmount is an optional parameter that can be passed to force the mining to wait (or sleep) for a while before moving to the next block

const { network } = require("hardhat")

const sleep = (timeInMs) => {
    return new Promise((resolve) => {
        setTimeout(resolve, timeInMs)
    })
}

// this is used when you really want to mimick the actions of a blockchain even while on localhost
const moveBlocks = async (amount, sleepAmount = 0) => {
    console.log("Moving blocks...")
    for (let index = 0; index < amount; index++) {
        await network.provider.request({
            method: "evm_mine",
            params: [],
        })
        if (sleepAmount) {
            console.log(`sleeping for ${sleepAmount}`)
            await sleep(sleepAmount)
        }
    }
}

module.exports = {
    moveBlocks,
    sleep,
}
