#!/usr/bin/env python3
"""
ETL seed script for dbdash.

Reads EventsData XLSX, normalizes data, and inserts into PostgreSQL.
Idempotent: truncates all tables on each run.

Usage:
    python etl/seed.py [path/to/EventsData.xlsx]
"""

import math
import os
import sys
import time
from datetime import datetime

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# Add parent dir so we can import normalization modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from normalization.gender import normalize_gender
from normalization.room_types import normalize_room_type
from normalization.hotels import normalize_hotel_name
from normalization.phones import normalize_phone
from normalization.zipcodes import normalize_zipcode
from normalization.event_classifier import classify_event, classify_event_type

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://dbdash:dbdash_dev@localhost:5433/dbdash'
)

XLSX_PATHS = [
    '/data/EventsData_2017_2025.xlsx',  # Docker mount
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 'docs', 'event_docs', 'EventsData_2017_2025.xlsx'),  # Local dev
]

# Column indices from the XLSX "Data" sheet
COL = {
    'EventName': 0,
    'EventStartDate': 1,
    'EventEndDate': 2,
    'IsGPEvent': 3,
    'MahatmaID': 4,
    'FirstName': 5,
    'MiddleName': 6,
    'LastName': 7,
    'Gender': 8,
    'AgeNow': 9,
    'AgeAtEvent': 10,
    'GnanDate': 11,
    'HasGnanTakenInThisEvent': 12,
    'MemberID': 13,
    'FamilyID': 14,
    'HasMemberRegisteredForEvent': 15,
    'HasMemberCheckedInForEvent': 16,
    'EventCheckedInTimeUTC': 17,
    'HasRoomBookedByFamily': 18,
    'OccupantsInRoom': 19,
    'RoomsPerFamily': 20,
    'HasMemberStayedInRoom': 21,
    'AssumedRoomCheckInDate': 22,
    'AssumedRoomCheckOutDate': 23,
    'RoomType': 24,
    'HotelName': 25,
    'Phone1': 26,
    'Phone2': 27,
    'EmailAddress': 28,
    'BirthMonth': 29,
    'BirthYear': 30,
    'PhotoFileName': 31,
    'Address1': 32,
    'Address2': 33,
    'City': 34,
    'State': 35,
    'Zipcode': 36,
    'Country': 37,
    'EventID': 38,
    'InMMS': 39,
}

# The 9 canonical event types
EVENT_TYPES = [
    ('Gurupurnima', 'Guru Purnima celebration events'),
    ('Satsang', 'Satsang and discourse events'),
    ('Retreat', 'Spiritual retreat events'),
    ('Youth Camp', 'Youth camp events'),
    ('Shibir', 'Shibir (workshop) events'),
    ('Learning', 'Learning, workshop, and seminar events'),
    ('Cruise', 'Cruise events'),
    ('Virtual', 'Online/virtual events'),
    ('Other', 'Uncategorized events'),
]

# The 7 zones (+ International)
ZONES = [
    ('North East', 'New Jersey, New York, Pennsylvania, Massachusetts, Connecticut, Maryland, Virginia'),
    ('South East', 'North Carolina, Georgia, Florida, South Carolina, Tennessee'),
    ('South Central', 'Texas, Oklahoma, Louisiana'),
    ('North Central', 'Illinois, Iowa, Minnesota, Indiana, Ohio'),
    ('West Coast', 'California, Arizona, Nevada, Washington'),
    ('Canada', 'Ontario, Quebec, British Columbia, Alberta'),
    ('International', 'Events outside US and Canada'),
]

