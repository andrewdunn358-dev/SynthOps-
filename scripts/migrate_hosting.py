"""
migrate_hosting.py — Import hosting accounts from CSV into SynthOps MongoDB

Usage:
  python scripts/migrate_hosting.py --csv /path/to/hosting.csv

Run from /opt/synthops on the server, or locally with access to MongoDB.
"""

import asyncio
import csv
import os
import sys
import argparse
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / 'backend' / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'synthops')


async def main(csv_path: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        accounts = []
        for row in reader:
            primary = row.get('Primary Domain', '').strip()
            if not primary:
                continue

            all_domains_raw = row.get('All Domains', '')
            all_domains = [d.strip() for d in all_domains_raw.split('|') if d.strip()]

            created_raw = row.get('Created', '')
            try:
                created = datetime.fromisoformat(created_raw.replace('Z', '+00:00'))
            except Exception:
                created = None

            disabled_raw = row.get('Disabled Date', '')
            try:
                disabled_date = datetime.fromisoformat(disabled_raw.replace('Z', '+00:00')) if disabled_raw else None
            except Exception:
                disabled_date = None

            accounts.append({
                'primary_domain': primary,
                'all_domains': all_domains,
                'has_ssl': row.get('Has SSL', '0').strip() == '1',
                'package': row.get('Package', '').strip(),
                'enabled': row.get('Enabled', '0').strip() == '1',
                'created': created,
                'disabled_date': disabled_date,
                'client_id': None,  # unmapped initially
            })

    imported = 0
    skipped = 0
    for acc in accounts:
        # Upsert — preserve existing client_id mapping if already mapped
        existing = await db.hosting_accounts.find_one({'primary_domain': acc['primary_domain']})
        if existing and existing.get('client_id'):
            # Don't overwrite an existing mapping
            update = {k: v for k, v in acc.items() if k != 'client_id'}
            await db.hosting_accounts.update_one(
                {'primary_domain': acc['primary_domain']},
                {'$set': update}
            )
            skipped += 1
        else:
            await db.hosting_accounts.update_one(
                {'primary_domain': acc['primary_domain']},
                {'$set': acc},
                upsert=True
            )
        imported += 1

    print(f"Done. {imported} accounts imported/updated. {skipped} existing mappings preserved.")
    client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True, help='Path to hosting CSV file')
    args = parser.parse_args()
    asyncio.run(main(args.csv))
