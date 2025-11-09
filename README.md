# Guild Wars 2 API Tool

A comprehensive Python tool for querying the Guild Wars 2 API with multiple viewing options and a beautiful web interface featuring real-time WvW tracking!

## 🎉 Web Dashboard with WvW Tracking

### Features
- 🌐 **Web Interface** - Beautiful dashboard for account, trading post, and WvW data
- 📊 **Interactive Charts** - Historical K/D ratio and objective capture tracking
- 🏰 **Guild Tracking** - Automatic discovery of guilds claiming WvW objectives  
- 📈 **Trend Analysis** - 7 days of historical data with 15-minute snapshots
- ⚡ **Real-time Updates** - Auto-refreshing data every 30 seconds
- 🎨 **Team Visualization** - Color-coded charts for Red/Green/Blue teams

### Quick Start
```bash
./start_ui.sh
# or
python app.py
```

Then open your browser to **http://localhost:5555**

### Documentation
- **[WVW_DASHBOARD.md](WVW_DASHBOARD.md)** - Complete WvW dashboard guide
- **[WEB_UI_GUIDE.md](WEB_UI_GUIDE.md)** - General web interface guide
- **[WVW_GUIDE.md](WVW_GUIDE.md)** - WvW API reference

## Features

- 🔐 **Secure Authentication**: Uses API keys stored in `.env` file
- 📊 **Multiple Display Formats**: View data as JSON, tables, summaries, or compact lists
- 🎨 **Colored Output**: Easy-to-read colored terminal output
- 🔧 **CLI Interface**: Command-line tool for quick queries
- 📚 **Rich API Coverage**: Access to account, characters, trading post, PvP, WvW, and more
- 🎯 **Easy to Use**: Simple Python API and interactive examples

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up your API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your API key
   ```

## Getting Your API Key

1. Visit https://account.arena.net/applications
2. Create a new key with the permissions you need
3. Copy the key to your `.env` file

**Note**: Your read-only API key is already configured in `.env`

## Quick Start

### Using the CLI

```bash
# View account information
python cli.py account

# View characters
python cli.py characters

# View wallet as a table
python cli.py wallet -f table

# View bank contents
python cli.py bank

# View material storage (compact format)
python cli.py materials -f compact

# Get item details
python cli.py items 19721,24277 -f table

# Get trading post prices
python cli.py tp-prices 19721

# Query any endpoint
python cli.py endpoint achievements/daily
```

### Using the Python API

```python
from gw2api import GW2API, GW2Viewer

# Create a client
client = GW2API()

# Get account info
account = client.get_account()
GW2Viewer.display(account, 'summary')

# Get characters
characters = client.get_characters()
print(characters)

# Get wallet
wallet = client.get_account_wallet()
GW2Viewer.display(wallet, 'table')

# Get trading post prices
prices = client.get_tp_prices([19721, 24277])
GW2Viewer.display(prices, 'json')

