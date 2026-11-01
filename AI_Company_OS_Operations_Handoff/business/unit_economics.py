import argparse
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

D = lambda x: Decimal(str(x))
YEN = Decimal("1")

def calculate(price, rate, tools, delivery_hours, acquisition_hours, hourly, buffer, acquisition_cash=0):
    price, rate, tools, delivery_hours, acquisition_hours, hourly, buffer, acquisition_cash = map(
        D, (price, rate, tools, delivery_hours, acquisition_hours, hourly, buffer, acquisition_cash))
    if min(price, tools, delivery_hours, acquisition_hours, hourly, buffer, acquisition_cash) < 0 or not 0 <= rate <= 1:
        raise ValueError("Inputs must be nonnegative and fee rate must be between 0 and 1")
    fee = (price * rate).quantize(YEN, rounding=ROUND_HALF_UP)
    time_value = ((delivery_hours + acquisition_hours) * hourly).quantize(YEN, rounding=ROUND_HALF_UP)
    remaining = price - fee - tools - time_value - buffer - acquisition_cash
    affordable_hours = max(D(0), (price * (D(1) - rate - D("0.30")) - tools - buffer - acquisition_cash) / hourly) if hourly else None
    return {
        "status": "ASSUMPTIONS_NOT_OBSERVED_RESULTS",
        "currency": "JPY",
        "customer_receipt": int(price),
        "production_and_delivery_hours": float(delivery_hours),
        "allocated_acquisition_hours": float(acquisition_hours),
        "total_human_hours": float(delivery_hours + acquisition_hours),
        "estimated_payment_fee": int(fee),
        "ai_and_variable_tools": int(tools),
        "acquisition_cash": int(acquisition_cash),
        "human_time_value": int(time_value),
        "modeled_reserve_not_actual_cost": int(buffer),
        "remaining_before_taxes_and_fixed_overhead": int(remaining),
        "remaining_share": float(remaining / price) if price else None,
        "max_total_hours_for_30pct_share": float(affordable_hours.quantize(D("0.0001"))) if affordable_hours is not None else None,
        "note": "人の時間を経済コストとして引く仮定計算。会計利益・売上予測ではなく、価格の受容性も未検証。予備費は実原価と区別。",
    }

def model():
    return json.loads((Path(__file__).parent / "07_UNIT_ECONOMICS.json").read_text())

def scenarios(m):
    inputs = [
        ("old_combined_5h_assumption", 33000, 5, 0),
        ("revised_13h_example", 33000, 5, 8),
        ("longer_sales_17h_example", 33000, 5, 12),
        ("unvalidated_55000_price_example", 55000, 5, 8),
    ]
    return {
        "status": "SCENARIOS_NOT_ACTUAL_REVENUE",
        "old_combined_hours_note": "旧5時間は営業・制作合計の仮定。旧内訳は不明。出力の内訳を実測と解釈しない。",
        "scenarios": [
            {"scenario": name, **calculate(price, m["card_fee_rate"], m["ai_and_variable_tools"], delivery, sales,
                m["human_hour_value"], m["rework_and_refund_buffer"], m["allocated_acquisition_cash"])}
            for name, price, delivery, sales in inputs
        ],
    }

if __name__ == "__main__":
    m = model()
    parser = argparse.ArgumentParser(description="仮定に基づく管理試算。利益・成功率の予測ではありません。")
    parser.add_argument("--price", type=int, default=m["customer_receipt"])
    parser.add_argument("--production-hours", type=Decimal, default=D(m["production_and_delivery_hours"]))
    parser.add_argument("--sales-hours", type=Decimal, default=D(m["allocated_acquisition_hours_per_paying_customer"]))
    parser.add_argument("--scenarios", action="store_true")
    args = parser.parse_args()
    result = scenarios(m) if args.scenarios else calculate(
        args.price, m["card_fee_rate"], m["ai_and_variable_tools"], args.production_hours,
        args.sales_hours, m["human_hour_value"], m["rework_and_refund_buffer"], m["allocated_acquisition_cash"])
    print(json.dumps(result, ensure_ascii=False, indent=2))
