alter table teams add column if not exists monthly_budget_usd numeric;
alter table task_runs add column if not exists cost_usd numeric;
