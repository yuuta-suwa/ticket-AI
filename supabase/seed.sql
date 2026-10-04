-- Local-dev seed only. No real users, no secrets. The App Review account is created with
-- scripts/create-review-account.mjs (password read from env, never committed).
insert into private.route_statistics(route, cabin, window_days, median, p10, p90, samples) values
  ('NRT-HNL','ECONOMY',90,780,520,1100,500), ('HND-SIN','ECONOMY',90,460,300,700,400)
on conflict do nothing;
