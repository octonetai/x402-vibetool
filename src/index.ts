#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios from "axios";
import { ethers } from "ethers";
import {
  Keypair,
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

// Network configurations
const NETWORKS = {
  base: {
    type: "evm",
    chainId: 8453,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    name: "Base Mainnet",
  },
  "base-sepolia": {
    type: "evm",
    chainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    name: "Base Sepolia Testnet",
  },
  polygon: {
    type: "evm",
    chainId: 137,
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    name: "Polygon Mainnet",
  },
  "polygon-amoy": {
    type: "evm",
    chainId: 80002,
    usdcAddress: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
    name: "Polygon Amoy Testnet",
  },
  avalanche: {
    type: "evm",
    chainId: 43114,
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    name: "Avalanche C-Chain",
  },
  "avalanche-fuji": {
    type: "evm",
    chainId: 43113,
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    name: "Avalanche Fuji Testnet",
  },
  solana: {
    type: "svm",
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    name: "Solana Mainnet",
  },
  "solana-devnet": {
    type: "svm",
    usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    rpcUrl: "https://api.devnet.solana.com",
    name: "Solana Devnet",
  },
};

const FACILITATOR_URL = "https://facilitator.octox402.xyz";

// Create MCP Server
const server = new Server(
  {
    name: "octo-x402-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Get Facilitator Health
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "x402_get_health",
        description:
          "Check the health and status of the Octo x402 facilitator service",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "x402_get_supported_networks",
        description:
          "Get list of all supported payment networks and their configurations",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "x402_get_stats",
        description:
          "Get facilitator statistics including uptime, memory usage, and capabilities",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "x402_create_payment_requirements",
        description:
          "Create payment requirements object for a merchant endpoint (returns HTTP 402 payload)",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description:
                "Network ID (base, polygon, avalanche, solana, etc.)",
              enum: Object.keys(NETWORKS),
            },
            amount: {
              type: "string",
              description: "Payment amount in USDC (6 decimals, e.g., '10000' for $0.01)",
            },
            merchantWallet: {
              type: "string",
              description: "Merchant's receiving wallet address",
            },
            resource: {
              type: "string",
              description: "Full URL of the protected resource",
            },
            description: {
              type: "string",
              description: "Description of what the payment is for",
            },
            mimeType: {
              type: "string",
              description: "Content type being sold",
              default: "application/json",
            },
          },
          required: ["network", "amount", "merchantWallet", "resource", "description"],
        },
      },
      {
        name: "x402_create_evm_payment",
        description:
          "Create an EVM payment authorization (EIP-712 signature) for networks like Base, Polygon, Avalanche",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID (base, polygon, avalanche, etc.)",
              enum: Object.keys(NETWORKS).filter(
                (k) => NETWORKS[k].type === "evm"
              ),
            },
            privateKey: {
              type: "string",
              description: "Consumer's EVM private key (0x...)",
            },
            paymentRequirements: {
              type: "object",
              description: "Payment requirements object from merchant (HTTP 402 response)",
            },
          },
          required: ["network", "privateKey", "paymentRequirements"],
        },
      },
      {
        name: "x402_create_solana_payment",
        description:
          "Create a Solana payment transaction (signed versioned transaction) for Solana networks",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID (solana or solana-devnet)",
              enum: ["solana", "solana-devnet"],
            },
            privateKey: {
              type: "string",
              description: "Consumer's Solana private key (base58 encoded)",
            },
            paymentRequirements: {
              type: "object",
              description: "Payment requirements object from merchant (HTTP 402 response)",
            },
          },
          required: ["network", "privateKey", "paymentRequirements"],
        },
      },
      {
        name: "x402_verify_payment",
        description:
          "Verify a payment signature without settling on blockchain (merchant-side)",
        inputSchema: {
          type: "object",
          properties: {
            paymentPayload: {
              type: "object",
              description: "Decoded payment payload from X-PAYMENT header",
            },
            paymentRequirements: {
              type: "object",
              description: "Payment requirements that were sent to consumer",
            },
          },
          required: ["paymentPayload", "paymentRequirements"],
        },
      },
      {
        name: "x402_settle_payment",
        description:
          "Verify and settle payment on blockchain (merchant-side). Facilitator pays gas on EVM, consumer pays on Solana",
        inputSchema: {
          type: "object",
          properties: {
            paymentPayload: {
              type: "object",
              description: "Decoded payment payload from X-PAYMENT header",
            },
            paymentRequirements: {
              type: "object",
              description: "Payment requirements that were sent to consumer",
            },
          },
          required: ["paymentPayload", "paymentRequirements"],
        },
      },
      {
        name: "x402_decode_payment_header",
        description:
          "Decode a base64-encoded X-PAYMENT header to inspect its contents",
        inputSchema: {
          type: "object",
          properties: {
            paymentHeader: {
              type: "string",
              description: "Base64-encoded X-PAYMENT header value",
            },
          },
          required: ["paymentHeader"],
        },
      },
      {
        name: "x402_generate_merchant_middleware",
        description:
          "Generate Express.js middleware code for payment verification (merchant implementation)",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID to generate middleware for",
              enum: Object.keys(NETWORKS),
            },
            language: {
              type: "string",
              description: "Programming language",
              enum: ["typescript", "javascript"],
              default: "typescript",
            },
          },
          required: ["network"],
        },
      },
      {
        name: "x402_generate_consumer_code",
        description:
          "Generate consumer code for making x402 payments (consumer implementation)",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID to generate code for",
              enum: Object.keys(NETWORKS),
            },
            language: {
              type: "string",
              description: "Programming language",
              enum: ["typescript", "javascript"],
              default: "typescript",
            },
          },
          required: ["network"],
        },
      },
      {
        name: "x402_calculate_total_cost",
        description:
          "Calculate total cost including network fees for a payment",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID",
              enum: Object.keys(NETWORKS),
            },
            amount: {
              type: "string",
              description: "Payment amount in USDC (6 decimals)",
            },
          },
          required: ["network", "amount"],
        },
      },
      {
        name: "x402_get_network_info",
        description:
          "Get detailed information about a specific network including USDC address, chain ID, and fee structure",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Network ID",
              enum: Object.keys(NETWORKS),
            },
          },
          required: ["network"],
        },
      },
    ],
  };
});

