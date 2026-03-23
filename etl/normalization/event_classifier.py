"""Classify events based on event name using regex patterns."""

import json
import os
import re

_event_type_map = None
_zone_map = None


def _load_event_type_map():
    """Load the event type classification patterns."""
    global _event_type_map
    if _event_type_map is not None:
        return _event_type_map

    map_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'mappings',
        'event_type_map.json'
    )
    with open(map_path, 'r') as f:
        _event_type_map = json.load(f)
    return _event_type_map


def _load_zone_map():
    """Load the state-to-zone mapping."""
    global _zone_map
    if _zone_map is not None:
        return _zone_map

    map_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'mappings',
        'zone_map.json'
    )
    with open(map_path, 'r') as f:
        _zone_map = json.load(f)
    return _zone_map


def classify_event_type(event_name):
    """
    Classify an event name into one of the canonical event types.

    Types: Gurupurnima, Satsang, Retreat, Youth Camp, Shibir,
           Learning, Cruise, Virtual, Other

    Args:
        event_name: The raw event name string.

    Returns:
        str: The classified event type name.
    """
    if not event_name or not isinstance(event_name, str):
        return 'Other'

    name = event_name.strip()
    type_map = _load_event_type_map()

    for type_name, patterns in type_map.items():
        for pattern in patterns:
            if re.search(pattern, name, re.IGNORECASE):
                return type_name

    return 'Other'


def classify_zone(event_name):
    """
    Extract zone from an event name based on state/region mentions.

    Zones: North East, South East, South Central, North Central,
           West Coast, Canada, International

    Args:
        event_name: The raw event name string.

    Returns:
        str or None: The zone name, or None if not determinable.
    """
    if not event_name or not isinstance(event_name, str):
        return None

    name = event_name.strip()
    zone_map = _load_zone_map()

    # Check for direct zone mentions in event name
    zone_patterns = {
        'North East': [r'\bNE\b', r'\bNorth\s*East\b', r'\bNortheast\b'],
        'South East': [r'\bSE\b', r'\bSouth\s*East\b', r'\bSoutheast\b'],
        'South Central': [r'\bSC\b', r'\bSouth\s*Central\b'],
        'North Central': [r'\bNC\b', r'\bNorth\s*Central\b', r'\bNorthcentral\b'],
        'West Coast': [r'\bWC\b', r'\bWest\s*Coast\b'],
        'Canada': [r'\bCanada\b', r'\bToronto\b', r'\bOntario\b'],
        'International': [r'\bInternational\b', r'\bIndia\b', r'\bUK\b', r'\bEurope\b'],
    }

    for zone_name, patterns in zone_patterns.items():
        for pattern in patterns:
            if re.search(pattern, name, re.IGNORECASE):
                return zone_name

    # Check for state abbreviations or names in the event name
    for state, zone_name in zone_map.items():
        # Match state names or abbreviations in the event name
        state_pattern = r'\b' + re.escape(state) + r'\b'
        if re.search(state_pattern, name, re.IGNORECASE):
            return zone_name

    return None


def detect_virtual(event_name):
    """
    Detect if an event is virtual based on its name.

    Args:
        event_name: The raw event name string.

    Returns:
        bool: True if the event appears to be virtual.
    """
    if not event_name or not isinstance(event_name, str):
        return False

    return bool(re.search(
        r'\b(virtual|online|zoom|webinar|livestream|live\s*stream|e-satsang|esatsang)\b',
        event_name,
        re.IGNORECASE
    ))


def detect_gnanvidhi(event_name):
    """
    Detect if an event includes Gnanvidhi based on its name.

    Args:
        event_name: The raw event name string.

    Returns:
        bool: True if the event appears to include Gnanvidhi.
    """
    if not event_name or not isinstance(event_name, str):
        return False

    return bool(re.search(
        r'\b(gnanvidhi|gnan\s*vidhi|gnan[-\s]?vidhi|GV)\b',
        event_name,
        re.IGNORECASE
    ))


def classify_target_demographic(event_name):
    """
    Classify the target demographic of an event based on its name.

    Demographics: General, Youth, WMHT, DMHT, MMHT, YMHT, Y+, Sevarthi

    Args:
        event_name: The raw event name string.

    Returns:
        str: The target demographic.
    """
    if not event_name or not isinstance(event_name, str):
        return 'General'

    name = event_name.strip()

    # Order matters: check more specific patterns first
    demographic_patterns = {
        'WMHT': [r'\bWMHT\b', r'\bWomen\s*MHT\b'],
        'DMHT': [r'\bDMHT\b'],
        'MMHT': [r'\bMMHT\b', r'\bMen\s*MHT\b'],
        'YMHT': [r'\bYMHT\b', r'\bYoung\s*MHT\b'],
        'Y+': [r'\bY\+\b', r'\bYplus\b', r'\bY\s*Plus\b'],
        'Sevarthi': [r'\bSevarthi\b', r'\bSevarth\b'],
        'Youth': [r'\bYouth\b', r'\bYuva\b', r'\bKids\b', r'\bChildren\b',
                  r'\bTeen\b', r'\bBal\b', r'\bKishor\b'],
    }

    for demographic, patterns in demographic_patterns.items():
        for pattern in patterns:
            if re.search(pattern, name, re.IGNORECASE):
                return demographic

    return 'General'


def classify_event(event_name):
    """
    Fully classify an event based on its name.

    Args:
        event_name: The raw event name string.

    Returns:
        dict: Classification with keys:
            - event_type: str
            - zone: str or None
            - is_virtual: bool
            - has_gnanvidhi: bool
            - target_demographic: str
    """
    return {
        'event_type': classify_event_type(event_name),
        'zone': classify_zone(event_name),
        'is_virtual': detect_virtual(event_name),
        'has_gnanvidhi': detect_gnanvidhi(event_name),
        'target_demographic': classify_target_demographic(event_name),
    }
