"""
migrate_giacom.py — Import Giacom account totals CSV into SynthOps MongoDB

Usage: python3 scripts/migrate_giacom.py --csv scripts/giacom_accounts.csv

Run from /opt/synthops on the server.
"""
import csv
import os
import argparse
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / 'backend' / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'synthops')

# Map product names to short internal keys used in support count
PRODUCT_KEY_MAP = {
    'microsoft 365 business standard': 'O365 Standard',
    'microsoft 365 business basic': 'O365 Basic',
    'microsoft 365 apps for business': 'O365 Apps',
    'microsoft 365 business standard (non-profit pricing)': 'O365 Standard',
    'office 365 e3': 'O365 Enterprise',
    'exchange online (plan 1)': 'Exchange Online P1',
    'exchange online (plan 2)': 'Exchange Online P2',
    'email safeguard.cloud': 'Message Labs',
}

def normalise_product(name):
    """Map full product name to short key, stripping NCE/term suffixes."""
    clean = name.lower()
    # Strip NCE/term suffixes
    for suffix in ['(nce annual term)', '(nce monthly term)', '(annual term)', '(monthly term)']:
        clean = clean.replace(suffix, '').strip()
    for key, short in PRODUCT_KEY_MAP.items():
        if key in clean:
            return short
    return name  # fallback: keep original

def next_renewal_date(created_str, term):
    """Calculate next annual renewal from the Created date."""
    try:
        created = datetime.strptime(created_str.strip(), '%d/%m/%Y')
        today = datetime.now()
        # For annual terms, find next anniversary
        if 'annual' in term.lower():
            year = today.year
            renewal = created.replace(year=year)
            if renewal <= today:
                renewal = created.replace(year=year + 1)
            return renewal.strftime('%Y-%m-%d')
        # Monthly — renews next month on same day
        elif 'monthly' in term.lower():
            next_month = today.replace(day=created.day)
            if next_month <= today:
                # Move to next month
                if today.month == 12:
                    next_month = next_month.replace(year=today.year + 1, month=1)
                else:
                    next_month = next_month.replace(month=today.month + 1)
            return next_month.strftime('%Y-%m-%d')
    except Exception:
        pass
    return None

def main(csv_path):
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    rows = []
    customers = {}  # customer_id -> {id, name, subscriptions: []}

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            customer_id = row['CustomerId'].strip()
            customer_name = row['CustomerName'].strip()
            product = row['Product'].strip()
            quantity = int(row['Quantity'].strip())
            cost_per_seat = float(row['CostPerSeat'].strip())
            total_cost = float(row['TotalCost'].strip())
            created = row['Created'].strip()
            reference = row['Reference'].strip()

            term = 'annual' if 'annual' in product.lower() else 'monthly'
            product_key = normalise_product(product)
            renewal = next_renewal_date(created, product)

            if customer_id not in customers:
                customers[customer_id] = {
                    'customer_id': customer_id,
                    'customer_name': customer_name,
                    'client_id': None,  # unmapped
                    'source': 'csv',
                    'last_synced': datetime.now(timezone.utc),
                }

            sub = {
                'customer_id': customer_id,
                'product': product,
                'product_key': product_key,
                'quantity': quantity,
                'cost_per_seat': cost_per_seat,
                'total_cost': total_cost,
                'term': term,
                'created': created,
                'renewal_date': renewal,
                'reference': reference,
            }
            rows.append(sub)

    # Upsert customers
    for cid, cdata in customers.items():
        existing = db.giacom_customers.find_one({'customer_id': cid})
        if existing:
            # Preserve existing mapping
            update = {k: v for k, v in cdata.items() if k not in ('client_id',)}
            db.giacom_customers.update_one({'customer_id': cid}, {'$set': update})
        else:
            db.giacom_customers.insert_one(cdata)

    # Replace all subscriptions (full refresh)
    if rows:
        db.giacom_subscriptions.delete_many({})
        db.giacom_subscriptions.insert_many(rows)

    print(f"Done. {len(customers)} customers, {len(rows)} subscriptions imported.")
    client.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    args = parser.parse_args()
    main(args.csv)
