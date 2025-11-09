# Quick Start Guide

## Your GW2 API Tool is Ready! 🎮

Your API key is already configured and working!

## 🌟 Two Ways to Use This Tool

### 1. Web Interface (Recommended for Beginners)

The easiest way - just click buttons in your browser!

```bash
./start_ui.sh
```

Then open http://localhost:5555 in your browser.

**Web UI Features:**
- ✅ Beautiful dashboard
- ✅ Click buttons instead of typing commands
- ✅ Easy API key management (change it in Settings)
- ✅ View account, characters, trading post
- ✅ Custom queries with a form
- ✅ No coding required!

See [WEB_UI_GUIDE.md](WEB_UI_GUIDE.md) for full details.

### 2. Command Line Interface

For advanced users and scripting:

## Test It Now

Try these commands:

```bash
# View your account
python cli.py account -f summary

# See the game build
python cli.py endpoint build

# Check trading post prices
python cli.py tp-prices 19721

# View all commands
python quickref.py

# Run tests
python test.py

# Try demos
python demo.py
```

## What Works Right Now

✅ **Public Endpoints** (no special permissions needed):
- Game build info
- Item details
- Trading post prices
- World/server list
- Currency list
- And much more!

✅ **Your Account** (with current permissions):
- Basic account info
- Account age, world, guilds
- Access/expansion info

## What Needs More Permissions

If you want to access these features, visit https://account.arena.net/applications and enable permissions:

⚠️ **Requires "wallet" permission**:
- Account wallet/currencies
- Gold balance

⚠️ **Requires "characters" permission**:
- Character list
- Character details
- Character inventory

⚠️ **Requires "inventories" permission**:
- Bank contents
- Material storage

⚠️ **Requires "unlocks" permission**:
- Unlocked skins
- Unlocked dyes
- Unlocked miniatures

⚠️ **Requires "progression" permission**:
- Achievement progress
- Mastery progress

## Quick Examples

### 1. Check Current TP Prices
```bash
python cli.py tp-prices 19721,24277,19976 -f table
```

### 2. View Account Summary
```bash
python cli.py account -f summary
```

### 3. Get Item Info
```bash
python cli.py items 19721 -f json
```

### 4. Python Script
```python
from gw2api import GW2API, GW2Viewer

client = GW2API()

# Get your account
account = client.get_account()
print(f"Account: {account['name']}")
print(f"Age: {account['age'] // 86400} days")

# Check prices
prices = client.get_tp_prices([19721])
print(f"Ectoplasm: {prices[0]['buys']['unit_price']} copper")
```

## File Overview

- `gw2api.py` - Main API client library
- `cli.py` - Command-line interface
- `examples.py` - Interactive examples
- `demo.py` - Demonstrations
- `test.py` - Test suite
- `quickref.py` - Quick reference guide
- `.env` - Your API key (already configured!)

## Getting More Permissions

1. Go to https://account.arena.net/applications
2. Find your API key: `5060AA89-D5EA-0A43-A9B5-AEDA2FB73560C2D88771-2AFC-479F-921A-81370396120D`
3. Click to edit permissions
4. Enable any of these you want:
   - ✅ account (already enabled)
   - ⬜ builds
   - ⬜ characters
   - ⬜ guilds
   - ⬜ inventories
   - ⬜ progression
   - ⬜ pvp
   - ⬜ tradingpost
   - ⬜ unlocks
   - ⬜ wallet

## Common Item IDs for Testing

- 19721 - Glob of Ectoplasm
- 24277 - Pile of Crystalline Dust
- 19976 - Vial of Powerful Blood (T6)
- 24295 - Amalgamated Gemstone

## Support & Documentation

- Full API docs: https://wiki.guildwars2.com/wiki/API:Main
- See README.md for detailed documentation
- Run `python quickref.py` for command reference

## Have Fun! 🎉

Start exploring with:
```bash
python test.py    # See what works
python demo.py    # Try the demos
python quickref.py # See all commands
```
