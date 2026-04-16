"""
migrate_hosting.py — Import hosting accounts from CSV into SynthOps MongoDB
Usage: python3 scripts/migrate_hosting.py --csv scripts/hosting.csv
"""
import csv
import os
import argparse
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / 'backend' / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'synthops')

def main(csv_path):
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        accounts = []
        for row in reader:
            primary = row.get('Primary Domain', '').strip()
            if not primary:
                continue
            all_domains = [d.strip() for d in row.get('All Domains', '').split('|') if d.strip()]
            try:
                created = datetime.fromisoformat(row.get('Created', '').replace('Z', '+00:00'))
            except Exception:
                created = None
            accounts.append({
                'primary_domain': primary,
                'all_domains': all_domains,
                'has_ssl': row.get('Has SSL', '0').strip() == '1',
                'package': row.get('Package', '').strip(),
                'enabled': row.get('Enabled', '0').strip() == '1',
                'created': created,
                'client_id': None,
            })

    imported = skipped = 0
    for acc in accounts:
        existing = db.hosting_accounts.find_one({'primary_domain': acc['primary_domain']})
        if existing and existing.get('client_id'):
            update = {k: v for k, v in acc.items() if k != 'client_id'}
            db.hosting_accounts.update_one({'primary_domain': acc['primary_domain']}, {'$set': update})
            skipped += 1
        else:
            db.hosting_accounts.update_one({'primary_domain': acc['primary_domain']}, {'$set': acc}, upsert=True)
        imported += 1

    print(f"Done. {imported} accounts imported/updated. {skipped} existing mappings preserved.")
    client.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    args = parser.parse_args()
    main(args.csv)
