# GW2 API Tool - Web UI Guide

## 🎉 Your Web UI is Ready!

A simple, beautiful web interface to interact with the Guild Wars 2 API without writing any code!

## Quick Start

### Starting the Web UI

**Option 1: Use the start script**
```bash
./start_ui.sh
```

**Option 2: Run directly**
```bash
python app.py
```

The web UI will be available at: **http://localhost:5555**

## Features

### 🏠 Dashboard
- Quick action buttons for common tasks
- One-click access to account info, characters, and wallet
- Preset queries for trading post prices
- Material and bank viewing

### 👤 Account Tab
- View complete account information
- Age, world, guilds, expansions
- Daily/monthly AP, fractal level, WvW rank
- Wallet viewer with all currencies formatted nicely

### 🎭 Characters Tab
- List all your characters
- Click any character to see detailed info
- Race, profession, level, age, deaths
- Guild membership

### 🎖️ WvW Tab (NEW!)
- **View all WvW matches** across all tiers
- **See your world's current matchup** (your team is highlighted!)
- **Check any world's match** by World ID
- **Team composition** - Main world + linked worlds for each team
- **Live scores** - Victory points, kills, deaths
- **Map details** - Scores and objectives for each map
- **Skirmish tracking** - Latest skirmish results
- Quick select buttons for common worlds

### 💰 Trading Post Tab
- Check prices for any items
- Preset buttons for common valuable items (Ecto, Mystic Coin, T6 Blood)
- See buy/sell prices, spreads, and quantities
- Item names and rarities displayed

### 🔍 Custom Query Tab
- Query any GW2 API endpoint directly
- Preset queries for common endpoints
- JSON parameter support
- Perfect for exploring the API

### ⚙️ Settings Tab
- **Manage your API key** - Add, update, or change your key
- Test key validity automatically
- Visual confirmation when key is saved
- Instructions for getting your API key

## Using the Interface

### Setting Up Your API Key

1. Go to the **Settings** tab
2. Enter your API key in the text field
3. Click **Save API Key**
4. You'll see a success message with your account name

**Your current key is already configured!** But you can update it anytime.

### Viewing Your Account

1. Go to **Dashboard** or **Account** tab
2. Click **Load Account**
3. See all your account details in a nice table

### Checking Trading Post Prices

1. Go to **Trading Post** tab
2. Either:
   - Click a preset button (Ecto, Mystic Coin, etc.)
   - Enter item IDs manually (comma-separated)
3. Click **Get Prices**
4. See buy/sell prices formatted as gold/silver/copper

### Viewing Characters

1. Go to **Characters** tab
2. Click **Load Characters**
3. Click any character card to see details

### Custom Queries

1. Go to **Custom Query** tab
2. Enter an endpoint (e.g., `achievements/daily`)
3. Optionally add JSON parameters
4. Click **Execute Query**
5. See the raw JSON response

## API Permissions

Different features require different API key permissions:

| Feature | Permission Required |
|---------|-------------------|
| Account Info | ✅ account |
| Characters | ⚠️ characters |
| Wallet | ⚠️ wallet |
| Bank | ⚠️ inventories |
| Materials | ⚠️ inventories |
| Trading Post Prices | ✅ None (public) |
| Item Info | ✅ None (public) |

### Enabling Permissions

1. Visit https://account.arena.net/applications
2. Find your API key
3. Click to edit permissions
4. Enable any permissions you want
5. The changes take effect immediately

## Tips & Tricks

### Common Item IDs
Keep these handy for quick price checks:
- **19721** - Glob of Ectoplasm
- **24277** - Pile of Crystalline Dust (was Mystic Coin in old data)
- **19976** - Vial of Powerful Blood (T6)
- **24295** - Amalgamated Gemstone

### Multiple Items
You can check multiple items at once:
- Enter IDs separated by commas: `19721,24277,19976`
- Use preset buttons for common combinations

### Custom Queries
Explore the API with these endpoints:
- `build` - Current game build
- `achievements/daily` - Today's dailies
- `achievements/daily/tomorrow` - Tomorrow's dailies
- `dailycrafting` - Daily craftable items
- `worlds` with `{"ids": "all"}` - All servers

### Security
- Your API key is stored in the `.env` file
- It's sent to the server but never exposed to the browser
- The masked version shown in Settings is for reference only
- Don't share your API key with others!

## Troubleshooting

### "No API Key" Warning
- Go to Settings tab
- Enter your API key and save
- The warning should disappear

### "Access Forbidden" Errors
- Your API key doesn't have the required permission
- Go to https://account.arena.net/applications
- Enable the needed permissions

### Server Won't Start
- Check if port 5555 is already in use
- Edit `app.py` and change the port number
- Or stop the conflicting application

### Changes Not Appearing
- The server auto-reloads when you change Python files
- Refresh your browser for UI changes
- Hard refresh (Ctrl+F5) if CSS/JS changes don't appear

## Technical Details

### File Structure
```
/home/reaper/GW2API/
├── app.py              # Flask web application
├── gw2api.py           # API client library
├── templates/
│   └── index.html      # Main UI template
├── static/
│   ├── style.css       # Styling
│   └── app.js          # JavaScript functionality
└── .env                # Your API key (secured)
```

### API Endpoints
The web app provides these REST endpoints:
- `GET /api/status` - Check API key status
- `GET/POST /api/key` - Manage API key
- `GET /api/account` - Get account info
- `GET /api/characters` - List characters
- `GET /api/character/<name>` - Character details
- `GET /api/wallet` - Get wallet
- `GET /api/bank` - Get bank contents
- `GET /api/materials` - Get materials
- `GET /api/tp/prices?ids=` - Trading post prices
- `GET /api/items?ids=` - Item information
- `POST /api/query` - Custom endpoint query

### Port Configuration
Default port: **5555**

To change the port, edit `app.py`:
```python
app.run(debug=True, host='0.0.0.0', port=YOUR_PORT)
```

## Advanced Usage

### Running on Network
The server binds to `0.0.0.0`, so it's accessible from other devices:
- Find your IP address: `ip addr` or `ifconfig`
- Access from another device: `http://YOUR_IP:5555`
- Make sure your firewall allows port 5555

### Production Deployment
For production use, replace Flask's development server:
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5555 app:app
```

## Support

- **GW2 API Docs**: https://wiki.guildwars2.com/wiki/API:Main
- **Get API Key**: https://account.arena.net/applications
- **Check this README**: See main README.md for CLI options

## What's Next?

Ideas for enhancement:
- [ ] Save favorite queries
- [ ] Price tracking over time
- [ ] Achievement progress tracker
- [ ] Gear/build viewer
- [ ] Notification system
- [ ] Export data to CSV/JSON

Feel free to modify and enhance the UI as you like! 🎨
