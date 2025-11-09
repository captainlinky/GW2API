#!/bin/bash
# Example commands for the GW2 API tool

echo "=== GW2 API Tool - Example Commands ==="
echo ""

echo "1. Account Information"
echo "   python cli.py account -f summary"
echo ""

echo "2. Trading Post Prices (Ectoplasm)"
echo "   python cli.py tp-prices 19721 -f table"
echo ""

echo "3. Multiple Item Prices"
echo "   python cli.py tp-prices 19721,24277,19976 -f table"
echo ""

echo "4. Item Details"
echo "   python cli.py items 19721,24277 -f table"
echo ""

echo "5. Current Game Build"
echo "   python cli.py endpoint build"
echo ""

echo "6. List All Worlds"
echo "   python cli.py worlds -f compact"
echo ""

echo "7. List Currencies"
echo "   python cli.py currencies -f table"
echo ""

echo "8. Run Tests"
echo "   python test.py"
echo ""

echo "9. View Quick Reference"
echo "   python quickref.py"
echo ""

echo "10. Run Demos"
echo "    python demo.py"
echo ""

echo "Run any command above to see it in action!"
