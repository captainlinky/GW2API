# GW2API Windows Startup Script
# Run this script in PowerShell to start the GW2 API server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Guild Wars 2 API - Windows Startup  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found! Please install Python 3.8+ from python.org" -ForegroundColor Red
    Write-Host "  Download: https://www.python.org/downloads/" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if .env file exists
if (-Not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "⚠ No .env file found!" -ForegroundColor Yellow
    Write-Host "Creating .env from template..." -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✓ Created .env file" -ForegroundColor Green
        Write-Host ""
        Write-Host "IMPORTANT: You need to add your GW2 API key!" -ForegroundColor Red
        Write-Host "1. Open .env file in notepad" -ForegroundColor Yellow
        Write-Host "2. Replace 'your-api-key-here' with your actual API key" -ForegroundColor Yellow
        Write-Host "3. Get your API key from: https://account.arena.net/applications" -ForegroundColor Yellow
        Write-Host ""
        
        $response = Read-Host "Do you want to edit .env now? (y/n)"
        if ($response -eq "y" -or $response -eq "Y") {
            notepad .env
            Write-Host "Waiting for you to save and close notepad..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ .env.example not found! Cannot create .env file" -ForegroundColor Red
        pause
        exit 1
    }
}

# Check if virtual environment exists
if (-Not (Test-Path ".venv")) {
    Write-Host ""
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Virtual environment created" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to create virtual environment" -ForegroundColor Red
        pause
        exit 1
    }
}

# Activate virtual environment
Write-Host ""
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".venv\Scripts\Activate.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to activate virtual environment" -ForegroundColor Red
    Write-Host "  You may need to run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✓ Virtual environment activated" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet --disable-pip-version-check

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    pause
    exit 1
}

# Start the server
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting GW2 API Server..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server will be available at: http://localhost:5555" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

python app.py