# The 10 canonical room types
ROOM_TYPES = [
    ('Double Queen', 'Room with two queen beds'),
    ('King', 'Room with one king bed'),
    ('Double/Double Beds', 'Room with two double beds'),
    ('Suite', 'Suite room'),
    ('King + Sofa', 'King bed with sofa bed'),
    ('Double + Sofa', 'Double beds with sofa bed'),
    ('Studio', 'Studio room'),
    ('Accessible', 'ADA accessible room'),
    ('Parlor', 'Parlor room'),
    ('Unknown', 'Unknown or unmapped room type'),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_int(val, default=None):
    """Convert a value to int safely, handling NaN/None/float."""
    if val is None:
        return default
    if isinstance(val, float):
        if math.isnan(val):
            return default
        return int(val)
    if isinstance(val, int):
        return val
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def safe_str(val, default=None):
    """Convert a value to str safely, handling NaN/None."""
    if val is None:
        return default
    if isinstance(val, float) and math.isnan(val):
        return default
    s = str(val).strip()
    return s if s else default


def safe_bool(val, default=False):
    """Convert a value to bool, treating 1/1.0/'1' as True."""
    if val is None:
        return default
    if isinstance(val, float):
        if math.isnan(val):
            return default
        return val == 1.0
    if isinstance(val, bool):
        return val
    if isinstance(val, int):
        return val == 1
    if isinstance(val, str):
        return val.strip().lower() in ('1', 'true', 'yes')
    return default


def safe_date(val):
    """Convert a value to a date/datetime, or return None."""
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    # Must check pd.isna BEFORE isinstance(datetime) because pd.NaT is a datetime
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S'):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
    return None


def progress(msg):
    """Print a timestamped progress message."""
    ts = datetime.now().strftime('%H:%M:%S')
    print(f"[{ts}] {msg}")


# ---------------------------------------------------------------------------
# Main ETL
# ---------------------------------------------------------------------------

def find_xlsx(cli_path=None):
    """Find the XLSX file to process."""
    if cli_path:
        if os.path.isfile(cli_path):
            return cli_path
        print(f"ERROR: Specified file not found: {cli_path}")
        sys.exit(1)

    for p in XLSX_PATHS:
        if os.path.isfile(p):
            return p

    print("ERROR: Could not find EventsData XLSX file.")
    print("Searched:", XLSX_PATHS)
    sys.exit(1)


def run_etl(xlsx_path=None):
    """Run the full ETL pipeline."""
    start_time = time.time()

    # Resolve XLSX path
    cli_path = xlsx_path or (sys.argv[1] if len(sys.argv) > 1 else None)
    xlsx_file = find_xlsx(cli_path)
    progress(f"Using XLSX file: {xlsx_file}")

    # Connect to PostgreSQL
    progress("Connecting to PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # -------------------------------------------------------------------
        # Step 0: Truncate all tables (idempotent)
        # -------------------------------------------------------------------
        progress("Truncating all tables...")
        cur.execute("""
            TRUNCATE TABLE
                data_quality_log,
                hotel_room_inventory,
                gnan_records,
                room_bookings,
                event_attendance,
                member_addresses,
                room_type_aliases,
                members,
                hotels,
                families,
                events,
                room_types,
                zones,
                event_types
            CASCADE;
        """)
        conn.commit()

        # -------------------------------------------------------------------
        # Step 1: Insert event_types
        # -------------------------------------------------------------------
        progress("Inserting event types...")
        event_type_ids = {}
        for type_name, description in EVENT_TYPES:
            cur.execute(
                "INSERT INTO event_types (type_name, description) VALUES (%s, %s) RETURNING event_type_id",
                (type_name, description)
            )
            event_type_ids[type_name] = cur.fetchone()[0]
        conn.commit()
        progress(f"  Inserted {len(event_type_ids)} event types")

        # -------------------------------------------------------------------
        # Step 2: Insert zones
        # -------------------------------------------------------------------
        progress("Inserting zones...")
        zone_ids = {}
        for zone_name, states in ZONES:
            cur.execute(
                "INSERT INTO zones (zone_name, states_included) VALUES (%s, %s) RETURNING zone_id",
                (zone_name, states)
            )
            zone_ids[zone_name] = cur.fetchone()[0]
        conn.commit()
        progress(f"  Inserted {len(zone_ids)} zones")

        # -------------------------------------------------------------------
        # Step 3: Insert room_types
        # -------------------------------------------------------------------
        progress("Inserting room types...")
        room_type_ids = {}
        for canonical_name, description in ROOM_TYPES:
            cur.execute(
                "INSERT INTO room_types (canonical_name, description) VALUES (%s, %s) RETURNING room_type_id",
                (canonical_name, description)
            )
            room_type_ids[canonical_name] = cur.fetchone()[0]
        conn.commit()
        progress(f"  Inserted {len(room_type_ids)} room types")

        # -------------------------------------------------------------------
        # Step 4: Read XLSX Data sheet
        # -------------------------------------------------------------------
        progress("Reading XLSX Data sheet...")
        df = pd.read_excel(xlsx_file, sheet_name='Data', header=0)
        df = df.dropna(how='all')
        progress(f"  Read {len(df)} rows from Data sheet")

        # Use column names from the header row
        cols = list(df.columns)

        # Data quality log entries to batch-insert later
        quality_logs = []

        # -------------------------------------------------------------------
        # Step 5: Extract and insert events
        # -------------------------------------------------------------------
        progress("Extracting and inserting events...")
        events_seen = {}  # event_id -> True
        event_rows = []

        for _, row in df.iterrows():
            event_id = safe_int(row.iloc[COL['EventID']])
            if event_id is None or event_id in events_seen:
                continue
            events_seen[event_id] = True

            event_name = safe_str(row.iloc[COL['EventName']], '')
            classification = classify_event(event_name)

            et = classification['event_type']
            event_type_id = event_type_ids.get(et, event_type_ids['Other'])

            zone_name = classification['zone']
            zone_id = zone_ids.get(zone_name) if zone_name else None

            start_date = safe_date(row.iloc[COL['EventStartDate']])
            end_date = safe_date(row.iloc[COL['EventEndDate']])
            is_gp = safe_bool(row.iloc[COL['IsGPEvent']])
            is_virtual = classification['is_virtual']
            has_gnanvidhi = classification['has_gnanvidhi']
            target_demo = classification['target_demographic']

            year = start_date.year if start_date else 0

            event_rows.append((
                event_id, event_name, event_type_id, zone_id,
                start_date, end_date, is_gp, is_virtual,
                has_gnanvidhi, target_demo, year
            ))

        execute_values(
            cur,
            """INSERT INTO events (event_id, event_name, event_type_id, zone_id,
                   start_date, end_date, is_gp_event, is_virtual,
                   has_gnanvidhi, target_demographic, year)
               VALUES %s""",
            event_rows,
            page_size=500
        )
        conn.commit()
        progress(f"  Inserted {len(event_rows)} events")

        # -------------------------------------------------------------------
        # Step 6: Extract and insert families
        # -------------------------------------------------------------------
        progress("Extracting and inserting families...")
        family_member_counts = {}  # family_id -> count

        for _, row in df.iterrows():
            fam_id = safe_int(row.iloc[COL['FamilyID']])
            mem_id = safe_int(row.iloc[COL['MemberID']])
            if fam_id is None:
                continue
            if fam_id not in family_member_counts:
                family_member_counts[fam_id] = set()
            if mem_id is not None:
                family_member_counts[fam_id].add(mem_id)

        family_rows = [
            (fam_id, len(members))
            for fam_id, members in family_member_counts.items()
        ]

        execute_values(
            cur,
            "INSERT INTO families (family_id, member_count) VALUES %s",
            family_rows,
            page_size=1000
        )
        conn.commit()
        progress(f"  Inserted {len(family_rows)} families")

        # -------------------------------------------------------------------
        # Step 7: Extract and insert hotels
        # -------------------------------------------------------------------
        progress("Extracting and inserting hotels...")
        hotels_seen = {}  # normalized_name -> hotel_id
        hotel_insert_rows = []

        for _, row in df.iterrows():
            raw_hotel = safe_str(row.iloc[COL['HotelName']])
            if raw_hotel is None:
                continue
            normalized = normalize_hotel_name(raw_hotel)
            if normalized is None or normalized in hotels_seen:
                continue
            hotels_seen[normalized] = None  # placeholder, will get ID after insert

            # Try to get city/state/country from same row
            city = safe_str(row.iloc[COL['City']])
            state = safe_str(row.iloc[COL['State']])
            country = safe_str(row.iloc[COL['Country']])
            hotel_insert_rows.append((normalized, city, state, country))

        if hotel_insert_rows:
            execute_values(
                cur,
                "INSERT INTO hotels (hotel_name, city, state, country) VALUES %s RETURNING hotel_id, hotel_name",
                hotel_insert_rows,
                page_size=500
            )
            for hotel_id, hotel_name in cur.fetchall():
                hotels_seen[hotel_name] = hotel_id
        conn.commit()
        progress(f"  Inserted {len(hotel_insert_rows)} hotels")

        # -------------------------------------------------------------------
        # Step 8: Insert room_type_aliases
        # -------------------------------------------------------------------
        progress("Inserting room type aliases...")
        import json
        map_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'mappings', 'room_type_map.json'
        )
        with open(map_path, 'r') as f:
            room_type_map = json.load(f)

        alias_rows = []
        for canonical_name, raw_names in room_type_map.items():
            rt_id = room_type_ids.get(canonical_name)
            if rt_id is None:
                continue
            for raw_name in raw_names:
                alias_rows.append((rt_id, raw_name))

        if alias_rows:
            execute_values(
                cur,
                "INSERT INTO room_type_aliases (room_type_id, raw_name) VALUES %s",
                alias_rows,
                page_size=500
            )
        conn.commit()
        progress(f"  Inserted {len(alias_rows)} room type aliases")

        # -------------------------------------------------------------------
        # Step 9: Extract and insert members
        # -------------------------------------------------------------------
        progress("Extracting and inserting members...")
        members_seen = {}  # member_id -> True
        member_rows = []

        for idx, row in df.iterrows():
            mem_id = safe_int(row.iloc[COL['MemberID']])
            if mem_id is None or mem_id in members_seen:
                continue
            members_seen[mem_id] = True

            fam_id = safe_int(row.iloc[COL['FamilyID']])
            if fam_id is None:
                quality_logs.append(('Data', idx + 2, 'FamilyID', 'missing_required',
                                     None, None, f'Skipped member {mem_id}: no FamilyID'))
                continue

            mahatma_id = safe_int(row.iloc[COL['MahatmaID']])
            first_name = safe_str(row.iloc[COL['FirstName']], '')
            middle_name = safe_str(row.iloc[COL['MiddleName']])
            last_name = safe_str(row.iloc[COL['LastName']], '')

            # Gender normalization
            raw_gender = row.iloc[COL['Gender']]
            gender, gender_modified = normalize_gender(raw_gender)
            if gender_modified and raw_gender is not None:
                quality_logs.append(('Data', idx + 2, 'Gender', 'normalized',
                                     str(raw_gender), gender, 'Gender value normalized'))

            # Phone normalization
            raw_phone1 = row.iloc[COL['Phone1']]
            phone1 = normalize_phone(raw_phone1)
            raw_phone2 = row.iloc[COL['Phone2']]
            phone2 = normalize_phone(raw_phone2)

            email = safe_str(row.iloc[COL['EmailAddress']])
            birth_month = safe_int(row.iloc[COL['BirthMonth']])
            birth_year = safe_int(row.iloc[COL['BirthYear']])
            photo = safe_str(row.iloc[COL['PhotoFileName']])
            in_mms = safe_bool(row.iloc[COL['InMMS']])

            member_rows.append((
                mem_id, fam_id, mahatma_id, first_name, middle_name, last_name,
                gender, birth_month, birth_year, phone1, phone2,
                email, photo, in_mms
            ))

        execute_values(
            cur,
            """INSERT INTO members (member_id, family_id, mahatma_id, first_name,
                   middle_name, last_name, gender, birth_month, birth_year,
                   phone_primary, phone_secondary, email, photo_filename, in_mms)
               VALUES %s""",
            member_rows,
            page_size=1000
        )
        conn.commit()
        progress(f"  Inserted {len(member_rows)} members")

        # -------------------------------------------------------------------
        # Step 10: Insert member_addresses (deduped, is_current for latest)
        # -------------------------------------------------------------------
        progress("Extracting and inserting member addresses...")
        # Collect all addresses per member, dedup by composite key
        member_addresses = {}  # (member_id, addr1, addr2, city, state, zip, country) -> row_idx

        for idx, row in df.iterrows():
            mem_id = safe_int(row.iloc[COL['MemberID']])
            if mem_id is None or mem_id not in members_seen:
                continue

            addr1 = safe_str(row.iloc[COL['Address1']])
            addr2 = safe_str(row.iloc[COL['Address2']])
            city = safe_str(row.iloc[COL['City']])
            state = safe_str(row.iloc[COL['State']])
            raw_zip = row.iloc[COL['Zipcode']]
            zipcode = normalize_zipcode(raw_zip)
            country = safe_str(row.iloc[COL['Country']])

            # Skip if all address fields are empty
            if not any([addr1, addr2, city, state, zipcode, country]):
                continue

            # Log zipcode normalization
            if zipcode and raw_zip is not None:
                raw_zip_str = str(raw_zip).strip() if not (isinstance(raw_zip, float) and math.isnan(raw_zip)) else None
                if raw_zip_str and raw_zip_str != zipcode:
                    quality_logs.append(('Data', idx + 2, 'Zipcode', 'normalized',
                                         raw_zip_str, zipcode, 'Zipcode padded/normalized'))

            key = (mem_id, addr1, addr2, city, state, zipcode, country)
            # Keep the latest occurrence (higher row index = more recent)
            member_addresses[key] = idx

        # Determine which address is "current" for each member (latest row index)
        member_latest_idx = {}  # member_id -> max row_idx
        for key, row_idx in member_addresses.items():
            mem_id = key[0]
            if mem_id not in member_latest_idx or row_idx > member_latest_idx[mem_id]:
                member_latest_idx[mem_id] = row_idx

        addr_rows = []
        for key, row_idx in member_addresses.items():
            mem_id, addr1, addr2, city, state, zipcode, country = key
            is_current = (row_idx == member_latest_idx[mem_id])
            addr_rows.append((mem_id, addr1, addr2, city, state, zipcode, country, is_current))

        if addr_rows:
            execute_values(
                cur,
                """INSERT INTO member_addresses (member_id, address_line1, address_line2,
                       city, state, zipcode, country, is_current)
                   VALUES %s""",
                addr_rows,
                page_size=1000
            )
        conn.commit()
        progress(f"  Inserted {len(addr_rows)} member addresses")

        # -------------------------------------------------------------------
        # Step 11: Insert event_attendance
        # -------------------------------------------------------------------
        progress("Inserting event attendance records...")
        attendance_seen = set()  # (member_id, event_id)
        attendance_rows = []

        for idx, row in df.iterrows():
            mem_id = safe_int(row.iloc[COL['MemberID']])
            event_id = safe_int(row.iloc[COL['EventID']])
            if mem_id is None or event_id is None:
                continue
            if mem_id not in members_seen:
                continue

            pair = (mem_id, event_id)
            if pair in attendance_seen:
                continue
            attendance_seen.add(pair)

            registered = safe_bool(row.iloc[COL['HasMemberRegisteredForEvent']])
            checked_in = safe_bool(row.iloc[COL['HasMemberCheckedInForEvent']])
            checked_in_time = safe_date(row.iloc[COL['EventCheckedInTimeUTC']])
            age_at_event = safe_int(row.iloc[COL['AgeAtEvent']])
            gnan_taken = safe_bool(row.iloc[COL['HasGnanTakenInThisEvent']])

            attendance_rows.append((
                mem_id, event_id, registered, checked_in,
                checked_in_time, age_at_event, gnan_taken
            ))

        execute_values(
            cur,
            """INSERT INTO event_attendance (member_id, event_id, registered,
                   checked_in, checked_in_time_utc, age_at_event, gnan_taken)
               VALUES %s""",
            attendance_rows,
            page_size=2000
        )
        conn.commit()
        progress(f"  Inserted {len(attendance_rows)} attendance records")

        # -------------------------------------------------------------------
        # Step 12: Insert room_bookings (where HasRoomBookedByFamily=1)
        # -------------------------------------------------------------------
        progress("Inserting room bookings...")
        booking_rows = []

        for idx, row in df.iterrows():
            has_booking = safe_bool(row.iloc[COL['HasRoomBookedByFamily']])
            if not has_booking:
                continue

            mem_id = safe_int(row.iloc[COL['MemberID']])
            event_id = safe_int(row.iloc[COL['EventID']])
            fam_id = safe_int(row.iloc[COL['FamilyID']])
            if mem_id is None or event_id is None or fam_id is None:
                continue
            if mem_id not in members_seen:
                continue

            # Resolve hotel
            raw_hotel = safe_str(row.iloc[COL['HotelName']])
            hotel_id = None
            if raw_hotel:
                normalized_hotel = normalize_hotel_name(raw_hotel)
                hotel_id = hotels_seen.get(normalized_hotel)

            # Resolve room type
            raw_room = safe_str(row.iloc[COL['RoomType']])
            room_type_id = None
            if raw_room:
                canonical = normalize_room_type(raw_room)
                room_type_id = room_type_ids.get(canonical)

            stayed = safe_bool(row.iloc[COL['HasMemberStayedInRoom']])
            occupants = safe_int(row.iloc[COL['OccupantsInRoom']], 0)
            rooms_per_fam = safe_int(row.iloc[COL['RoomsPerFamily']], 0)
            check_in = safe_date(row.iloc[COL['AssumedRoomCheckInDate']])
            check_out = safe_date(row.iloc[COL['AssumedRoomCheckOutDate']])

            booking_rows.append((
                mem_id, event_id, hotel_id, room_type_id, fam_id,
                True, stayed, occupants, rooms_per_fam,
                check_in, check_out
            ))

        if booking_rows:
            execute_values(
                cur,
                """INSERT INTO room_bookings (member_id, event_id, hotel_id,
                       room_type_id, family_id, room_booked, stayed_in_room,
                       occupants, rooms_per_family, check_in_date, check_out_date)
                   VALUES %s""",
                booking_rows,
                page_size=2000
            )
        conn.commit()
        progress(f"  Inserted {len(booking_rows)} room bookings")

        # -------------------------------------------------------------------
        # Step 13: Insert gnan_records
        # -------------------------------------------------------------------
        progress("Inserting gnan records...")
        gnan_rows = []

        for idx, row in df.iterrows():
            has_gnan = safe_bool(row.iloc[COL['HasGnanTakenInThisEvent']])
            gnan_date = safe_date(row.iloc[COL['GnanDate']])

            if not has_gnan and gnan_date is None:
                continue

            mem_id = safe_int(row.iloc[COL['MemberID']])
            event_id = safe_int(row.iloc[COL['EventID']])
            mahatma_id = safe_int(row.iloc[COL['MahatmaID']])

            if mem_id is None:
                continue
            if mem_id not in members_seen:
                continue

            gnan_rows.append((mem_id, mahatma_id, gnan_date, event_id))

        if gnan_rows:
            execute_values(
                cur,
                """INSERT INTO gnan_records (member_id, mahatma_id, gnan_date, event_id)
                   VALUES %s""",
                gnan_rows,
                page_size=2000
            )
        conn.commit()
        progress(f"  Inserted {len(gnan_rows)} gnan records")

        # -------------------------------------------------------------------
        # Step 14: Read GP 2025 sheet and insert hotel_room_inventory
        # -------------------------------------------------------------------
        progress("Reading GP 2025 sheet for hotel room inventory...")
        try:
            df_gp = pd.read_excel(xlsx_file, sheet_name='GP 2025', header=0)
            df_gp = df_gp.dropna(how='all')
            progress(f"  Read {len(df_gp)} rows from GP 2025 sheet")

            inventory_rows = []
            gp_cols = list(df_gp.columns)

            # Find the GP 2025 event in our events
            gp_event_id = None
            for eid, _ in events_seen.items():
                # Will match if there is a GP 2025 event
                pass

            # Try to find event_id for GP 2025 from the events we inserted
            cur.execute("SELECT event_id FROM events WHERE event_name ILIKE '%GP 2025%' OR (event_name ILIKE '%Guru%Purnima%' AND year = 2025) LIMIT 1")
            gp_result = cur.fetchone()
            gp_event_id = gp_result[0] if gp_result else None

            if gp_event_id is None:
                # Try to find any 2025 GP event
                cur.execute("SELECT event_id FROM events WHERE is_gp_event = true AND year = 2025 LIMIT 1")
                gp_result = cur.fetchone()
                gp_event_id = gp_result[0] if gp_result else None

            if gp_event_id and len(df_gp) > 0:
                # The GP 2025 sheet typically has columns like:
                # HotelName, RoomType, Date, RoomsReserved (or similar)
                # We'll try to map whatever columns exist
                gp_col_lower = {c.lower().strip().replace(' ', '_'): c for c in gp_cols}

                # Try to identify columns
                hotel_col = None
                room_col = None
                date_col = None
                reserved_col = None

                for key, orig in gp_col_lower.items():
                    if 'hotel' in key:
                        hotel_col = orig
                    elif 'room' in key and 'type' in key:
                        room_col = orig
                    elif 'date' in key or 'inventory' in key:
                        date_col = orig
                    elif 'reserved' in key or 'count' in key or 'rooms' in key:
                        if reserved_col is None:
                            reserved_col = orig

                if hotel_col and room_col:
                    for _, grow in df_gp.iterrows():
                        raw_hotel = safe_str(grow.get(hotel_col))
                        if raw_hotel is None:
                            continue
                        normalized_hotel = normalize_hotel_name(raw_hotel)
                        h_id = hotels_seen.get(normalized_hotel)

                        # If hotel not in our list, insert it
                        if h_id is None and normalized_hotel:
                            cur.execute(
                                "INSERT INTO hotels (hotel_name) VALUES (%s) RETURNING hotel_id",
                                (normalized_hotel,)
                            )
                            h_id = cur.fetchone()[0]
                            hotels_seen[normalized_hotel] = h_id

                        if h_id is None:
                            continue

                        raw_room = safe_str(grow.get(room_col))
                        canonical_room = normalize_room_type(raw_room) if raw_room else 'Unknown'
                        rt_id = room_type_ids.get(canonical_room, room_type_ids['Unknown'])

                        inv_date = safe_date(grow.get(date_col)) if date_col else datetime.now()
                        rooms_reserved = safe_int(grow.get(reserved_col), 0) if reserved_col else 0

                        inventory_rows.append((
                            h_id, rt_id, gp_event_id, inv_date or datetime.now(), rooms_reserved
                        ))

                    if inventory_rows:
                        execute_values(
                            cur,
                            """INSERT INTO hotel_room_inventory (hotel_id, room_type_id,
                                   event_id, inventory_date, rooms_reserved)
                               VALUES %s""",
                            inventory_rows,
                            page_size=500
                        )
                    conn.commit()
                    progress(f"  Inserted {len(inventory_rows)} inventory records")
                else:
                    progress("  WARNING: Could not identify required columns in GP 2025 sheet")
                    progress(f"  Available columns: {gp_cols}")
            else:
                if gp_event_id is None:
                    progress("  WARNING: No GP 2025 event found in data, skipping inventory")
                else:
                    progress("  No inventory data rows found")

        except ValueError as e:
            progress(f"  WARNING: GP 2025 sheet not found in XLSX: {e}")
        except Exception as e:
            progress(f"  WARNING: Error reading GP 2025 sheet: {e}")

        # -------------------------------------------------------------------
        # Step 15: Insert data_quality_log entries
        # -------------------------------------------------------------------
        progress("Inserting data quality log entries...")
        if quality_logs:
            execute_values(
                cur,
                """INSERT INTO data_quality_log (source_sheet, source_row,
                       column_name, issue_type, original_value,
                       imputed_value, resolution)
                   VALUES %s""",
                quality_logs,
                page_size=2000
            )
        conn.commit()
        progress(f"  Inserted {len(quality_logs)} quality log entries")

        # -------------------------------------------------------------------
        # Summary
        # -------------------------------------------------------------------
        elapsed = time.time() - start_time
        progress("=" * 60)
        progress("ETL COMPLETE")
        progress(f"  Time elapsed: {elapsed:.1f}s")
        progress(f"  Event types:  {len(EVENT_TYPES)}")
        progress(f"  Zones:        {len(ZONES)}")
        progress(f"  Room types:   {len(ROOM_TYPES)}")
        progress(f"  Events:       {len(event_rows)}")
        progress(f"  Families:     {len(family_rows)}")
        progress(f"  Hotels:       {len(hotel_insert_rows)}")
        progress(f"  Aliases:      {len(alias_rows)}")
        progress(f"  Members:      {len(member_rows)}")
        progress(f"  Addresses:    {len(addr_rows)}")
        progress(f"  Attendance:   {len(attendance_rows)}")
        progress(f"  Bookings:     {len(booking_rows)}")
        progress(f"  Gnan records: {len(gnan_rows)}")
        progress(f"  Quality logs: {len(quality_logs)}")
        progress("=" * 60)

    except Exception as e:
        conn.rollback()
        progress(f"ERROR: ETL failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    run_etl()
