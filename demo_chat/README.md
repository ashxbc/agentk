# Demo Chat — Reddit Lead-Gen Chatbot

## Setup

1. Copy env file and fill in keys:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   python -m crawl4ai.async_configs
   ```

3. Run:
   ```bash
   uvicorn main:app --reload
   ```

Open http://localhost:8000
