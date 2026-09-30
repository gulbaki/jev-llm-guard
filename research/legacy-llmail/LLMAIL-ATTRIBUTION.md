# LLMail-Inject corpus attribution

The records in `llmail-cases.json` come from Microsoft's [LLMail-Inject: Adaptive Prompt Injection Challenge](https://huggingface.co/datasets/microsoft/llmail-inject-challenge), released under the MIT license. The original license notice is preserved in `LLMAIL-LICENSE`.

The 100 attack records are distinct Phase 2 submissions whose published outcome sets all five flags to true: `email.retrieved`, `defense.undetected`, `exfil.sent`, `exfil.destination`, and `exfil.content`. Each record keeps its source `RowKey` and scenario. Subject and body values are unchanged and serialized as `Subject: ...\nBody: ...` for Jev's single text input. This serialization is an adaptation; the measured success refers to the original challenge agent and its email fields, not to Jev.

The 20 allow controls come from the same dataset's `emails_for_fp_tests.json`. Selection is reproducible with `scripts/import-llmail.py`. It removes duplicate normalized texts, limits token 4-gram overlap, and balances scenario and participant IDs. The selected attacks span 22 challenge variants.

Source files used for this snapshot (SHA-256):

- `raw_submissions_phase2.jsonl`: `a9207e1d893ccb74ca6f9cc5eecea433bc49c23a26bed88088afd385c7ab18b6`
- `emails_for_fp_tests.json`: `4ddd950b5dbaa8548f5597c886d8e09a051ba07f80a9291fdcca9c2397d22abe`
