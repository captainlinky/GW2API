#!/usr/bin/env python3
"""
Command-line interface for querying the Guild Wars 2 API.
"""

import sys
import argparse
import requests
from gw2api import GW2API, GW2Viewer
from colorama import Fore, Style


def main():
    parser = argparse.ArgumentParser(
        description='Query the Guild Wars 2 API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # View account information
  python cli.py account
  
  # View characters
  python cli.py characters
  
  # View specific character
  python cli.py character "Character Name"
  
  # View wallet with table format
  python cli.py wallet -f table
  
  # View bank contents
  python cli.py bank
  
  # View material storage
  python cli.py materials -f compact
  
  # Query any endpoint
  python cli.py endpoint dailycrafting
  
  # Get item details
  python cli.py items 12345,67890 -f table
        """
    )
    
    parser.add_argument('command', help='Command to execute (account, characters, wallet, bank, materials, etc.)')
    parser.add_argument('args', nargs='*', help='Additional arguments for the command')
    parser.add_argument('-f', '--format', choices=['json', 'table', 'summary', 'compact'],
                        default='json', help='Output format (default: json)')
    parser.add_argument('-k', '--api-key', help='GW2 API key (overrides .env file)')
    
    args = parser.parse_args()
    
    try:
        # Create API client
        client = GW2API(api_key=args.api_key)
        
        # Execute command
        command = args.command.lower()
        data = None
        
        if command == 'account':
            data = client.get_account()
            
        elif command == 'characters':
            if args.args:
                # Get specific character
                data = client.get_character(args.args[0])
            else:
                # List all characters
                data = client.get_characters()
                
        elif command == 'character':
            if not args.args:
                print(f"{Fore.RED}Error: Character name required{Style.RESET_ALL}")
                return 1
            data = client.get_character(args.args[0])
            
        elif command == 'wallet':
            data = client.get_account_wallet()
            
        elif command == 'bank':
            data = client.get_account_bank()
            # Filter out None/empty slots
            data = [item for item in data if item is not None]
            
        elif command == 'materials':
            data = client.get_account_materials()
            # Filter out materials with 0 count
            data = [mat for mat in data if mat.get('count', 0) > 0]
            
        elif command == 'achievements':
            if args.args:
                # Get specific achievements
                ids = [int(x) for x in args.args[0].split(',')]
                data = client.get_achievements(ids)
            else:
                data = client.get_account_achievements()
                
        elif command == 'items':
            if args.args:
                ids = [int(x) for x in args.args[0].split(',')]
                data = client.get_items(ids)
            else:
                print(f"{Fore.YELLOW}Tip: Provide item IDs separated by commas{Style.RESET_ALL}")
                data = client.get_items()[:100]  # Limit to first 100 IDs
                
        elif command == 'worlds':
            data = client.get_worlds()
            
        elif command == 'currencies':
            data = client.get_currencies()
            
        elif command == 'tp-prices':
            if args.args:
                ids = [int(x) for x in args.args[0].split(',')]
                data = client.get_tp_prices(ids)
            else:
                print(f"{Fore.YELLOW}Provide item IDs to get prices{Style.RESET_ALL}")
                return 1
                
        elif command == 'pvp-stats':
            data = client.get_pvp_stats()
            
        elif command == 'pvp-games':
            data = client.get_pvp_games()
            
        elif command == 'wvw-matches':
            data = client.get_wvw_matches()
            
        elif command == 'endpoint':
            if not args.args:
                print(f"{Fore.RED}Error: Endpoint path required{Style.RESET_ALL}")
                return 1
            endpoint = args.args[0]
            params = {}
            if len(args.args) > 1:
                # Parse additional parameters
                for param in args.args[1:]:
                    if '=' in param:
                        key, value = param.split('=', 1)
                        params[key] = value
            data = client.get(endpoint, params if params else None)
            
        else:
            print(f"{Fore.RED}Unknown command: {command}{Style.RESET_ALL}")
            print(f"Use --help for available commands")
            return 1
        
        # Display results
        if data is not None:
            GW2Viewer.display(data, args.format)
        else:
            print(f"{Fore.YELLOW}No data returned{Style.RESET_ALL}")
            
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 403:
            print(f"{Fore.RED}Error: Access forbidden{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}Your API key may not have the required permissions.{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}Visit https://account.arena.net/applications to update permissions.{Style.RESET_ALL}")
        elif e.response.status_code == 401:
            print(f"{Fore.RED}Error: Unauthorized{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}Check that your API key is valid and in the .env file.{Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}HTTP Error: {str(e)}{Style.RESET_ALL}")
        return 1
    except Exception as e:
        print(f"{Fore.RED}Error: {str(e)}{Style.RESET_ALL}")
        return 1
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
