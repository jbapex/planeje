"""Text tokenizer reservation, with room for strict-schema formatting and max output.

This is a reservation, not a bill. The provider usage replaces it after completion.
"""
import json
import tiktoken
from context import ANALYSIS_OUTPUT_TOKENS

ENCODING=tiktoken.encoding_for_model('gpt-4o-mini-2024-07-18')

def reserve_tokens(system,context,schema):
    texts=[system,json.dumps(context,ensure_ascii=False),json.dumps(schema,ensure_ascii=False)]
    # Strict output schemas and chat envelopes add tokens beyond the plain strings.
    return sum(len(ENCODING.encode(text,disallowed_special=())) for text in texts)+ANALYSIS_OUTPUT_TOKENS+1024
