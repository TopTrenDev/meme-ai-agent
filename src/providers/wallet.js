import { Connection } from "@solana/web3.js";
import { toBN } from "../utils/bignumber.js";
import NodeCache from "node-cache";
import { getWalletKey } from "../utils/keypairUtils.js";
// Provider configuration
const PROVIDER_CONFIG = {
    BIRDEYE_API: "https://public-api.birdeye.so",
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    DEFAULT_RPC: "https://api.mainnet-beta.solana.com",
    GRAPHQL_ENDPOINT: "https://graph.codex.io/graphql",
    TOKEN_ADDRESSES: {
        SOL: process.env.SOL_ADDRESS || "So11111111111111111111111111111111111111112",
        BTC: process.env.BTC_ADDRESS,
        ETH: process.env.ETH_ADDRESS,
    },
};
export class WalletProvider {
    connection;
    walletPublicKey;
    cache;
    publicKey; // Add this property
    signTransaction; // Add this property
    isConnected; // Add this property
    sendTransaction; // Add this property
    connect; // Add this property
    disconnect; // Add this property
    constructor(connection, walletPublicKey // Ensure this is public
    ) {
        this.connection = connection;
        this.walletPublicKey = walletPublicKey;
        this.cache = new NodeCache({ stdTTL: 300 }); // Cache TTL set to 5 minutes
        this.publicKey = walletPublicKey; // Initialize the publicKey property
        this.signTransaction = async () => null; // Initialize the signTransaction property
        this.isConnected = false; // Initialize the isConnected property
        this.sendTransaction = async () => ({ signature: '' }); // Initialize the sendTransaction property
        this.connect = async () => { }; // Initialize the connect property
        this.disconnect = async () => { }; // Initialize the disconnect property
    }
    async fetchWithRetry(runtime, url, options = {}) {
        let lastError = new Error("No error occurred");
        for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        Accept: "application/json",
                        "x-chain": "solana",
                        "X-API-KEY": runtime.getSetting("BIRDEYE_API_KEY") || "",
                        ...options.headers,
                    },
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }
                const data = await response.json();
                return data;
            }
            catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                lastError = error;
                if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
                    const delay = PROVIDER_CONFIG.RETRY_DELAY * Math.pow(2, i);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
        }
        console.error("All attempts failed. Throwing the last error:", lastError);
        throw lastError;
    }
    async fetchPortfolioValue(runtime) {
        try {
            const cacheKey = `portfolio-${this.walletPublicKey.toBase58()}`;
            const cachedValue = this.cache.get(cacheKey);
            if (cachedValue) {
                console.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }
            console.log("Cache miss for fetchPortfolioValue");
            const walletData = await this.fetchWithRetry(runtime, `${PROVIDER_CONFIG.BIRDEYE_API}/v1/wallet/token_list?wallet=${this.walletPublicKey.toBase58()}`);
            if (!walletData?.success || !walletData?.data) {
                console.error("No portfolio data available", walletData);
                throw new Error("No portfolio data available");
            }
            const data = walletData.data;
            const totalUsd = toBN(data.totalUsd.toString());
            const prices = await this.fetchPrices(runtime);
            const solPriceInUSD = toBN(prices.solana.usd.toString());
            const items = data.items.map((item) => ({
                ...item,
                valueSol: toBN(item.valueUsd || 0)
                    .div(solPriceInUSD)
                    .toFixed(6),
                name: item.name || "Unknown",
                symbol: item.symbol || "Unknown",
                priceUsd: item.priceUsd || "0",
                valueUsd: item.valueUsd || "0",
            }));
            const totalSol = totalUsd.div(solPriceInUSD);
            const portfolio = {
                totalUsd: totalUsd.toString(),
                totalSol: totalSol.toFixed(6),
                items: items.sort((a, b) => toBN(b.valueUsd)
                    .minus(toBN(a.valueUsd))
                    .toNumber()),
            };
            this.cache.set(cacheKey, portfolio);
            return portfolio;
        }
        catch (error) {
            console.error("Error fetching portfolio:", error);
            throw error;
        }
    }
    async fetchPortfolioValueCodex(runtime) {
        try {
            const cacheKey = `portfolio-${this.walletPublicKey.toBase58()}`;
            const cachedValue = await this.cache.get(cacheKey);
            if (cachedValue) {
                console.log("Cache hit for fetchPortfolioValue");
                return cachedValue;
            }
            console.log("Cache miss for fetchPortfolioValue");
            const query = `
              query Balances($walletId: String!, $cursor: String) {
                balances(input: { walletId: $walletId, cursor: $cursor }) {
                  cursor
                  items {
                    walletId
                    tokenId
                    balance
                    shiftedBalance
                  }
                }
              }
            `;
            const variables = {
                walletId: `${this.walletPublicKey.toBase58()}:${1399811149}`,
                cursor: null,
            };
            const response = await fetch(PROVIDER_CONFIG.GRAPHQL_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: runtime.getSetting("CODEX_API_KEY") || "",
                },
                body: JSON.stringify({
                    query,
                    variables,
                }),
            }).then((res) => res.json());
            const data = response.data?.data?.balances?.items;
            if (!data || data.length === 0) {
                console.error("No portfolio data available", data);
                throw new Error("No portfolio data available");
            }
            // Fetch token prices
            const prices = await this.fetchPrices(runtime);
            const solPriceInUSD = toBN(prices.solana.usd.toString());
            // Reformat items
            const items = data.map((item) => {
                return {
                    name: "Unknown",
                    address: item.tokenId.split(":")[0],
                    symbol: item.tokenId.split(":")[0],
                    decimals: 6,
                    balance: item.balance,
                    uiAmount: item.shiftedBalance.toString(),
                    priceUsd: "",
                    valueUsd: "",
                    valueSol: "",
                };
            });
            // Calculate total portfolio value
            const totalUsd = items.reduce((sum, item) => sum.plus(toBN(item.valueUsd)), toBN(0));
            const totalSol = totalUsd.div(solPriceInUSD);
            const portfolio = {
                totalUsd: totalUsd.toFixed(6),
                totalSol: totalSol.toFixed(6),
                items: items.sort((a, b) => toBN(b.valueUsd)
                    .minus(toBN(a.valueUsd))
                    .toNumber()),
            };
            // Cache the portfolio for future requests
            await this.cache.set(cacheKey, portfolio, 60 * 1000); // Cache for 1 minute
            return portfolio;
        }
        catch (error) {
            console.error("Error fetching portfolio:", error);
            throw error;
        }
    }
    async fetchPrices(runtime) {
        try {
            const cacheKey = "prices";
            const cachedValue = this.cache.get(cacheKey);
            if (cachedValue) {
                console.log("Cache hit for fetchPrices");
                return cachedValue;
            }
            console.log("Cache miss for fetchPrices");
            const { SOL, BTC, ETH } = PROVIDER_CONFIG.TOKEN_ADDRESSES;
            const tokens = [SOL, BTC, ETH];
            const prices = {
                solana: { usd: "0" },
                bitcoin: { usd: "0" },
                ethereum: { usd: "0" },
            };
            for (const token of tokens) {
                const response = await this.fetchWithRetry(runtime, `${PROVIDER_CONFIG.BIRDEYE_API}/defi/price?address=${token}`, {
                    headers: {
                        "x-chain": "solana",
                    },
                });
                if (response?.data?.value) {
                    const price = response.data.value.toString();
                    prices[token === SOL
                        ? "solana"
                        : token === BTC
                            ? "bitcoin"
                            : "ethereum"].usd = price;
                }
                else {
                    console.warn(`No price data available for token: ${token}`);
                }
            }
            this.cache.set(cacheKey, prices);
            return prices;
        }
        catch (error) {
            console.error("Error fetching prices:", error);
            throw error;
        }
    }
    formatPortfolio(runtime, portfolio, prices) {
        let output = `${runtime.character.name}\n`;
        output += `Wallet Address: ${this.walletPublicKey.toBase58()}\n\n`;
        const totalUsdFormatted = toBN(portfolio.totalUsd).toFixed(2);
        const totalSolFormatted = portfolio.totalSol;
        output += `Total Value: $${totalUsdFormatted} (${totalSolFormatted} SOL)\n\n`;
        output += "Token Balances:\n";
        const nonZeroItems = portfolio.items.filter((item) => toBN(item.uiAmount).isGreaterThan(0));
        if (nonZeroItems.length === 0) {
            output += "No tokens found with non-zero balance\n";
        }
        else {
            for (const item of nonZeroItems) {
                const valueUsd = toBN(item.valueUsd).toFixed(2);
                output += `${item.name} (${item.symbol}): ${toBN(item.uiAmount).toFixed(6)} ($${valueUsd} | ${item.valueSol} SOL)\n`;
            }
        }
        output += "\nMarket Prices:\n";
        output += `SOL: $${toBN(prices.solana.usd).toFixed(2)}\n`;
        output += `BTC: $${toBN(prices.bitcoin.usd).toFixed(2)}\n`;
        output += `ETH: $${toBN(prices.ethereum.usd).toFixed(2)}\n`;
        return output;
    }
    async getFormattedPortfolio(runtime) {
        try {
            const [portfolio, prices] = await Promise.all([
                this.fetchPortfolioValue(runtime),
                this.fetchPrices(runtime),
            ]);
            return this.formatPortfolio(runtime, portfolio, prices);
        }
        catch (error) {
            console.error("Error generating portfolio report:", error);
            return "Unable to fetch wallet information. Please try again later.";
        }
    }
}
const walletProvider = {
    get: async (runtime, _message, _state) => {
        try {
            const { publicKey } = await getWalletKey(runtime, false, { requirePrivateKey: false, publicKeyString: '' });
            const connection = new Connection(runtime.getSetting("RPC_URL") || PROVIDER_CONFIG.DEFAULT_RPC);
            if (!publicKey) {
                throw new Error("Wallet public key is required");
            }
            const provider = new WalletProvider(connection, publicKey);
            return await provider.getFormattedPortfolio(runtime);
        }
        catch (error) {
            console.error("Error in wallet provider:", error);
            return null;
        }
    },
};
// Module exports
export { walletProvider };
