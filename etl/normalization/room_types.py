"""Normalize room type strings to canonical types using mapping file."""

import json
import os

_room_type_map = None


def _load_map():
    """Load the room type mapping JSON file."""
    global _room_type_map
    if _room_type_map is not None:
        return _room_type_map

    map_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'mappings',
        'room_type_map.json'
    )
    with open(map_path, 'r') as f:
        raw_map = json.load(f)

    # Build a lowercase lookup: raw_name_lower -> canonical_name
    _room_type_map = {}
    for canonical_name, raw_names in raw_map.items():
        for raw_name in raw_names:
            _room_type_map[raw_name.lower().strip()] = canonical_name

    return _room_type_map


def normalize_room_type(raw_value):
    """
    Normalize a raw room type string to a canonical room type.

    Args:
        raw_value: Raw room type string from the XLSX data.

    Returns:
        str: Canonical room type name, or 'Unknown' if not matched.
    """
    if raw_value is None:
        return 'Unknown'

    if not isinstance(raw_value, str):
        raw_value = str(raw_value)

    lookup = _load_map()
    key = raw_value.lower().strip()

    if key in lookup:
        return lookup[key]

    return 'Unknown'
