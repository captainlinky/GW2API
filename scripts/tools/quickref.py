#!/usr/bin/env python3
"""
Quick reference guide for the GW2 API tool.
"""

from colorama import Fore, Style, init

init(autoreset=True)

def print_section(title):
    print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}{Style.RESET_ALL}\n")

def print_command(cmd, description):
    print(f"  {Fore.GREEN}{cmd:<35}{Style.RESET_ALL} {description}")

def main():
    print(f"{Fore.MAGENTA}{Style.BRIGHT}")
    print("╔════════════════════════════════════════════════════════════╗")
    print("║        Guild Wars 2 API Tool - Quick Reference            ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print(f"{Style.RESET_ALL}")
    
    print_section("Account & Character Commands")
    print_command("python cli.py account", "View account information")
    print_command("python cli.py account -f summary", "Account info (formatted)")
    print_command("python cli.py characters", "List all characters")
    print_command("python cli.py character 'Name'", "View specific character")
    print_command("python cli.py wallet -f table", "View wallet as table")
    print_command("python cli.py bank", "View bank contents")
    print_command("python cli.py materials -f compact", "Material storage (compact)")
    
    print_section("Trading Post Commands")
    print_command("python cli.py tp-prices 19721", "Get TP price for item")
    print_command("python cli.py tp-prices 19721,24277", "Multiple items")
    print_command("python cli.py items 19721 -f table", "Get item details")
    
    print_section("Game Data Commands")
    print_command("python cli.py worlds -f compact", "List all worlds")
    print_command("python cli.py currencies -f table", "List all currencies")
    print_command("python cli.py achievements", "Your achievements")
    
    print_section("PvP & WvW Commands")
    print_command("python cli.py pvp-stats", "PvP statistics")
    print_command("python cli.py pvp-games", "Recent PvP matches")
    print_command("python cli.py wvw-matches", "Current WvW matchups")
    
    print_section("Generic Endpoint Access")
    print_command("python cli.py endpoint dailycrafting", "Daily craftables")
    print_command("python cli.py endpoint achievements/daily", "Daily achievements")
    print_command("python cli.py endpoint build", "Current game build")
    
    print_section("Display Format Options")
    print(f"  Add {Fore.YELLOW}-f <format>{Style.RESET_ALL} to any command:")
    print(f"    {Fore.YELLOW}json{Style.RESET_ALL}     - Pretty JSON (default)")
    print(f"    {Fore.YELLOW}table{Style.RESET_ALL}    - Grid table view")
    print(f"    {Fore.YELLOW}summary{Style.RESET_ALL}  - Key-value pairs")
    print(f"    {Fore.YELLOW}compact{Style.RESET_ALL}  - Condensed list")
    
    print_section("Common Item IDs")
    print("  19721 - Glob of Ectoplasm")
    print("  24277 - Mystic Coin")
    print("  19976 - Vial of Powerful Blood (T6)")
    print("  24295 - Amalgamated Gemstone")
    print("  46731 - Piece of Unid Gear (Rare)")
    print("  46732 - Piece of Unid Gear (Masterwork)")
    
    print_section("Interactive Examples")
    print_command("python examples.py", "Run interactive examples")
    
    print_section("Python API Usage")
    print(f"  {Fore.YELLOW}from gw2api import GW2API, GW2Viewer{Style.RESET_ALL}")
    print(f"  {Fore.YELLOW}client = GW2API(){Style.RESET_ALL}")
    print(f"  {Fore.YELLOW}data = client.get_account(){Style.RESET_ALL}")
    print(f"  {Fore.YELLOW}GW2Viewer.display(data, 'summary'){Style.RESET_ALL}")
    
    print_section("Useful Endpoints")
    print("  account/bank              - Bank contents")
    print("  account/materials         - Material storage")
    print("  account/dyes              - Unlocked dyes")
    print("  account/skins             - Unlocked skins")
    print("  account/minis             - Unlocked miniatures")
    print("  account/titles            - Unlocked titles")
    print("  achievements/daily        - Daily achievements")
    print("  achievements/daily/tomorrow - Tomorrow's dailies")
    print("  commerce/prices           - Trading post prices")
    print("  dailycrafting             - Daily craftable items")
    print("  mapchests                 - Daily map chests")
    print("  worldbosses               - World boss info")
    
    print(f"\n{Fore.GREEN}For more help, see README.md{Style.RESET_ALL}\n")

if __name__ == '__main__':
    main()