// Tool implementations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "x402_get_health": {
        const response = await axios.get(`${FACILITATOR_URL}/health`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "x402_get_supported_networks": {
        const response = await axios.get(`${FACILITATOR_URL}/supported`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "x402_get_stats": {
        const response = await axios.get(`${FACILITATOR_URL}/stats`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "x402_create_payment_requirements": {
        const { network, amount, merchantWallet, resource, description, mimeType } = args;
        const networkConfig = NETWORKS[network];

        const requirements = {
          scheme: "exact",
          network: network,
          maxAmountRequired: amount,
          payTo: merchantWallet,
          asset: networkConfig.usdcAddress,
          resource: resource,
          description: description,
          mimeType: mimeType || "application/json",
          maxTimeoutSeconds: 300,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(requirements, null, 2),
            },
          ],
        };
      }

      case "x402_create_evm_payment": {
        const { network, privateKey, paymentRequirements } = args;
        const networkConfig = NETWORKS[network];
        const wallet = new ethers.Wallet(privateKey);

        const domain = {
          name: "USD Coin",
          version: "2",
          chainId: networkConfig.chainId,
          verifyingContract: paymentRequirements.asset,
        };

        const types = {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        };

        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600;
        const nonce = ethers.hexlify(ethers.randomBytes(32));

        const value = {
          from: wallet.address,
          to: paymentRequirements.payTo,
          value: paymentRequirements.maxAmountRequired,
          validAfter,
          validBefore,
          nonce,
        };

        const signature = await wallet.signTypedData(domain, types, value);

        const paymentPayload = {
          x402Version: 1,
          scheme: "exact",
          network: network,
          payload: {
            authorization: {
              from: wallet.address,
              to: paymentRequirements.payTo,
              value: paymentRequirements.maxAmountRequired,
              validAfter: validAfter.toString(),
              validBefore: validBefore.toString(),
              nonce: nonce,
            },
            signature: signature,
          },
        };

        const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  paymentHeader: base64Payment,
                  decodedPayload: paymentPayload,
                  consumerAddress: wallet.address,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "x402_create_solana_payment": {
        const { network, privateKey, paymentRequirements } = args;
        const networkConfig = NETWORKS[network];
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        const connection = new Connection(networkConfig.rpcUrl, "confirmed");

        const fromPubkey = keypair.publicKey;
        const toPubkey = new PublicKey(paymentRequirements.payTo);
        const mintPubkey = new PublicKey(paymentRequirements.asset);
        const amount = BigInt(paymentRequirements.maxAmountRequired);

        const fromTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          fromPubkey
        );
        const toTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          toPubkey
        );

        const transferInstruction = createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          amount
        );

        const { blockhash } = await connection.getLatestBlockhash("finalized");

        const messageV0 = new TransactionMessage({
          payerKey: fromPubkey,
          recentBlockhash: blockhash,
          instructions: [transferInstruction],
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([keypair]);

        const serializedTx = transaction.serialize();
        const base64Tx = Buffer.from(serializedTx).toString("base64");

        const paymentPayload = {
          x402Version: 1,
          scheme: "exact",
          network: network,
          payload: {
            transaction: base64Tx,
          },
        };

        const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  paymentHeader: base64Payment,
                  decodedPayload: paymentPayload,
                  consumerAddress: fromPubkey.toString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "x402_verify_payment": {
        const { paymentPayload, paymentRequirements } = args;

        const response = await axios.post(
          `${FACILITATOR_URL}/verify`,
          { paymentPayload, paymentRequirements },
          { headers: { "Content-Type": "application/json" } }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "x402_settle_payment": {
        const { paymentPayload, paymentRequirements } = args;

        const response = await axios.post(
          `${FACILITATOR_URL}/settle`,
          { paymentPayload, paymentRequirements },
          { headers: { "Content-Type": "application/json" } }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "x402_decode_payment_header": {
        const { paymentHeader } = args;
        const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
        const paymentPayload = JSON.parse(decoded);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(paymentPayload, null, 2),
            },
          ],
        };
      }

      case "x402_generate_merchant_middleware": {
        const { network, language } = args;
        const networkConfig = NETWORKS[network];
        const isTypescript = language === "typescript" || !language;

        const code = `${isTypescript ? "import" : "const"} express ${isTypescript ? "from" : "= require"} ${isTypescript ? "'express';" : "('express');"}
${isTypescript ? "import" : "const"} axios ${isTypescript ? "from" : "= require"} ${isTypescript ? "'axios';" : "('axios');"}

const FACILITATOR_URL = '${FACILITATOR_URL}';
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS;
const NETWORK = '${network}';
const USDC_ADDRESS = '${networkConfig.usdcAddress}';

async function checkPayment(req${isTypescript ? ": any" : ""}, res${isTypescript ? ": any" : ""}, next${isTypescript ? ": any" : ""}) {
  const paymentHeader = req.headers['x-payment'];
  
  const paymentRequirements = {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: '10000', // $0.01 USDC (6 decimals)
    payTo: MERCHANT_WALLET,
    asset: USDC_ADDRESS,
    resource: \`\${req.protocol}://\${req.get('host')}\${req.originalUrl}\`,
    description: 'Premium content access',
    mimeType: 'application/json',
    maxTimeoutSeconds: 300
  };
  
  if (!paymentHeader) {
    return res.status(402).json(paymentRequirements);
  }
  
  try {
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const paymentPayload = JSON.parse(decoded);
    
    // Step 1: Verify
    const verifyResponse = await axios.post(
      \`\${FACILITATOR_URL}/verify\`,
      { paymentPayload, paymentRequirements },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const verifyData = verifyResponse.data.success 
      ? verifyResponse.data.data 
      : verifyResponse.data;
    
    if (!verifyData.isValid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        reason: verifyData.invalidReason
      });
    }
    
    // Step 2: Settle
    const settleResponse = await axios.post(
      \`\${FACILITATOR_URL}/settle\`,
      { paymentPayload, paymentRequirements },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const settleData = settleResponse.data.success
      ? settleResponse.data.data
      : settleResponse.data;
    
    if (!settleData.success) {
      return res.status(402).json({
        error: 'Payment settlement failed'
      });
    }
    
    console.log('✅ Payment settled:', settleData.transaction || settleData.signature);
    next();
    
  } catch (error${isTypescript ? ": any" : ""}) {
    return res.status(500).json({
      error: 'Payment processing failed',
      message: error.message
    });
  }
}

${isTypescript ? "export" : "module.exports ="} { checkPayment };`;

        return {
          content: [
            {
              type: "text",
              text: code,
            },
          ],
        };
      }

      case "x402_generate_consumer_code": {
        const { network, language } = args;
        const networkConfig = NETWORKS[network];
        const isTypescript = language === "typescript" || !language;
        const isEVM = networkConfig.type === "evm";

        let code;
        if (isEVM) {
          code = `${isTypescript ? "import" : "const"} axios ${isTypescript ? "from" : "= require"} ${isTypescript ? "'axios';" : "('axios');"}
${isTypescript ? "import" : "const { ethers } = require"} ${isTypescript ? "{ ethers } from 'ethers';" : "('ethers');"}

const CONSUMER_PRIVATE_KEY = process.env.CONSUMER_PRIVATE_KEY;
const MERCHANT_URL = process.env.MERCHANT_URL;
const NETWORK = '${network}';
const CHAIN_ID = ${networkConfig.chainId};

const wallet = new ethers.Wallet(CONSUMER_PRIVATE_KEY);

async function createPayment(requirements${isTypescript ? ": any" : ""})${isTypescript ? ": Promise<string>" : ""} {
  const domain = {
    name: 'USD Coin',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: requirements.asset,
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const value = {
    from: wallet.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await wallet.signTypedData(domain, types, value);

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: NETWORK,
    payload: {
      authorization: {
        from: wallet.address,
        to: requirements.payTo,
        value: requirements.maxAmountRequired,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
      signature: signature
    }
  };

  return Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
}

async function fetchWithPayment(url${isTypescript ? ": string" : ""}) {
  let response = await axios.get(url, {
    validateStatus: () => true
  });

  if (response.status === 402) {
    const requirements = response.data;
    const paymentHeader = await createPayment(requirements);
    
    response = await axios.get(url, {
      headers: { 'X-PAYMENT': paymentHeader },
      validateStatus: () => true
    });
  }

  return response.data;
}

${isTypescript ? "export" : "module.exports ="} { fetchWithPayment };`;
        } else {
          code = `${isTypescript ? "import" : "const"} axios ${isTypescript ? "from" : "= require"} ${isTypescript ? "'axios';" : "('axios');"}
${isTypescript ? "import { Keypair, PublicKey, Connection, TransactionMessage, VersionedTransaction } from '@solana/web3.js';" : "const { Keypair, PublicKey, Connection, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');"}
${isTypescript ? "import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';" : "const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');"}
${isTypescript ? "import bs58 from 'bs58';" : "const bs58 = require('bs58');"}

const CONSUMER_PRIVATE_KEY_BS58 = process.env.CONSUMER_PRIVATE_KEY_BS58;
const MERCHANT_URL = process.env.MERCHANT_URL;
const NETWORK = '${network}';
const RPC_URL = '${networkConfig.rpcUrl}';

const keypair = Keypair.fromSecretKey(bs58.decode(CONSUMER_PRIVATE_KEY_BS58));
const connection = new Connection(RPC_URL, 'confirmed');

async function createPayment(requirements${isTypescript ? ": any" : ""})${isTypescript ? ": Promise<string>" : ""} {
  const fromPubkey = keypair.publicKey;
  const toPubkey = new PublicKey(requirements.payTo);
  const mintPubkey = new PublicKey(requirements.asset);
  const amount = BigInt(requirements.maxAmountRequired);
  
  const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
  const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, toPubkey);
  
  const transferInstruction = createTransferInstruction(
    fromTokenAccount,
    toTokenAccount,
    fromPubkey,
    amount
  );
  
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  
  const messageV0 = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: blockhash,
    instructions: [transferInstruction],
  }).compileToV0Message();
  
  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([keypair]);
  
  const serializedTx = transaction.serialize();
  const base64Tx = Buffer.from(serializedTx).toString('base64');
  
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: NETWORK,
    payload: {
      transaction: base64Tx
    }
  };
  
  return Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
}

async function fetchWithPayment(url${isTypescript ? ": string" : ""}) {
  let response = await axios.get(url, {
    validateStatus: () => true
  });
  
  if (response.status === 402) {
    const requirements = response.data;
    const paymentHeader = await createPayment(requirements);
    
    response = await axios.get(url, {
      headers: { 'X-PAYMENT': paymentHeader },
      validateStatus: () => true
    });
  }
  
  return response.data;
}

${isTypescript ? "export" : "module.exports ="} { fetchWithPayment };`;
        }

        return {
          content: [
            {
              type: "text",
              text: code,
            },
          ],
        };
      }

      case "x402_calculate_total_cost": {
        const { network, amount } = args;
        const networkConfig = NETWORKS[network];
        const amountUSDC = parseFloat(amount) / 1000000;

        let gasFee, totalCost, whoPays;
        if (networkConfig.type === "evm") {
          if (network === "avalanche" || network === "avalanche-fuji") {
            gasFee = 0.01;
          } else {
            gasFee = 0.001;
          }
          whoPays = "Facilitator pays gas";
          totalCost = amountUSDC;
        } else {
          gasFee = 0.000005;
          whoPays = "Consumer pays transaction fee";
          totalCost = amountUSDC + gasFee;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  network: networkConfig.name,
                  paymentAmount: `$${amountUSDC.toFixed(6)} USDC`,
                  networkFee: `$${gasFee.toFixed(6)}`,
                  totalCostToConsumer: `$${totalCost.toFixed(6)}`,
                  whoPays: whoPays,
                  settlementTime:
                    networkConfig.type === "evm" ? "~2 seconds" : "~400ms",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "x402_get_network_info": {
        const { network } = args;
        const networkConfig = NETWORKS[network];

        const info = {
          network: network,
          name: networkConfig.name,
          type: networkConfig.type === "evm" ? "EVM" : "SVM",
          usdcAddress: networkConfig.usdcAddress,
          chainId: networkConfig.chainId || "N/A",
          rpcUrl: networkConfig.rpcUrl || "Default provider",
          feeStructure:
            networkConfig.type === "evm"
              ? "Facilitator pays gas (~$0.001-0.01)"
              : "Consumer pays transaction fee (~$0.000005)",
          settlementTime:
            networkConfig.type === "evm" ? "~2 seconds" : "~400ms",
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              stack: error.stack,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Octo x402 MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});