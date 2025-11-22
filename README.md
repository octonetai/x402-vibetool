# Octo x402 Vibetool

This tutorial walks you through using the Octo x402 MCP toolkit to integrate micropayments into your applications.

## Table of Contents

1. [Setup](#setup)
2. [Understanding the Protocol](#understanding-the-protocol)
3. [Merchant Integration](#merchant-integration)
4. [Consumer Integration](#consumer-integration)
5. [MCP Tool Usage](#mcp-tool-usage)
6. [Advanced Scenarios](#advanced-scenarios)
7. [Troubleshooting](#troubleshooting)

---

## Setup

### Prerequisites

- Node.js 18+ installed
- Claude Desktop or other MCP-compatible client
- Wallet with USDC on desired network
- Basic understanding of blockchain transactions

### Installation

1. **Clone or download the toolkit:**

```bash
git clone [https://github.com/octonetai/x402-vibetool.git](https://github.com/octonetai/x402-vibetool)
cd octo-x402-vibetool
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure Claude Desktop** (or your MCP client):

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "octo-x402": {
      "command": "node",
      "args": ["/absolute/path/to/octo-x402-mcp/index.js"]
    }
  }
}
```

4. **Restart Claude Desktop**

5. **Verify installation** by asking Claude:
   > "List available x402 tools"

You should see 12 tools listed.

---

## Understanding the Protocol

### How x402 Works

```
┌─────────┐                    ┌──────────┐
│Consumer │                    │ Merchant │
└────┬────┘                    └────┬─────┘
     │                              │
     │  1. GET /premium-content     │
     ├─────────────────────────────>│
     │                              │
     │  2. HTTP 402 + Requirements  │
     │<─────────────────────────────┤
     │                              │
     │  3. Create signed payment    │
     │     (using MCP tool)         │
     │                              │
     │  4. GET + X-PAYMENT header   │
     ├─────────────────────────────>│
     │                              │
     │     5. Verify signature      │
     │     (via facilitator)        │
     │                              │
     │     6. Settle on blockchain  │
     │     (via facilitator)        │
     │                              │
     │  7. HTTP 200 + Content       │
     │<─────────────────────────────┤
     │                              │
```

### Key Concepts

**Payment Requirements** - What the merchant needs:
```json
{
  "scheme": "exact",
  "network": "base",
  "maxAmountRequired": "10000",
  "payTo": "merchant_wallet_address",
  "asset": "usdc_contract_address",
  "resource": "https://api.example.com/premium",
  "description": "Premium content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 300
}
```

**Payment Payload** - What the consumer creates:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base",
  "payload": {
    "authorization": { ... },
    "signature": "0x..."
  }
}
```

---

## Merchant Integration

### Step 1: Check Facilitator Health

Ask Claude:
> "Check the x402 facilitator health"

Claude will use the `x402_get_health` tool and report the status.

### Step 2: Choose Your Network

Ask Claude:
> "Show me information about the Base network for x402"

Claude will use `x402_get_network_info` with parameter `network: "base"`.

### Step 3: Create Payment Requirements

Ask Claude:
> "Create payment requirements for $0.05 USDC on Base network. My wallet is 0xYourWalletAddress and the resource is https://myapi.com/premium"

Claude will use `x402_create_payment_requirements` and return:

```json
{
  "scheme": "exact",
  "network": "base",
  "maxAmountRequired": "50000",
  "payTo": "0xYourWalletAddress",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "resource": "https://myapi.com/premium",
  "description": "Premium content access",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 300
}
```

### Step 4: Generate Merchant Code

Ask Claude:
> "Generate TypeScript merchant middleware for Base network"

Claude will use `x402_generate_merchant_middleware` and provide complete Express.js middleware code.

### Step 5: Implement in Your App

Copy the generated code into your Express.js application:

```javascript
import express from 'express';
// ... paste generated middleware code

const app = express();

// Use the middleware
app.get('/premium', checkPayment, (req, res) => {
  res.json({ data: 'Your premium content' });
});

app.listen(3000);
```

### Step 6: Test Your Endpoint

```bash
curl http://localhost:3000/premium
```

You should receive a 402 response with payment requirements.

---

## Consumer Integration

### Step 1: Get Payment Requirements

When you hit a 402 endpoint, you'll receive payment requirements:

```bash
curl https://merchant.com/premium
```

Response (402):
```json
{
  "scheme": "exact",
  "network": "base",
  "maxAmountRequired": "50000",
  ...
}
```

### Step 2: Calculate Total Cost

Ask Claude:
> "Calculate the total cost for a payment of 50000 on Base network"

Claude will use `x402_calculate_total_cost` and show:
- Payment amount: $0.05 USDC
- Network fee: $0.001 (paid by facilitator)
- Total consumer cost: $0.05 USDC

### Step 3: Create Payment

Ask Claude:
> "Create an EVM payment for Base network with these requirements: [paste requirements]. My private key is 0xYourPrivateKey"

Claude will use `x402_create_evm_payment` and return:

```json
{
  "paymentHeader": "eyJ4NDAyVmVyc2lvbiI6MSw...",
  "decodedPayload": { ... },
  "consumerAddress": "0xYourAddress"
}
```

⚠️ **Security Note:** Never share your actual private key with Claude or any AI. Use a test key or implement this in your own code.

### Step 4: Make Payment Request

Use the payment header:

```bash
curl https://merchant.com/premium \
  -H "X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSw..."
```

Response (200):
```json
{
  "data": "Your premium content",
  "paid": true
}
```

### Step 5: Generate Consumer Code

Ask Claude:
> "Generate TypeScript consumer code for Base network"

Claude will use `x402_generate_consumer_code` and provide complete implementation.

---

## MCP Tool Usage

### Tool: x402_get_supported_networks

**When to use:** Check which networks are available

**Example prompt:**
> "What networks does x402 support?"

**What Claude does:**
```javascript
// Calls x402_get_supported_networks
// Returns list of all 12 production networks
```

---

### Tool: x402_verify_payment

**When to use:** Verify payment signature without settling (merchant-side)

**Example prompt:**
> "Verify this payment payload against these requirements: [paste both]"

**What Claude does:**
```javascript
// Calls x402_verify_payment with both objects
// Returns { isValid: true/false, invalidReason: "..." }
```

---

### Tool: x402_settle_payment

**When to use:** Complete payment on blockchain (merchant-side)

**Example prompt:**
> "Settle this payment on blockchain: [paste payload and requirements]"

**What Claude does:**
```javascript
// Calls x402_settle_payment
// Returns { success: true, transaction: "0x..." }
```

---

### Tool: x402_decode_payment_header

**When to use:** Inspect a base64-encoded payment header

**Example prompt:**
> "Decode this X-PAYMENT header: eyJ4NDAyVmVyc2lvbiI6MSw..."

**What Claude does:**
```javascript
// Calls x402_decode_payment_header
// Returns decoded JSON payload
```

---

## Advanced Scenarios

### Scenario 1: Multi-Network Support

**Goal:** Accept payments on Base, Polygon, and Solana

Ask Claude:
> "Create payment requirements for the same content on Base, Polygon, and Solana networks. Use wallet 0xYourWallet for EVM and SolanaAddress for Solana. Amount is $0.01"

Claude will create three separate requirements objects.

Then ask:
> "Generate a multi-network merchant middleware that handles all three"

---

### Scenario 2: Dynamic Pricing

**Goal:** Different prices for different endpoints

Ask Claude:
> "Create payment requirements for:
> 1. /api/basic - $0.01 on Base
> 2. /api/premium - $0.10 on Base
> 3. /api/enterprise - $1.00 on Polygon"

Claude will generate three requirement sets.

---

### Scenario 3: Testnet Testing

**Goal:** Test on Base Sepolia before mainnet

Ask Claude:
> "Get network info for base-sepolia"

Then:
> "Create payment requirements for base-sepolia testnet with amount 1000000 (1 USDC test)"

---

### Scenario 4: Fee Comparison

**Goal:** Compare costs across networks

Ask Claude:
> "Calculate and compare the total cost for a $0.10 payment on Base, Polygon, Avalanche, and Solana"

Claude will use `x402_calculate_total_cost` for each network and provide a comparison.

---

## Troubleshooting

### Issue: "Payment verification failed"

**Diagnosis:**
Ask Claude:
> "Decode this payment header and verify it against these requirements"

Claude will use `x402_decode_payment_header` then `x402_verify_payment` to diagnose.

**Common causes:**
- Insufficient amount
- Wrong network
- Expired signature
- Invalid signature

---

### Issue: "Settlement failed"

**Diagnosis:**
Ask Claude:
> "Check the facilitator health and stats"

**Common causes:**
- Network congestion
- Facilitator issues
- Insufficient USDC balance
- Invalid transaction

---

### Issue: Tool not working

**Check:**
1. MCP server is running
2. Claude Desktop restarted after config change
3. Path in config is absolute and correct

Ask Claude:
> "Are you able to access x402 tools?"

---

### Issue: Wrong network

Ask Claude:
> "What networks are currently supported?"

Then verify your network ID matches exactly (e.g., "base" not "Base").

---

## Best Practices

### Security

1. **Never share private keys** with AI assistants
2. Use environment variables for secrets
3. Test on testnet first
4. Validate all payment requirements
5. Implement rate limiting

### Development Workflow

1. Start with `x402_get_health` to check facilitator
2. Use `x402_get_network_info` to understand network details
3. Use `x402_calculate_total_cost` to estimate fees
4. Generate code with `x402_generate_*` tools
5. Test with `x402_verify_payment` before settling
6. Use `x402_decode_payment_header` for debugging

### Production

1. Use HTTPS only
2. Add monitoring/logging
3. Implement error handling
4. Set up alerting for failed payments
5. Keep facilitator URL updated

---

## Quick Reference

### Networks

| Network | ID | Type | Fee Structure |
|---------|----|----|---------------|
| Base | `base` | EVM | Facilitator pays (~$0.001) |
| Polygon | `polygon` | EVM | Facilitator pays (~$0.001) |
| Avalanche | `avalanche` | EVM | Facilitator pays (~$0.01) |
| Solana | `solana` | SVM | Consumer pays (~$0.000005) |

### USDC Decimals

- All amounts use 6 decimals
- `10000` = $0.01 USDC
- `100000` = $0.10 USDC
- `1000000` = $1.00 USDC

### Tool Categories

**Facilitator:** health, supported_networks, stats  
**Merchant:** create_payment_requirements, verify_payment, settle_payment, generate_merchant_middleware  
**Consumer:** create_evm_payment, create_solana_payment, generate_consumer_code  
**Utility:** decode_payment_header, calculate_total_cost, get_network_info

---

## Next Steps

1. ✅ Complete this tutorial
2. ✅ Test on testnet (base-sepolia, polygon-amoy, solana-devnet)
3. ✅ Implement in your application
4. ✅ Test end-to-end with real payments
5. ✅ Deploy to production
6. ✅ Monitor and optimize

---

## Support

- **Documentation:** https://docs.octonet.ai
- **Facilitator:** https://facilitator.octox402.xyz
- **Check health:** Use `x402_get_health` tool
- **Network status:** Use `x402_get_supported_networks` tool

---

**Happy Building! 🚀**