# Query any endpoint
data = client.get('achievements/daily')
GW2Viewer.display(data, 'compact')
```

### Running Examples

```bash
python examples.py
```

This will show an interactive menu with various examples including:
- Account Information
- Wallet display with currency names
- Character details
- Bank items
- Material storage
- Trading post prices
- Achievement progress
- Custom endpoint queries

## Display Formats

The tool supports four different display formats:

### 1. JSON (Default)
Pretty-printed JSON output, great for debugging and full data inspection.
```bash
python cli.py account -f json
```

### 2. Table
Data displayed in a grid table, perfect for lists and structured data.
```bash
python cli.py wallet -f table
```

### 3. Summary
Key-value pairs with colored output, ideal for single objects.
```bash
python cli.py account -f summary
```

### 4. Compact
Condensed, readable format for quick overviews.
```bash
python cli.py characters -f compact
```

## Available Commands

### Account Commands
- `account` - Basic account information
- `wallet` - Account currencies
- `bank` - Bank contents
- `materials` - Material storage
- `achievements` - Achievement progress

### Character Commands
- `characters` - List all characters
- `character <name>` - Detailed character info

### Trading Post Commands
- `tp-prices <item_ids>` - Get item prices
- `items <item_ids>` - Get item details

### Game Data Commands
- `worlds` - List all worlds/servers
- `currencies` - List all currencies

### PvP Commands
- `pvp-stats` - PvP statistics
- `pvp-games` - Recent PvP matches

### WvW Commands
- `wvw-matches` - Current WvW matches

### Generic Commands
- `endpoint <path>` - Query any API endpoint

## API Client Methods

The `GW2API` class provides methods for common endpoints:

### Account Methods
- `get_account()` - Basic account info
- `get_account_achievements()` - Achievement progress
- `get_account_bank()` - Bank contents
- `get_account_materials()` - Material storage
- `get_account_wallet()` - Wallet/currencies
- `get_characters()` - Character list
- `get_character(name)` - Character details

### Game Data Methods
- `get_items(item_ids)` - Item information
- `get_recipes(recipe_ids)` - Recipe information
- `get_achievements(achievement_ids)` - Achievement info
- `get_skins(skin_ids)` - Skin information
- `get_worlds()` - World/server list
- `get_currencies()` - Currency list

### Trading Post Methods
- `get_tp_prices(item_ids)` - TP prices
- `get_tp_listings(item_ids)` - TP buy/sell orders

### PvP Methods
- `get_pvp_stats()` - PvP statistics
- `get_pvp_games()` - Recent matches

### WvW Methods
- `get_wvw_matches()` - Current matches

### Generic Method
- `get(endpoint, params)` - Query any endpoint

## Common Item IDs

Here are some commonly used item IDs for trading post queries:

- `19721` - Glob of Ectoplasm
- `24277` - Mystic Coin
- `19976` - Vial of Powerful Blood (T6)
- `24295` - Amalgamated Gemstone
- `46731` - Piece of Unidentified Gear (Rare)
- `46732` - Piece of Unidentified Gear (Masterwork)

## API Reference

Full Guild Wars 2 API documentation: https://wiki.guildwars2.com/wiki/API:Main

## Examples

### Example 1: Check Your Gold
```python
from gw2api import GW2API

client = GW2API()
wallet = client.get_account_wallet()

for currency in wallet:
    if currency['id'] == 1:  # Gold
        gold = currency['value'] / 10000
        print(f"You have {gold:,.2f} gold")
```

### Example 2: Find Your Richest Character
```python
from gw2api import GW2API

client = GW2API()
characters = client.get_characters()

richest = None
max_gold = 0

for char_name in characters:
    char = client.get_character(char_name)
    gold = char.get('bags', [])  # This would need more parsing
    
    # Character age in hours
    age_hours = char['age'] / 3600
    print(f"{char_name}: Level {char['level']}, {age_hours:.1f} hours played")
```

### Example 3: Monitor Trading Post
```python
from gw2api import GW2API, GW2Viewer

client = GW2API()

# Monitor specific items
items_to_watch = [19721, 24277, 19976]  # Ecto, Mystic Coin, T6 Blood

prices = client.get_tp_prices(items_to_watch)
items = client.get_items(items_to_watch)

item_map = {i['id']: i['name'] for i in items}

for price in prices:
    name = item_map[price['id']]
    buy = price['buys']['unit_price']
    sell = price['sells']['unit_price']
    spread = sell - buy
    
    print(f"{name}:")
    print(f"  Buy: {buy:,} copper")
    print(f"  Sell: {sell:,} copper")
    print(f"  Spread: {spread:,} copper")
```

## Troubleshooting

### API Key Issues
- Make sure your API key is in the `.env` file
- Check that you have the correct permissions enabled
- Some endpoints require specific permissions (account, characters, tradingpost, etc.)

### Rate Limiting
The GW2 API has rate limits. If you get errors:
- Add delays between requests
- Use the bulk endpoints when possible (pass multiple IDs at once)

### Authentication Errors
If you get 401/403 errors:
- Verify your API key is valid
- Check that your key has the required permissions for that endpoint
- Some endpoints require account, progression, or unlocks permissions

## License

This tool is for personal use with the Guild Wars 2 API. Please review ArenaNet's API Terms of Use:
https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/

## Contributing

Feel free to enhance this tool! Some ideas:
- Add more specialized viewers (gear builds, achievement tracking, etc.)
- Create a web interface
- Add caching to reduce API calls
- Build specific tools (price alerts, achievement tracker, etc.)

## Acknowledgments

- ArenaNet for providing the GW2 API
- Guild Wars 2 community for documentation and support
