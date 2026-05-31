from openai import OpenAI
from config import OPENAI_API_KEY, OPENAI_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)

response = client.chat.completions.create(
    model=OPENAI_MODEL,
    messages=[
        {
            "role": "user",
            "content": "Say hello"
        }
    ]
)

print(response.choices[0].message.content)