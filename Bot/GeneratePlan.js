const Web3 = require("web3");
const dotenv = require("dotenv");

const IOrderbookExchangeABI = require(__dirname + '/../Interface/IOrderbookExchange.json');

dotenv.config();


if (process.env.WEB3_HTTP_PROVIDER_URL === null || process.env.WEB3_HTTP_PROVIDER_URL === undefined) {
	console.error("Invalid Web3 http provider url", process.env.WEB3_HTTP_PROVIDER_URL);
	process.exit();
}

var web3 = new Web3(new Web3.providers.HttpProvider(process.env.WEB3_HTTP_PROVIDER_URL));

const fs = require('fs');
const BN = web3.utils.BN;
let Mul, Div, Pow, ApproxNthRoot;
({Mul, Div, Pow, ApproxNthRoot} = require('../helper/BBN.js').getFunctionality(BN));
const _0 = new BN(0);
const _1 = new BN(1);
const _2 = new BN(2);
const _10To18 = (new BN(10)).pow(new BN(18));

const OrderbookAddress = process.env.ORDERBOOK_ADDRESS;

const outFilename = __dirname + '/../JSON/GeneratedPlan.json';

async function fileExists(filename) {
	return await new Promise((res, rej) => {
		fs.access(filename, fs.constants.F_OK, (err) => {
			if (err) res(false);
			else res(true);
		})
	});
}