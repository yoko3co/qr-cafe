'use strict';

let blockchainVoting = true;
function getBlockchainVoting()      { return blockchainVoting; }
function setBlockchainVoting(value) { blockchainVoting = value; }

module.exports = { getBlockchainVoting, setBlockchainVoting };