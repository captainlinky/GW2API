#!/usr/bin/env python3
"""
Interactive examples for using the GW2 API client.
"""

from gw2api import GW2API, GW2Viewer
from colorama import Fore, Style


def example_account_info():
    """Display basic account information."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Account Information ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    account = client.get_account()
    
    # Display as a summary
    GW2Viewer.display(account, 'summary', title="Your Account")


def example_wallet():
    """Display account wallet with currency names."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Account Wallet ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get wallet data
    wallet = client.get_account_wallet()
    
    # Get currency information
    all_currencies = client.get_currencies()
    currency_map = {c['id']: c['name'] for c in all_currencies}
    
    # Enrich wallet data with currency names
    enriched_wallet = []
    for item in wallet:
        enriched_wallet.append({
            'Currency': currency_map.get(item['id'], f"ID:{item['id']}"),
            'Amount': f"{item['value']:,}"
        })
    
    # Display as a table
    GW2Viewer.display(enriched_wallet, 'table')


def example_characters():
    """Display character information."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Characters ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get character names
    characters = client.get_characters()
    
    # Get detailed info for each character
    char_details = []
    for name in characters[:5]:  # Limit to first 5 to avoid too many requests
        try:
            char = client.get_character(name)
            char_details.append({
                'Name': char['name'],
                'Race': char['race'],
                'Profession': char['profession'],
                'Level': char['level'],
                'Gender': char['gender'],
                'Age': f"{char['age'] // 3600}h"
            })
        except Exception as e:
            print(f"{Fore.YELLOW}Could not fetch {name}: {e}{Style.RESET_ALL}")
    
    # Display as a table
    GW2Viewer.display(char_details, 'table')


def example_bank_items():
    """Display bank items."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Bank Items ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get bank data
    bank = client.get_account_bank()
    
    # Filter out empty slots
    items_in_bank = [item for item in bank if item is not None]
    
    # Get first 10 items
    sample_items = []
    for item in items_in_bank[:10]:
        sample_items.append({
            'Item ID': item['id'],
            'Count': item['count'],
            'Binding': item.get('binding', 'None'),
            'Charges': item.get('charges', 'N/A')
        })
    
    print(f"Total items in bank: {len(items_in_bank)}")
    print(f"Showing first 10:\n")
    GW2Viewer.display(sample_items, 'table')


def example_materials():
    """Display material storage."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Material Storage ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get materials
    materials = client.get_account_materials()
    
    # Filter materials with count > 0 and sort by count
    non_zero_materials = [m for m in materials if m.get('count', 0) > 0]
    non_zero_materials.sort(key=lambda x: x['count'], reverse=True)
    
    # Display top 20
    top_materials = []
    for mat in non_zero_materials[:20]:
        top_materials.append({
            'Item ID': mat['id'],
            'Count': mat['count'],
            'Category': mat.get('category', 'Unknown')
        })
    
    print(f"Total material types stored: {len(non_zero_materials)}")
    print(f"Top 20 by count:\n")
    GW2Viewer.display(top_materials, 'table')


def example_trading_post():
    """Display trading post prices for common items."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Trading Post Prices ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Example item IDs (common items)
    # 19721 = Glob of Ectoplasm
    # 24277 = Mystic Coin
    # 19976 = T6 Blood
    item_ids = [19721, 24277, 19976]
    
    try:
        prices = client.get_tp_prices(item_ids)
        
        # Get item names
        items = client.get_items(item_ids)
        item_names = {item['id']: item['name'] for item in items}
        
        # Format prices
        price_data = []
        for price in prices:
            item_id = price['id']
            price_data.append({
                'Item': item_names.get(item_id, f"ID:{item_id}"),
                'Buy Price': f"{price['buys']['unit_price']:,} copper" if price['buys']['unit_price'] > 0 else 'N/A',
                'Sell Price': f"{price['sells']['unit_price']:,} copper" if price['sells']['unit_price'] > 0 else 'N/A',
                'Buy Orders': price['buys']['quantity'],
                'Sell Orders': price['sells']['quantity']
            })
        
        GW2Viewer.display(price_data, 'table')
    except Exception as e:
        print(f"{Fore.RED}Error fetching prices: {e}{Style.RESET_ALL}")


def example_achievements():
    """Display achievement progress."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Achievement Progress ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get account achievements
    achievements = client.get_account_achievements()
    
    # Get some completed achievements
    completed = [a for a in achievements if a.get('done', False)]
    
    print(f"Total achievements tracked: {len(achievements)}")
    print(f"Completed: {len(completed)}")
    print(f"In progress: {len(achievements) - len(completed)}")
    
    # Show some in-progress achievements with the most progress
    in_progress = [a for a in achievements if not a.get('done', False) and 'current' in a and 'max' in a]
    in_progress.sort(key=lambda x: (x.get('current', 0) / x.get('max', 1)) if x.get('max', 1) > 0 else 0, reverse=True)
    
    if in_progress[:10]:
        print(f"\n{Fore.GREEN}Top 10 achievements by progress:{Style.RESET_ALL}\n")
        progress_data = []
        for ach in in_progress[:10]:
            progress_pct = (ach.get('current', 0) / ach.get('max', 1) * 100) if ach.get('max', 1) > 0 else 0
            progress_data.append({
                'Achievement ID': ach['id'],
                'Progress': f"{ach.get('current', 0)}/{ach.get('max', 0)}",
                'Percent': f"{progress_pct:.1f}%"
            })
        
        GW2Viewer.display(progress_data, 'table')


def example_custom_endpoint():
    """Example of querying a custom endpoint."""
    print(f"\n{Fore.CYAN}{Style.BRIGHT}=== Custom Endpoint Query ==={Style.RESET_ALL}\n")
    
    client = GW2API()
    
    # Get daily achievements
    daily = client.get('achievements/daily')
    
    print("Daily PvE Achievements:")
    GW2Viewer.display(daily.get('pve', []), 'compact')
    
    print("\nDaily PvP Achievements:")
    GW2Viewer.display(daily.get('pvp', []), 'compact')


def main():
    """Run all examples."""
    print(f"{Fore.MAGENTA}{Style.BRIGHT}")
    print("=" * 60)
    print("  Guild Wars 2 API Client - Examples")
    print("=" * 60)
    print(f"{Style.RESET_ALL}")
    
    examples = [
        ("Account Information", example_account_info),
        ("Wallet", example_wallet),
        ("Characters", example_characters),
        ("Bank Items", example_bank_items),
        ("Material Storage", example_materials),
        ("Trading Post Prices", example_trading_post),
        ("Achievement Progress", example_achievements),
        ("Custom Endpoint", example_custom_endpoint),
    ]
    
    print("\nAvailable examples:")
    for i, (name, _) in enumerate(examples, 1):
        print(f"  {i}. {name}")
    
    print(f"\n{Fore.YELLOW}Note: Some examples require a valid API key in your .env file{Style.RESET_ALL}")
    
    choice = input(f"\nEnter example number (1-{len(examples)}) or 'all' to run all: ").strip()
    
    if choice.lower() == 'all':
        for name, func in examples:
            try:
                func()
            except Exception as e:
                print(f"{Fore.RED}Error in {name}: {str(e)}{Style.RESET_ALL}")
    elif choice.isdigit() and 1 <= int(choice) <= len(examples):
        name, func = examples[int(choice) - 1]
        try:
            func()
        except Exception as e:
            print(f"{Fore.RED}Error: {str(e)}{Style.RESET_ALL}")
    else:
        print(f"{Fore.RED}Invalid choice{Style.RESET_ALL}")


if __name__ == '__main__':
    main()
