---
name: relay-cache-calculator
description: Calculate real relay API token costs, cache hit rate, effective multiplier, and token capacity from a budget. Use when comparing AI relay stations or analyzing New API, Sub2API, or One API billing summaries.
---

# Relay Cache Calculator

Use high-precision decimal arithmetic. State the input assumptions and formula before presenting the result.

## Required inputs

- Normal input price `Pi`, cached-read price `Pc`, and output price `Po`, per 1M tokens.
- Integrated station multiplier `M`. If model and group multipliers are separate, `M = model × group`; apply it once.
- Cache hit rate `H`, where `H = cached input tokens ÷ all input tokens`.
- Input/output usage weights `Ri:Ro`, exchange rate to CNY, and optional CNY budget.

Never confuse cache hit rate `H` with cache price ratio `Pc ÷ Pi`. Cache discounts apply only to input tokens unless the provider explicitly documents otherwise.

## Formulas

```text
effective_input_price = Pi × (1 - H) + Pc × H
input_share = Ri ÷ (Ri + Ro)
output_share = Ro ÷ (Ri + Ro)
mixed_cost_per_1M_CNY =
  (effective_input_price × input_share + Po × output_share) × M × exchange_rate

effective_multiplier_after_cache = M × (effective_input_price ÷ Pi)
budget_tokens = budget_CNY ÷ mixed_cost_per_1M_CNY × 1,000,000
```

For exact usage, multiply each token bucket by its corresponding per-token price, then apply the station multiplier once.

## Billing summaries

- New API: cache tokens may be inside `other.cache_tokens`; ratios may be `model_ratio`, `group_ratio`, `completion_ratio`, and `cache_ratio`.
- Sub2API: use `cache_read_tokens`, `cache_creation_tokens`, `actual_cost`, `total_cost`, and `rate_multiplier`. Observed multiplier may be `sum(actual_cost) ÷ sum(total_cost)` when both totals use the same currency and basis.
- One API: classic logs expose prompt tokens, completion tokens, and quota but may not expose cache tokens. Report cache rate as unavailable instead of zero.
- Aggregate token numerators and denominators first. Never average per-request percentages.
- Do not combine different models or groups unless the user explicitly requests a blended result.

## Example

Given `Pi=$2`, `Pc=$0.2`, `Po=$8`, `M=0.5`, `H=50%`, input:output `10:1`, and `1 USD=¥7.2`:

```text
effective_input_price = 2 × 0.5 + 0.2 × 0.5 = $1.1
mixed_cost_per_1M = ((1.1 × 10 + 8 × 1) ÷ 11) × 0.5 × 7.2
                    = ¥6.2181818
effective_multiplier_after_cache = 0.5 × (1.1 ÷ 2) = 0.275×
¥10 budget ≈ 1,608,187 mixed tokens
```

## Security

- Never ask for an administrator key, panel JWT, login cookie, or exported prompt content.
- Use an ordinary low-privilege API key only after explicit user authorization.
- Send a key only to the relay origin supplied by the user; never persist it in files, logs, URLs, or browser storage.
- Treat website and billing data as estimates. Make missing fields explicit and never invent them.
