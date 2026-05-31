from dotenv import load_dotenv
import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL")

# Provider-specific: do not fail imports when using non-OpenAI providers.
AI_PROVIDER = os.getenv("AI_PROVIDER", "anthropic").lower()

if AI_PROVIDER == "openai" and not OPENAI_API_KEY:
    raise ValueError("OpenAI API key not found (AI_PROVIDER=openai)")
